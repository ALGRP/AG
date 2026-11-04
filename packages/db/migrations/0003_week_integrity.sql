-- QA-F4 / W group: week chronology and closed-ledger immutability.
-- LOCAL_ONLY migration candidate; do not run on production or shared staging CRS.
-- Existing 0001 writes the week row and statement entries in one closing transaction.
-- A scoped platform closer may write entries while its week row was created in the
-- SAME transaction; a later transaction must not modify an already closed week.
-- This is an isolated candidate, NOT a production-ready CRS release (SEL-331).
BEGIN;

CREATE FUNCTION ag_f4_week_start(p_week text) RETURNS timestamptz
LANGUAGE plpgsql STABLE AS $$
DECLARE
  y integer; w integer; jan4 date; first_monday date; start_day date;
BEGIN
  IF p_week IS NULL OR p_week !~ '^[0-9]{4}-W[0-9]{2}$' THEN
    RAISE EXCEPTION 'AG_F4_WEEK_INVALID: %', p_week USING ERRCODE = '23514';
  END IF;
  y := substring(p_week, 1, 4)::integer;
  w := substring(p_week, 7, 2)::integer;
  IF y < 1 OR w < 1 OR w > 53 THEN
    RAISE EXCEPTION 'AG_F4_WEEK_INVALID: %', p_week USING ERRCODE = '23514';
  END IF;
  jan4 := make_date(y, 1, 4);
  first_monday := jan4 - (extract(isodow from jan4)::integer - 1);
  start_day := first_monday + (w - 1) * 7;
  IF extract(isoyear from start_day)::integer <> y OR extract(week from start_day)::integer <> w THEN
    RAISE EXCEPTION 'AG_F4_WEEK_INVALID: non-existent ISO week %', p_week USING ERRCODE = '23514';
  END IF;
  RETURN (start_day::timestamp AT TIME ZONE 'Europe/Istanbul');
END $$;

CREATE FUNCTION ag_f4_iso_week(p_when timestamptz) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT to_char(p_when AT TIME ZONE 'Europe/Istanbul', 'IYYY-"W"IW')
$$;

CREATE FUNCTION ag_f4_next_week(p_week text) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT ag_f4_iso_week(ag_f4_week_start(p_week) + interval '7 days')
$$;

CREATE FUNCTION ag_f4_validate_closed_week() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected_start timestamptz; previous_week text; earliest_activity text;
BEGIN
  expected_start := ag_f4_week_start(NEW.week_id); -- rejects invalid ISO dates, including W53 in 2027
  IF NEW.period_start IS DISTINCT FROM expected_start
      OR NEW.period_end IS DISTINCT FROM (expected_start + interval '7 days')
      OR NEW.payment_due IS DISTINCT FROM (expected_start + interval '8 days 18 hours') THEN
    RAISE EXCEPTION 'AG_F4_WEEK_PERIOD_MISMATCH: %', NEW.week_id USING ERRCODE = '23514';
  END IF;

  -- Reject impossibly distant future weeks even before order checks, with the correct
  -- "not finished" reason. Chronological ordering is checked next for nearer weeks.
  IF NEW.period_end > clock_timestamp() + interval '1 year' THEN
    RAISE EXCEPTION 'AG_F4_WEEK_NOT_FINISHED: %', NEW.week_id USING ERRCODE = '23514';
  END IF;

  SELECT max(week_id) INTO previous_week FROM settlement_week;
  IF previous_week IS NOT NULL AND NEW.week_id <> ag_f4_next_week(previous_week) THEN
    RAISE EXCEPTION 'AG_F4_WEEK_OUT_OF_ORDER: expected %, got %',
      ag_f4_next_week(previous_week), NEW.week_id USING ERRCODE = '23514';
  ELSIF previous_week IS NULL THEN
    -- Bootstrap first week at actual earliest activity, not arbitrary empty historical weeks.
    SELECT min(ag_f4_iso_week(a.activity)) INTO earliest_activity FROM (
      SELECT created_at AS activity FROM booking WHERE NOT is_test
      UNION ALL SELECT completed_at FROM booking WHERE completed_at IS NOT NULL AND NOT is_test
      UNION ALL SELECT at FROM booking_money_event
    ) a;
    IF earliest_activity IS NOT NULL AND NEW.week_id <> earliest_activity THEN
      RAISE EXCEPTION 'AG_F4_FIRST_ACTIVE_WEEK: expected %, got %',
        earliest_activity, NEW.week_id USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.period_end > clock_timestamp() OR NEW.closed_at < NEW.period_end THEN
    RAISE EXCEPTION 'AG_F4_WEEK_NOT_FINISHED: %', NEW.week_id USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ag_f4_week_guard BEFORE INSERT ON settlement_week
FOR EACH ROW EXECUTE FUNCTION ag_f4_validate_closed_week();

-- The 0001 model has NO separate open-week row. A valid close writes the week
-- and its settlement entries in ONE atomic transaction. A row that already
-- existed before the caller's transaction is *always closed* and immutable.
-- Only the platform role, with a transaction-local platform scope, may insert
-- entries against a week created by that exact transaction.
-- xmin is a 32-bit XID. Compare with current 64-bit transaction ID's low 32
-- bits. This compatibility guard is only for the disposable candidate.
CREATE FUNCTION ag_f4_entry_closed_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  same_transaction boolean;
BEGIN
  PERFORM ag_f4_week_start(NEW.week_id);
  SELECT (w.xmin::text::bigint = (txid_current() % 4294967296))
    INTO same_transaction
    FROM settlement_week w WHERE w.week_id = NEW.week_id;

  IF NOT COALESCE(same_transaction, false)
     OR current_user <> 'ag_platform'
     OR current_setting('app.scope', true) IS DISTINCT FROM 'platform' THEN
    RAISE EXCEPTION 'AG_F4_CLOSED_WEEK_ENTRY: %', NEW.week_id USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ag_f4_entry_guard BEFORE INSERT ON settlement_entry
FOR EACH ROW EXECUTE FUNCTION ag_f4_entry_closed_guard();

CREATE FUNCTION ag_f4_money_closed_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE w text;
BEGIN
  w := ag_f4_iso_week(NEW.at);
  IF EXISTS (SELECT 1 FROM settlement_week WHERE week_id = w AND NEW.at < closed_at) THEN
    RAISE EXCEPTION 'AG_F4_CLOSED_WEEK_MONEY_EVENT: %', w USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ag_f4_money_guard BEFORE INSERT ON booking_money_event
FOR EACH ROW EXECUTE FUNCTION ag_f4_money_closed_guard();

CREATE FUNCTION ag_f4_adjustment_week_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM ag_f4_week_start(NEW.week_id); -- reject impossible week IDs before any other check
  IF EXISTS (SELECT 1 FROM settlement_week WHERE week_id = NEW.week_id) THEN
    RAISE EXCEPTION 'AG_F4_CLOSED_WEEK_ADJUSTMENT: %', NEW.week_id USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ag_f4_adjustment_guard BEFORE INSERT ON settlement_adjustment
FOR EACH ROW EXECUTE FUNCTION ag_f4_adjustment_week_guard();

COMMIT;

-- QA-F4 M: customer money / cash receipt invariants, LOCAL_ONLY candidate.
-- Postgres 16 disposable databases ONLY. Do not run on staging / live CRS.
-- H-23/H-25/H-26 unchanged: noncash customer credit is NOT a money event.
BEGIN;

-- Retain database enforcement under simultaneous refunds. This is a SECURITY INVOKER
-- trigger; a trusted ag_platform transaction with RLS scope must do writes.
CREATE FUNCTION ag_f4_check_money_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  b booking%ROWTYPE;
  collected bigint;
  refunded bigint;
BEGIN
  -- The booking row is the concurrency lock. Two refunds for the same booking
  -- cannot both check the old collected balance and slip through together.
  SELECT * INTO b FROM booking WHERE id = NEW.booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'AG_F4_MONEY_BOOKING_MISSING: %', NEW.booking_id USING ERRCODE='23514';
  END IF;

  IF b.service_type = 'shuttle' AND NEW.kind = 'collection' AND NEW.collector <> 'supplier' THEN
    RAISE EXCEPTION 'AG_F4_SHUTTLE_COLLECTOR_NOT_SUPPLIER: %', NEW.booking_id USING ERRCODE='23514';
  END IF;

  IF NEW.kind = 'refund' THEN
    SELECT coalesce(sum(amount) FILTER (WHERE kind='collection'), 0)::bigint,
           coalesce(sum(amount) FILTER (WHERE kind='refund'), 0)::bigint
      INTO collected, refunded
      FROM booking_money_event WHERE booking_id = NEW.booking_id;
    IF refunded + NEW.amount > collected THEN
      RAISE EXCEPTION 'AG_F4_REFUND_EXCEEDS_COLLECTED: %', NEW.booking_id USING ERRCODE='23514';
    END IF;
  END IF;

  RETURN NEW;
END $$;
-- Trigger fires before 0003's closed-week guard by alphabetical name,
-- preventing an unrelated closed-week error from falsely passing Q12/Q13.
CREATE TRIGGER ag_f4_a_money_validation BEFORE INSERT ON booking_money_event
FOR EACH ROW EXECUTE FUNCTION ag_f4_check_money_event();

-- The booking cash totals are a DERIVED CACHE, never an independent source of money.
-- Direct edits must agree with the immutable append-only money-event ledger.
CREATE FUNCTION ag_f4_check_booking_cash_cache() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  collected bigint;
  refunded bigint;
BEGIN
  SELECT coalesce(sum(amount) FILTER (WHERE kind='collection'), 0)::bigint,
         coalesce(sum(amount) FILTER (WHERE kind='refund'), 0)::bigint
    INTO collected, refunded
    FROM booking_money_event WHERE booking_id = NEW.id;
  IF NEW.collected_amount IS DISTINCT FROM collected OR NEW.refunded_amount IS DISTINCT FROM refunded THEN
    RAISE EXCEPTION 'AG_F4_COLLECTED_AMOUNT_DRIFT: % expected %/% got %/%',
      NEW.id, collected, refunded, NEW.collected_amount, NEW.refunded_amount
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ag_f4_a_booking_cash_guard
BEFORE UPDATE OF collected_amount, refunded_amount ON booking
FOR EACH ROW EXECUTE FUNCTION ag_f4_check_booking_cash_cache();

-- QA-F8: one payer + one whitespace-/case-normalized bank receipt number.
-- The unique index is the concurrency backstop, the trigger supplies a stable
-- application-level error reason for nonconcurrent duplicates (Q16).
CREATE UNIQUE INDEX ag_f4_receipt_payer_reference_unique
  ON bank_receipt (payer_id, upper(regexp_replace(bank_reference, '\s', '', 'g')));

CREATE FUNCTION ag_f4_check_receipt_duplicate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM bank_receipt r
    WHERE r.payer_id = NEW.payer_id
      AND upper(regexp_replace(r.bank_reference, '\s', '', 'g'))
          = upper(regexp_replace(NEW.bank_reference, '\s', '', 'g'))
  ) THEN
    RAISE EXCEPTION 'AG_F4_RECEIPT_DUPLICATE: payer %', NEW.payer_id USING ERRCODE='23505';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ag_f4_receipt_duplicate_guard BEFORE INSERT ON bank_receipt
FOR EACH ROW EXECUTE FUNCTION ag_f4_check_receipt_duplicate();

COMMIT;

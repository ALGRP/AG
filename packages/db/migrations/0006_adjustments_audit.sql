-- QA-F4 / A + PR3-N4, PostgreSQL 16 LOCAL_ONLY migration candidate.
-- Evidence/authority protections for manual financial adjustments and cash cache inserts.
-- 0001-0005 stay untouched. NEVER apply to actual CRS, staging or live environments.
-- Existing adjustment rows require an approved backfill plan before this could migrate real data.
BEGIN;

-- PR3-N4: the existing trigger guards only UPDATE; reject fraudulent cash totals
-- provided on a newly inserted booking before any append-only money event exists.
CREATE TRIGGER ag_f4_a_booking_cash_insert_guard
BEFORE INSERT ON booking FOR EACH ROW
EXECUTE FUNCTION ag_f4_check_booking_cash_cache();

-- Audit facts are mandatory on EVERY new offset or dispute-decision adjustment.
-- The real actor/step-up proof will come from a trusted SEL-332 IdP adapter; a SQL
-- timestamp is evidence data, NOT standalone proof that an MFA challenge happened.
ALTER TABLE settlement_adjustment
  ADD COLUMN actor_id text NOT NULL,
  ADD COLUMN actor_role text NOT NULL,
  ADD COLUMN mfa_verified_at timestamptz NOT NULL,
  ADD CONSTRAINT ag_f4_adjustment_actor_id CHECK (length(btrim(actor_id)) >= 2),
  ADD CONSTRAINT ag_f4_adjustment_actor_role CHECK (actor_role IN ('admin', 'finance_manager')),
  ADD CONSTRAINT ag_f4_adjustment_reason CHECK (length(btrim(reason)) >= 5);

CREATE FUNCTION ag_f4_adjustment_audit_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  status_of_dispute text;
  disputed_week text;
  normalized_approval text;
BEGIN
  -- Run before the NOT NULL columns and 0003's closed-week guard so the
  -- original Q17/Q19 statements are rejected for the CORRECT rule.
  IF NEW.kind = 'offset' THEN
    normalized_approval := upper(regexp_replace(coalesce(NEW.written_approval_reference, ''), '[[:space:]]', '', 'g'));
    IF normalized_approval !~ '^[A-Z0-9./_-]{3,64}$' THEN
      RAISE EXCEPTION 'AG_F4_OFFSET_APPROVAL_REQUIRED: %', NEW.id USING ERRCODE='23514';
    END IF;
    NEW.written_approval_reference := normalized_approval;
  ELSIF NEW.kind = 'dispute_decision' THEN
    SELECT d.status, d.week_id
      INTO status_of_dispute, disputed_week
      FROM statement_dispute d WHERE d.id = NEW.dispute_id;
    IF status_of_dispute IS DISTINCT FROM 'accepted' OR
       disputed_week IS DISTINCT FROM NEW.original_week_id THEN
      RAISE EXCEPTION 'AG_F4_DISPUTE_NOT_ACCEPTED: %', NEW.dispute_id USING ERRCODE='23514';
    END IF;
  END IF;

  IF NEW.actor_id IS NULL OR length(btrim(NEW.actor_id)) < 2 OR
     NEW.actor_role IS NULL OR NEW.actor_role NOT IN ('admin', 'finance_manager') OR
     NEW.mfa_verified_at IS NULL OR NEW.mfa_verified_at > clock_timestamp() OR
     NEW.reason IS NULL OR length(btrim(NEW.reason)) < 5 THEN
    RAISE EXCEPTION 'AG_F4_ADJUSTMENT_AUDIT_REQUIRED: %', NEW.id USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

-- PostgreSQL fires same-event triggers alphabetically. The "_a_" guard checks
-- approval/dispute/audit semantics before "ag_f4_adjustment_guard" week checks.
CREATE TRIGGER ag_f4_a_adjustment_audit_guard
BEFORE INSERT ON settlement_adjustment
FOR EACH ROW EXECUTE FUNCTION ag_f4_adjustment_audit_guard();

COMMIT;

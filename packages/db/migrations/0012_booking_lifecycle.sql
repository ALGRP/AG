-- QA-F4/L (Q30): preserve the application booking lifecycle in PostgreSQL.
-- LOCAL_ONLY additive candidate. 0001..0011 remain unchanged; no staging/CRS.
BEGIN;

CREATE FUNCTION ag_f4_check_booking_status_transition() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- Rewriting the same status is not a transition: terminal bookings still
  -- accept notes, cash-cache updates and other independently validated edits.
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- Matches packages/core/src/booking.ts. Delivered/cancelled are terminal;
  -- no intermediate status can reopen a delivered booking for cancellation.
  IF (OLD.status = 'request' AND NEW.status IN ('quoted', 'confirmed', 'cancelled'))
     OR (OLD.status = 'quoted' AND NEW.status IN ('confirmed', 'cancelled'))
     OR (OLD.status = 'confirmed' AND NEW.status IN ('delivered', 'cancelled')) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'AG_F4_BOOKING_STATUS_TRANSITION_INVALID: booking % from % to %',
    OLD.id, OLD.status, NEW.status USING ERRCODE = '23514';
END $$;

-- Before the generic booking_settlement_guard: Q30 must report its precise
-- lifecycle cause, including attempts to clear settlement/completion fields.
CREATE TRIGGER ag_f4_a_booking_lifecycle_guard
BEFORE UPDATE OF status ON booking FOR EACH ROW
EXECUTE FUNCTION ag_f4_check_booking_status_transition();

COMMIT;

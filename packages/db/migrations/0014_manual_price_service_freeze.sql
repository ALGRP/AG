-- PR3-N10: bind the append-only manual approval to its priced service.
-- LOCAL_ONLY additive candidate; 0001..0013 unchanged. No numeric tariff decisions.
BEGIN;

CREATE FUNCTION ag_f4_check_manual_price_service_freeze() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.passengers IS DISTINCT FROM OLD.passengers
      OR NEW.route_code IS DISTINCT FROM OLD.route_code
      OR NEW.service_type IS DISTINCT FROM OLD.service_type)
     AND EXISTS (SELECT 1 FROM public.manual_price_approval WHERE booking_id = OLD.id) THEN
    RAISE EXCEPTION 'AG_F4_MANUAL_PRICE_SERVICE_IMMUTABLE: %', OLD.id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

-- The booking UPDATE already holds the row lock. 0013's approval insert locks
-- and refreshes the same row, so an old REPEATABLE READ snapshot cannot miss an
-- approval committed concurrently. Check the approval itself, not price_mode or
-- status: the service is frozen even before pricing and after cancellation.
-- Keep 0013's eligibility/frozen-price errors first; otherwise name N10 exactly.
CREATE TRIGGER ag_f4_c_manual_price_service_guard
BEFORE UPDATE ON booking FOR EACH ROW
EXECUTE FUNCTION ag_f4_check_manual_price_service_freeze();

-- The existing approval remains append-only and one per booking. A changed
-- service needs a new booking/approval; pre-delivery cancellation is unchanged.
COMMIT;

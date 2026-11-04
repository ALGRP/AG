-- QA-F4/P: pricing invariants, LOCAL_ONLY additive candidate.
-- 0001..0012 unchanged. H-22/K17 numeric bounds and K8 route decisions remain open.
BEGIN;

-- A one-based vector maps passenger counts 1..4 to strictly positive totals.
-- ALL alone would accept NULL elements through SQL's three-valued CHECK logic.
CREATE FUNCTION ag_f4_tariff_totals_positive(totals bigint[]) RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT NOT EXISTS (SELECT 1 FROM unnest(totals) AS n WHERE n IS NULL OR n <= 0)
$$;
ALTER TABLE shuttle_tariff_version
  ADD CONSTRAINT "AG_F4_TARIFF_AUTO_TOTAL_COUNT"
    CHECK (cardinality(totals_minor) BETWEEN 1 AND 4
      AND array_ndims(totals_minor) = 1 AND array_lower(totals_minor, 1) = 1),
  ADD CONSTRAINT "AG_F4_TARIFF_TOTAL_INVALID"
    CHECK (ag_f4_tariff_totals_positive(totals_minor));

-- Distinct from the application's price_frozen_at snapshot timestamp: this
-- latch records delivery/collection and cannot be cleared by later bookkeeping.
ALTER TABLE booking ADD COLUMN price_locked_at timestamptz;

CREATE FUNCTION ag_f4_check_manual_price_booking() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE b public.booking%ROWTYPE;
BEGIN
  -- The same booking-row lock is used by booking updates and money events.
  -- An approval cannot race a change to passenger count/product/price.
  SELECT * INTO b FROM public.booking WHERE id = NEW.booking_id FOR UPDATE;
  IF NOT FOUND OR b.service_type <> 'shuttle' OR b.passengers < 5
     OR b.status <> 'request' OR b.final_booking_price IS NOT NULL
     OR b.price_mode IS NOT NULL THEN
    RAISE EXCEPTION 'AG_F4_MANUAL_PRICE_BOOKING_INELIGIBLE: %', NEW.booking_id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ag_f4_manual_price_booking_guard
BEFORE INSERT ON manual_price_approval FOR EACH ROW
EXECUTE FUNCTION ag_f4_check_manual_price_booking();

CREATE FUNCTION ag_f4_check_booking_pricing() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  approved_price bigint;
  has_approval boolean;
  has_collection boolean;
  was_locked boolean := false;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.booking_money_event
    WHERE booking_id = NEW.id AND kind = 'collection') INTO has_collection;

  IF TG_OP = 'UPDATE' THEN
    -- Check OLD evidence as well as the append-only ledger, including a stale
    -- cash cache. Changing status/timestamps in this UPDATE cannot unlock price.
    was_locked := OLD.price_locked_at IS NOT NULL OR OLD.status = 'delivered'
      OR OLD.completed_at IS NOT NULL OR OLD.collected_at IS NOT NULL
      OR OLD.collected_amount > 0 OR OLD.settlement_week_id IS NOT NULL
      OR has_collection;
    IF was_locked AND (
         NEW.final_booking_price IS DISTINCT FROM OLD.final_booking_price
      OR NEW.currency IS DISTINCT FROM OLD.currency
      OR NEW.price_mode IS DISTINCT FROM OLD.price_mode
      OR NEW.price_source_version IS DISTINCT FROM OLD.price_source_version
      OR NEW.price_frozen_at IS DISTINCT FROM OLD.price_frozen_at
      OR NEW.policy_id IS DISTINCT FROM OLD.policy_id
      OR NEW.site_commission_amount IS DISTINCT FROM OLD.site_commission_amount
      OR NEW.agos_fee_amount IS DISTINCT FROM OLD.agos_fee_amount
      OR NEW.supplier_entitlement IS DISTINCT FROM OLD.supplier_entitlement
      OR NEW.service_type IS DISTINCT FROM OLD.service_type
      OR NEW.passengers IS DISTINCT FROM OLD.passengers
      OR NEW.route_code IS DISTINCT FROM OLD.route_code
      OR (OLD.price_locked_at IS NOT NULL AND
          NEW.price_locked_at IS DISTINCT FROM OLD.price_locked_at)) THEN
      RAISE EXCEPTION 'AG_F4_BOOKING_PRICE_FROZEN: %', OLD.id
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.service_type = 'shuttle' AND NEW.price_mode = 'FIXED_SHUTTLE'
     AND NEW.passengers > 4 THEN
    RAISE EXCEPTION 'AG_F4_SHUTTLE_AUTO_PRICE_PASSENGERS: %', NEW.id
      USING ERRCODE = '23514';
  END IF;

  SELECT new_price_minor INTO approved_price FROM public.manual_price_approval
    WHERE booking_id = NEW.id;
  has_approval := FOUND;
  IF (has_approval OR NEW.price_mode = 'SHUTTLE_MANUAL_APPROVED')
     AND (NEW.service_type <> 'shuttle' OR NEW.passengers < 5) THEN
    RAISE EXCEPTION 'AG_F4_MANUAL_PRICE_BOOKING_INELIGIBLE: %', NEW.id
      USING ERRCODE = '23514';
  END IF;

  -- An unpriced 5+ request can exist before its approval. Pricing it requires
  -- that same booking's approval and exact amount; NULL/SITE_PRICE cannot bypass.
  IF NEW.price_mode = 'SHUTTLE_MANUAL_APPROVED'
     OR (NEW.service_type = 'shuttle' AND NEW.passengers >= 5
         AND NEW.final_booking_price IS NOT NULL) THEN
    IF NEW.price_mode IS DISTINCT FROM 'SHUTTLE_MANUAL_APPROVED'
       OR NOT has_approval OR NEW.final_booking_price IS DISTINCT FROM approved_price THEN
      RAISE EXCEPTION 'AG_F4_MANUAL_PRICE_APPROVAL_REQUIRED: %', NEW.id
        USING ERRCODE = '23514';
    END IF;
  END IF;

  -- Retain evidence across two-step attempts to clear completion fields. Do not
  -- freeze cash caches, refunds, notes or the first NULL->supplier assignment.
  IF was_locked OR NEW.status = 'delivered' OR NEW.completed_at IS NOT NULL
     OR NEW.collected_at IS NOT NULL OR NEW.collected_amount > 0
     OR NEW.settlement_week_id IS NOT NULL OR has_collection THEN
    IF TG_OP = 'UPDATE' THEN
      NEW.price_locked_at := coalesce(OLD.price_locked_at, clock_timestamp());
    ELSE
      NEW.price_locked_at := clock_timestamp();
    END IF;
  ELSE
    NEW.price_locked_at := NULL;
  END IF;
  RETURN NEW;
END $$;
-- Keep lifecycle/attribution/cash error priority; precede the legacy settlement
-- guard so Q29 has an exact pricing reason, independent of settlement state.
CREATE TRIGGER ag_f4_b_booking_pricing_guard
BEFORE INSERT OR UPDATE ON booking FOR EACH ROW
EXECUTE FUNCTION ag_f4_check_booking_pricing();

-- A row lock alone is insufficient under REPEATABLE READ: a later booking
-- update could still see a snapshot without the just-committed approval/event.
-- Touch the booking version in the SAME transaction. READ COMMITTED sees the
-- new evidence; an older repeatable snapshot receives a serialization failure.
-- For collections the booking guard also persists the price-lock timestamp.
CREATE FUNCTION ag_f4_refresh_booking_pricing() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.booking SET price_locked_at = price_locked_at WHERE id = NEW.booking_id;
  RETURN NEW;
END $$;
CREATE TRIGGER ag_f4_manual_price_booking_refresh
AFTER INSERT ON manual_price_approval FOR EACH ROW
EXECUTE FUNCTION ag_f4_refresh_booking_pricing();
CREATE TRIGGER ag_f4_collection_price_lock
AFTER INSERT ON booking_money_event FOR EACH ROW WHEN (NEW.kind = 'collection')
EXECUTE FUNCTION ag_f4_refresh_booking_pricing();

COMMIT;

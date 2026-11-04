-- PR3-N9: preserve a historical own-fleet booking after later verification revocation.
-- LOCAL_ONLY additive candidate, 0001-0010 unchanged, no staging/CRS deployment.
BEGIN;

CREATE OR REPLACE FUNCTION ag_f4_check_booking_attribution() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  site_owner text;
  self_verified_at timestamptz;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT s.owner_party_id, s.self_operation_verified_at
      INTO site_owner, self_verified_at
      FROM site s WHERE s.id = NEW.selling_site_id;
    IF NOT FOUND OR NEW.selling_party_id IS DISTINCT FROM site_owner THEN
      RAISE EXCEPTION 'AG_F4_BOOKING_SELLING_PARTY_MISMATCH: site % party %', NEW.selling_site_id, NEW.selling_party_id
        USING ERRCODE = '23514';
    END IF;
  ELSE
    -- NULL -> supplier is the only attribution assignment allowed after INSERT.
    -- IS DISTINCT FROM also rejects clearing an already assigned supplier.
    IF NEW.selling_site_id IS DISTINCT FROM OLD.selling_site_id
       OR NEW.selling_party_id IS DISTINCT FROM OLD.selling_party_id
       OR (OLD.supplier_id IS NOT NULL AND NEW.supplier_id IS DISTINCT FROM OLD.supplier_id) THEN
      RAISE EXCEPTION 'AG_F4_BOOKING_ATTRIBUTION_IMMUTABLE: %', OLD.id
        USING ERRCODE = '23514';
    END IF;
    -- Only a first supplier assignment can require a NEW current site verification.
    -- A historical self-supplied booking must remain editable after a site
    -- loses its own-fleet verification; its original economic attribution is frozen.
    IF OLD.supplier_id IS NULL AND NEW.supplier_id IS NOT NULL THEN
      SELECT s.self_operation_verified_at INTO self_verified_at
        FROM site s WHERE s.id = NEW.selling_site_id;
    END IF;
  END IF;

  IF NEW.supplier_id IS NOT NULL AND NOT ag_f4_supplier_id_is_canonical(NEW.supplier_id) THEN
    RAISE EXCEPTION 'AG_F4_BOOKING_SUPPLIER_ID_NOT_CANONICAL: %', NEW.supplier_id
      USING ERRCODE = '23514';
  END IF;

  IF NEW.supplier_id IS NOT NULL AND NEW.supplier_id = NEW.selling_party_id
     AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.supplier_id IS NULL))
     AND (self_verified_at IS NULL OR self_verified_at > clock_timestamp()) THEN
    RAISE EXCEPTION 'AG_F4_BOOKING_SELF_SUPPLY_UNVERIFIED: %', NEW.selling_site_id
      USING ERRCODE = '23514';
  END IF;

  IF NEW.service_type IN ('private','vip')
     AND NEW.supplier_entitlement IS NOT NULL
     AND (NEW.final_booking_price IS NULL OR
          NEW.supplier_entitlement < 0 OR
          NEW.supplier_entitlement > NEW.final_booking_price OR
          NEW.site_commission_amount IS NULL OR
          NEW.site_commission_amount < 0) THEN
    RAISE EXCEPTION 'AG_F4_PRIVATE_SUPPLIER_EXCEEDS_PRICE: %', NEW.id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END $$;


-- The original 0001 trigger runs as well and must follow the same historical
-- supplier verification rule; otherwise old bookings remain falsely locked.
CREATE OR REPLACE FUNCTION booking_settlement_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  p split_policy%ROWTYPE;
  exp_site bigint;
  exp_agos bigint;
  exp_supplier bigint;
  verified timestamptz;
BEGIN
  -- Verify current authorization only on new booking or the FIRST NULL->supplier
  -- assignment. An older booking retains its recorded attribution when a site's
  -- self-operation authorization is later withdrawn.
  IF NEW.supplier_id IS NOT NULL AND NEW.supplier_id = NEW.selling_party_id
     AND (TG_OP = 'INSERT' OR
          (TG_OP = 'UPDATE' AND OLD.supplier_id IS NULL)) THEN
    SELECT self_operation_verified_at INTO verified FROM site WHERE id = NEW.selling_site_id;
    IF verified IS NULL OR verified > clock_timestamp() THEN
      RAISE EXCEPTION 'site % is not verified for self-operation', NEW.selling_site_id;
    END IF;
  END IF;
  IF NEW.service_type = 'shuttle' AND NEW.supplier_entitlement IS NOT NULL THEN
    SELECT * INTO p FROM split_policy WHERE id = NEW.policy_id AND status = 'approved';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'shuttle booking % needs an approved split policy', NEW.id;
    END IF;
    exp_supplier := NEW.final_booking_price * p.carrier_bps / 10000;
    exp_site := NEW.final_booking_price * p.partner_bps / 10000;
    exp_agos := NEW.final_booking_price - exp_supplier - exp_site;
    IF NEW.supplier_id = NEW.selling_party_id THEN
      exp_supplier := exp_supplier + exp_site;
      exp_site := 0;
    END IF;
    IF NEW.site_commission_amount <> exp_site OR NEW.agos_fee_amount <> exp_agos OR NEW.supplier_entitlement <> exp_supplier THEN
      RAISE EXCEPTION 'shuttle split of booking % does not match policy % (expected %/%/%)', NEW.id, p.id, exp_site, exp_agos, exp_supplier;
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    -- Tahsilatçı ve ilk tahsilat yöntemi değişmez (kısmi tahsilatlar booking_money_event'te ayrı kayıt).
    IF OLD.collection_method IS NOT NULL AND (NEW.collection_method IS DISTINCT FROM OLD.collection_method
         OR NEW.collector IS DISTINCT FROM OLD.collector OR NEW.collected_at IS DISTINCT FROM OLD.collected_at) THEN
      RAISE EXCEPTION 'collector and first collection of booking % are fixed', OLD.id;
    END IF;
    IF NEW.refunded_amount < OLD.refunded_amount THEN
      RAISE EXCEPTION 'refunds of booking % cannot be reduced', OLD.id;
    END IF;
    -- Son hesap haftası yalnız ileri gider (yeni tahsilat/iade farkı sonraki haftaya yazılır; eski hafta değişmez).
    IF OLD.settlement_week_id IS NOT NULL AND (NEW.settlement_week_id IS NULL OR NEW.settlement_week_id < OLD.settlement_week_id) THEN
      RAISE EXCEPTION 'settlement week of booking % can only move forward', OLD.id;
    END IF;
    IF OLD.settlement_week_id IS NOT NULL AND (
         NEW.final_booking_price IS DISTINCT FROM OLD.final_booking_price
      OR NEW.currency IS DISTINCT FROM OLD.currency
      OR NEW.site_commission_amount IS DISTINCT FROM OLD.site_commission_amount
      OR NEW.agos_fee_amount IS DISTINCT FROM OLD.agos_fee_amount
      OR NEW.supplier_entitlement IS DISTINCT FROM OLD.supplier_entitlement
      OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id
      OR NEW.selling_site_id IS DISTINCT FROM OLD.selling_site_id
      OR NEW.selling_party_id IS DISTINCT FROM OLD.selling_party_id
      OR NEW.service_type IS DISTINCT FROM OLD.service_type
      OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
      OR NEW.policy_id IS DISTINCT FROM OLD.policy_id) THEN
      RAISE EXCEPTION 'settled booking % is frozen (use an adjustment)', OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END $$;

COMMIT;

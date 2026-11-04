-- PR3-N7: booking attribution is fixed at creation, not at the current site owner.
-- LOCAL_ONLY candidate. 0001..0008 remain unchanged.
BEGIN;

CREATE FUNCTION ag_f4_supplier_id_is_canonical(value text) RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT value ~ '^[a-z0-9-]{2,64}$';
$$;

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
    -- Keep self-operation verification; do not rebind attribution to today's owner.
    SELECT s.self_operation_verified_at INTO self_verified_at
      FROM site s WHERE s.id = NEW.selling_site_id;
  END IF;

  IF NEW.supplier_id IS NOT NULL AND NOT ag_f4_supplier_id_is_canonical(NEW.supplier_id) THEN
    RAISE EXCEPTION 'AG_F4_BOOKING_SUPPLIER_ID_NOT_CANONICAL: %', NEW.supplier_id
      USING ERRCODE = '23514';
  END IF;

  IF NEW.supplier_id IS NOT NULL AND NEW.supplier_id = NEW.selling_party_id
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

COMMIT;

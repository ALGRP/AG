-- QA-F4 T: ownership, immutable attribution, verified own-fleet and private limits.
-- LOCAL_ONLY candidate. 0001..0007 unchanged, no real CRS/staging/production writes.
BEGIN;

-- Verified platform reads the authoritative site owner; ag_app remains excluded.
GRANT SELECT ON site TO ag_platform;

CREATE FUNCTION ag_f4_check_booking_attribution() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  site_owner text;
  self_verified_at timestamptz;
BEGIN
  SELECT s.owner_party_id, s.self_operation_verified_at
    INTO site_owner, self_verified_at
    FROM site s WHERE s.id = NEW.selling_site_id;
  IF NOT FOUND OR NEW.selling_party_id IS DISTINCT FROM site_owner THEN
    RAISE EXCEPTION 'AG_F4_BOOKING_SELLING_PARTY_MISMATCH: site % party %', NEW.selling_site_id, NEW.selling_party_id
      USING ERRCODE = '23514';
  END IF;

  -- Reject case-variant IDs before comparing the supplier with the actual site
  -- owner, preventing disguised self-supply (p1 vs P1). A credential or client
  -- header can never infer verified self-operation.
  IF NEW.supplier_id IS NOT NULL AND
     (NEW.supplier_id <> lower(NEW.supplier_id) OR NEW.supplier_id !~ '^[a-z0-9-]{2,64}$') THEN
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

-- Ensure these checks precede 0001 booking_settlement_guard so each original
-- QA-F4 T probe has its precise cause, not a generic split/constraint failure.
CREATE TRIGGER ag_f4_a_booking_attribution_guard
BEFORE INSERT OR UPDATE ON booking FOR EACH ROW
EXECUTE FUNCTION ag_f4_check_booking_attribution();

COMMIT;

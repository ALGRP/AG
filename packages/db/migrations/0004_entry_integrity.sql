-- QA-F4 E: money share entry integrity, LOCAL_ONLY candidate (PostgreSQL 16).
-- Reproduces CURRENT splitOnCollected JS rounding exactly. H-23 is UNDECIDED.
-- Never apply to the actual CRS, staging or production; SEL-331 human acceptance required.
BEGIN;

-- Read policy metadata through the restricted platform role (no write privilege).
GRANT SELECT ON split_policy TO ag_platform;

CREATE FUNCTION ag_f4_split_on_collected(
  p_service text, p_final bigint, p_collected bigint,
  p_selling_party text, p_supplier text, p_site_commission bigint, p_policy_id text
) RETURNS TABLE(site bigint, agos bigint, supplier bigint)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  c bigint;
  carrier_bps int;
  partner_bps int;
  carrier_share bigint;
  partner_share bigint;
  agos_share bigint;
  site_share bigint;
BEGIN
  IF p_final IS NULL OR p_final < 0 OR p_collected IS NULL THEN
    RAISE EXCEPTION 'AG_F4_ENTRY_INVALID_AMOUNT' USING ERRCODE = '23514';
  END IF;
  c := least(greatest(p_collected, 0::bigint), p_final);
  IF p_service = 'shuttle' THEN
    SELECT pol.carrier_bps, pol.partner_bps
      INTO carrier_bps, partner_bps
      FROM split_policy pol
      WHERE pol.id = p_policy_id AND pol.status = 'approved';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'AG_F4_ENTRY_POLICY_INVALID: %', p_policy_id USING ERRCODE = '23514';
    END IF;
    -- JavaScript: carrier = floor(c*carrierBps/10000); partner = floor(c*partnerBps/10000);
    -- platform is the remainder. Use numeric to avoid bigint multiplication overflow.
    carrier_share := floor(c::numeric * carrier_bps / 10000)::bigint;
    partner_share := floor(c::numeric * partner_bps / 10000)::bigint;
    agos_share := c - carrier_share - partner_share;
    IF p_selling_party = p_supplier THEN
      site := 0;
      agos := agos_share;
      supplier := carrier_share + partner_share;
    ELSE
      site := partner_share;
      agos := agos_share;
      supplier := carrier_share;
    END IF;
    RETURN NEXT;
    RETURN;
  ELSIF p_service IN ('private', 'vip') THEN
    -- The JS splitOnCollected() ignores the shuttle-policy parameter for private/VIP;
    -- entry policy integrity is enforced by the trigger, not the parity function.
    IF p_site_commission IS NULL OR p_site_commission < 0 OR p_site_commission > p_final THEN
      RAISE EXCEPTION 'AG_F4_ENTRY_INVALID_PRIVATE_SITE_SHARE' USING ERRCODE = '23514';
    END IF;
    site_share := CASE WHEN p_final = 0 THEN 0
      ELSE floor(c::numeric * p_site_commission / p_final)::bigint END;
    site := site_share;
    agos := 0;
    supplier := c - site_share;
    RETURN NEXT;
    RETURN;
  END IF;
  RAISE EXCEPTION 'AG_F4_ENTRY_UNKNOWN_PRODUCT: %', p_service USING ERRCODE = '23514';
END $$;

CREATE FUNCTION ag_f4_validate_entry_split() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  b booking%ROWTYPE;
  previous_base bigint;
  previous_site bigint;
  previous_agos bigint;
  previous_supplier bigint;
  from_site bigint;
  from_agos bigint;
  from_supplier bigint;
  to_site bigint;
  to_agos bigint;
  to_supplier bigint;
BEGIN
  SELECT * INTO b FROM booking WHERE id = NEW.booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'AG_F4_ENTRY_BOOKING_UNKNOWN: %', NEW.booking_id USING ERRCODE = '23514';
  END IF;
  IF NEW.currency IS DISTINCT FROM b.currency THEN
    RAISE EXCEPTION 'AG_F4_ENTRY_CURRENCY_MISMATCH: %', NEW.booking_id USING ERRCODE = '23514';
  END IF;
  IF b.final_booking_price IS NULL OR NEW.base_after > b.final_booking_price THEN
    RAISE EXCEPTION 'AG_F4_ENTRY_EXCEEDS_PRICE: %', NEW.booking_id USING ERRCODE = '23514';
  END IF;
  IF b.service_type <> 'shuttle' AND NEW.agos_delta <> 0 THEN
    RAISE EXCEPTION 'AG_F4_PRIVATE_AGOS_NONZERO: %', NEW.booking_id USING ERRCODE = '23514';
  END IF;
  IF b.service_type = 'shuttle' AND
     (b.policy_id IS NULL OR NEW.policy_id IS DISTINCT FROM b.policy_id OR
       NOT EXISTS (SELECT 1 FROM split_policy pol WHERE pol.id = NEW.policy_id AND pol.status = 'approved')) THEN
    RAISE EXCEPTION 'AG_F4_ENTRY_POLICY_INVALID: %', NEW.policy_id USING ERRCODE = '23514';
  END IF;
  IF b.service_type <> 'shuttle'
     AND NEW.policy_id NOT IN ('private-pro-rata-on-collection', 'private-site-set-entitlement', 'private-self-supplied') THEN
    RAISE EXCEPTION 'AG_F4_ENTRY_POLICY_INVALID: %', NEW.policy_id USING ERRCODE = '23514';
  END IF;

  -- Prior raw ledger is the source of truth. Cumulative collected_delta (not
  -- SUM(base_after)) is the previous balance; cancellation may return it to zero.
  SELECT coalesce(sum(e.collected_delta),0)::bigint,
         coalesce(sum(e.site_delta),0)::bigint,
         coalesce(sum(e.agos_delta),0)::bigint,
         coalesce(sum(e.supplier_delta),0)::bigint
  INTO previous_base, previous_site, previous_agos, previous_supplier
  FROM settlement_entry e
  WHERE e.booking_id = NEW.booking_id AND e.week_id < NEW.week_id;
  IF NEW.base_before <> previous_base THEN
    RAISE EXCEPTION 'AG_F4_ENTRY_BASE_MISMATCH: expected %, found % for %',
      previous_base, NEW.base_before, NEW.booking_id USING ERRCODE = '23514';
  END IF;

  IF NEW.kind = 'cancellation_reversal' THEN
    -- D-F06: cancel exactly the raw (possibly historically mismatched) shares.
    IF NEW.base_after <> 0 OR NEW.site_delta <> -previous_site
       OR NEW.agos_delta <> -previous_agos OR NEW.supplier_delta <> -previous_supplier THEN
      RAISE EXCEPTION 'AG_F4_ENTRY_REVERSAL_MISMATCH: %', NEW.booking_id USING ERRCODE = '23514';
    END IF;
  ELSE
    -- D-F05 / PKG-F05b: for prior share_mismatch, subsequent change is computed
    -- relative to the EXPECTED prior split, not the discrepant raw prior shares.
    SELECT s.site, s.agos, s.supplier INTO from_site, from_agos, from_supplier
      FROM ag_f4_split_on_collected(b.service_type::text, b.final_booking_price,
        NEW.base_before, b.selling_party_id, b.supplier_id,
        b.site_commission_amount, NEW.policy_id) s;
    SELECT s.site, s.agos, s.supplier INTO to_site, to_agos, to_supplier
      FROM ag_f4_split_on_collected(b.service_type::text, b.final_booking_price,
        NEW.base_after, b.selling_party_id, b.supplier_id,
        b.site_commission_amount, NEW.policy_id) s;
    IF NEW.site_delta <> to_site - from_site
       OR NEW.agos_delta <> to_agos - from_agos
       OR NEW.supplier_delta <> to_supplier - from_supplier THEN
      RAISE EXCEPTION 'AG_F4_ENTRY_SPLIT_MISMATCH: %', NEW.booking_id USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END $$;

-- Must execute BEFORE 0003's closed-week check so the original Q01/Q02/Q03/Q04/
-- Q10/Q11 probes fail for the *financial invariant*, not merely 'closed week'.
CREATE TRIGGER ag_f4_a_entry_rules
BEFORE INSERT ON settlement_entry FOR EACH ROW
EXECUTE FUNCTION ag_f4_validate_entry_split();

-- PR3-N3: once approved, the policy ID and its basis-point terms are immutable.
-- Future commercial changes require a NEW id; never mutate a frozen reference.
-- This is a trigger defense against accidental UPDATE/DELETE by the schema owner.
-- A PostgreSQL superuser can disable triggers and is OUTSIDE this trust boundary.
CREATE FUNCTION ag_f4_freeze_approved_policy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'approved' THEN
      RAISE EXCEPTION 'AG_F4_APPROVED_POLICY_IMMUTABLE: %', OLD.id USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'approved' THEN
    RAISE EXCEPTION 'AG_F4_APPROVED_POLICY_IMMUTABLE: %', OLD.id USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ag_f4_policy_freeze BEFORE UPDATE OR DELETE ON split_policy
FOR EACH ROW EXECUTE FUNCTION ag_f4_freeze_approved_policy();

CREATE FUNCTION ag_f4_policy_no_truncate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'AG_F4_APPROVED_POLICY_IMMUTABLE: bulk split policy removal forbidden' USING ERRCODE = '23514';
END $$;
CREATE TRIGGER ag_f4_policy_truncate BEFORE TRUNCATE ON split_policy
FOR EACH STATEMENT EXECUTE FUNCTION ag_f4_policy_no_truncate();

COMMIT;

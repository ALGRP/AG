-- PR3-N5 + PR3-N6; LOCAL_ONLY additive migration candidate (PostgreSQL 16).
-- H-25/H-23 and production MFA policy are NOT decided by this candidate.
-- 0001..0006 unchanged. No real CRS / staging / production rollout.
BEGIN;

-- PR3-N5: an adjustment ID/reference cannot be used twice through case or
-- whitespace variants. Existing raw UNIQUE is case-sensitive; this unique
-- expression index also enforces the invariant under concurrent transactions.
CREATE UNIQUE INDEX ag_f4_adjustment_reference_canonical_unique
  ON settlement_adjustment
  (upper(regexp_replace(adjustment_reference, '[[:space:]]', '', 'g')));

-- PR3-N6: reject stale, missing or future-supplied evidence. This only checks
-- timestamps, NOT the identity/MFA proof. Real challenge validation and
-- transaction binding belong in SEL-332, and a production freshness window
-- needs explicit security approval. The local candidate uses 15 minutes.
CREATE FUNCTION ag_f4_adjustment_freshness_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.mfa_verified_at IS NULL
    OR NEW.mfa_verified_at > clock_timestamp()
    OR NEW.mfa_verified_at < clock_timestamp() - interval '15 minutes' THEN
    RAISE EXCEPTION 'AG_F4_ADJUSTMENT_AUDIT_REQUIRED: stale or missing MFA timestamp for %', NEW.id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER ag_f4_ab_adjustment_freshness_guard
BEFORE INSERT ON settlement_adjustment FOR EACH ROW
EXECUTE FUNCTION ag_f4_adjustment_freshness_guard();

COMMIT;

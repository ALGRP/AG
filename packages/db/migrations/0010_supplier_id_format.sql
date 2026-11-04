-- PR3-N8: generated from packages/core/src/party-id.ts; do not edit by hand.
-- Regenerate this LOCAL_ONLY candidate with npm run db:generate-id-format.
-- After release, format changes require a new additive migration.
BEGIN;

CREATE OR REPLACE FUNCTION ag_f4_supplier_id_is_canonical(value text) RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT value ~ '^[a-z0-9_-]{1,64}$';
$$;

COMMIT;

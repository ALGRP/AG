import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PARTY_ID_PATTERN } from "../../core/src/party-id.ts";

export const ID_FORMAT_MIGRATION = new URL("../migrations/0010_supplier_id_format.sql", import.meta.url);

export function supplierIdMigration(): string {
  return `-- PR3-N8: generated from packages/core/src/party-id.ts; do not edit by hand.
-- Regenerate this LOCAL_ONLY candidate with npm run db:generate-id-format.
-- After release, format changes require a new additive migration.
BEGIN;

CREATE OR REPLACE FUNCTION ag_f4_supplier_id_is_canonical(value text) RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT value ~ '${PARTY_ID_PATTERN.replaceAll("'", "''")}';
$$;

COMMIT;
`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeFileSync(ID_FORMAT_MIGRATION, supplierIdMigration());
}

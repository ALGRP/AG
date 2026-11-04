import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import { ID_FORMAT_MIGRATION, supplierIdMigration } from "./generate-id-format.ts";

it("PR3-N8 SQL supplier-ID migration is generated from the application's single ID source", () => {
  assert.equal(readFileSync(ID_FORMAT_MIGRATION, "utf8"), supplierIdMigration(),
    "ID format drift: run npm run db:generate-id-format for this LOCAL_ONLY candidate");
});

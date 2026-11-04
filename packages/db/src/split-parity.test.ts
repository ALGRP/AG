// QA-F4 / E group acceptance (Codex Paket-03): the SQL share function must reproduce TODAY's application
// algorithm exactly (packages/core splitOnCollected). H-23 (rounding policy) stays OPEN: this test pins the
// current algorithm, it does not choose a policy. Disposable PostgreSQL 16 only:
//   AG_TEST_PG=1 AG_TEST_PG_ISOLATED=YES (optional AG_TEST_PG_CONTAINER)
// Contract for the candidate migration packages/db/migrations/0004_entry_integrity.sql:
//   ag_f4_split_on_collected(p_service text, p_final bigint, p_collected bigint, p_selling_party text,
//     p_supplier text, p_site_commission bigint, p_policy_id text) RETURNS TABLE(site bigint, agos bigint, supplier bigint)
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { after, before, describe, it } from "node:test";
import { SHUTTLE_SPLIT_V1, splitOnCollected } from "@ag/core";

const RUN = process.env.AG_TEST_PG === "1" && process.env.AG_TEST_PG_ISOLATED === "YES";
const CONTAINER = process.env.AG_TEST_PG_CONTAINER;
const ROOT = resolve(import.meta.dirname, "../../..");
const MIG = (n: string) => resolve(ROOT, "packages/db/migrations", n);
const M0004 = MIG("0004_entry_integrity.sql");

function psql(db: string, sql: string): { status: number | null; out: string } {
  const args = CONTAINER
    ? ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-X", "-q", "-At", "-d", db, "-v", "ON_ERROR_STOP=1", "-f", "-"]
    : ["-X", "-q", "-At", "-d", db, "-v", "ON_ERROR_STOP=1", "-f", "-"];
  const r = spawnSync(CONTAINER ? "docker" : "psql", args, { input: sql, encoding: "utf8", timeout: 120_000, maxBuffer: 64 * 1024 * 1024 });
  return { status: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
}

const CASES = [
  { name: "shuttle 100 EUR, outside supplier", service: "shuttle", final: 10000, site: "p1", supplier: "sup-a", siteCommission: 2000 },
  { name: "shuttle 49.99 EUR, outside supplier", service: "shuttle", final: 4999, site: "p1", supplier: "sup-a", siteCommission: 999 },
  { name: "shuttle 100 EUR, self-supplied (90/10)", service: "shuttle", final: 10000, site: "p1", supplier: "p1", siteCommission: 0 },
  { name: "private 80 EUR, site share 16 EUR", service: "private", final: 8000, site: "p1", supplier: "sup-p", siteCommission: 1600 },
] as const;

describe("QA-F4 E — SQL share function equals the application algorithm (disposable PG16 only)", {
  skip: RUN ? false : "AG_TEST_PG=1 + AG_TEST_PG_ISOLATED=YES required (NOT RUN)",
}, () => {
  const db = `ag_f4_split_${process.pid}`;
  let ready = false;
  before(() => {
    if (!RUN) return;
    assert.equal(psql("postgres", `CREATE DATABASE ${db};`).status, 0);
    for (const n of ["0001_network_core.sql", "0002_tenant_rls.sql", "0003_week_integrity.sql"]) {
      assert.equal(psql(db, readFileSync(MIG(n), "utf8")).status, 0, n);
    }
    if (existsSync(M0004)) ready = psql(db, readFileSync(M0004, "utf8")).status === 0;
  });
  after(() => {
    if (RUN) psql("postgres", `DROP DATABASE IF EXISTS ${db};`);
  });

  for (const c of CASES) {
    it(`E-PARITY [RULE] ${c.name}: every collected amount 0..price gives identical site/AGOS/supplier`, () => {
      assert.ok(ready, "0004_entry_integrity.sql missing or failed to apply");
      const sql = `SELECT g || ':' || s.site || ':' || s.agos || ':' || s.supplier
        FROM generate_series(0, ${c.final}) g,
        LATERAL ag_f4_split_on_collected('${c.service}', ${c.final}, g, '${c.site}', '${c.supplier}', ${c.siteCommission}, '${SHUTTLE_SPLIT_V1.id}') s
        ORDER BY g;`;
      const r = psql(db, sql);
      assert.equal(r.status, 0, r.out.slice(0, 500));
      const got = r.out.trim().split("\n");
      const line = { service_type: c.service, final_booking_price: c.final, currency: "EUR", selling_party_id: c.site, supplier_id: c.supplier, site_commission_amount: c.siteCommission } as const;
      const mismatches: string[] = [];
      for (let g = 0; g <= c.final; g++) {
        const s = splitOnCollected(line as any, g, SHUTTLE_SPLIT_V1);
        const want = `${g}:${s.site_commission_amount}:${s.agos_fee_amount}:${s.supplier_entitlement}`;
        if (got[g] !== want) mismatches.push(`${want} != ${got[g]}`);
        if (mismatches.length >= 5) break;
      }
      assert.deepEqual(mismatches, []);
    });
  }
});

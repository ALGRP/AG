// PR3-N3: an APPROVED split policy is frozen evidence. Bookings freeze only policy_id (not the bps), and 0004
// validates every new settlement entry against the CURRENT split_policy row. Editing an approved row therefore
// re-prices frozen bookings (wrong splits accepted, legitimate closes rejected). New terms need a new policy id.
// Disposable PostgreSQL 16 only: AG_TEST_PG=1 AG_TEST_PG_ISOLATED=YES (optional AG_TEST_PG_CONTAINER).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { after, before, describe, it } from "node:test";

const RUN = process.env.AG_TEST_PG === "1" && process.env.AG_TEST_PG_ISOLATED === "YES";
const CONTAINER = process.env.AG_TEST_PG_CONTAINER;
const ROOT = resolve(import.meta.dirname, "../../..");
const MIGRATIONS = ["0001_network_core", "0002_tenant_rls", "0003_week_integrity", "0004_entry_integrity"].map((n) =>
  readFileSync(resolve(ROOT, `packages/db/migrations/${n}.sql`), "utf8"));

function psql(db: string, sql: string): { status: number | null; out: string } {
  const args = CONTAINER
    ? ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-X", "-q", "-At", "-d", db, "-v", "ON_ERROR_STOP=1", "-f", "-"]
    : ["-X", "-q", "-At", "-d", db, "-v", "ON_ERROR_STOP=1", "-f", "-"];
  const r = spawnSync(CONTAINER ? "docker" : "psql", args, { input: sql, encoding: "utf8", timeout: 30_000 });
  return { status: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
}

describe("PR3-N3 approved split policy is immutable (disposable PG16 only)", {
  skip: RUN ? false : "AG_TEST_PG=1 + AG_TEST_PG_ISOLATED=YES required (NOT RUN)",
}, () => {
  const db = `ag_f4_pol_${process.pid}`;
  before(() => {
    if (!RUN) return;
    assert.equal(psql("postgres", `CREATE DATABASE ${db};`).status, 0);
    for (const sql of MIGRATIONS) assert.equal(psql(db, sql).status, 0);
  });
  after(() => {
    if (RUN) psql("postgres", `DROP DATABASE IF EXISTS ${db};`);
  });

  it("PR3-N3 [RULE] the bps of an approved policy cannot be changed, even by the table owner / migration role", { todo: "PR3-N3 · Codex Paket-03 (split_policy ekleme-yalnız)" }, () => {
    const r = psql(db, "UPDATE split_policy SET carrier_bps = 6000, partner_bps = 3000 WHERE id = 'shuttle-split-v1';");
    assert.notEqual(r.status, 0, "approved shuttle-split-v1 was re-priced in place");
    assert.equal(psql(db, "SELECT carrier_bps||'/'||partner_bps||'/'||platform_bps FROM split_policy WHERE id = 'shuttle-split-v1';").out.trim(), "7000/2000/1000");
  });

  it("PR3-N3 [RULE] an approved policy cannot be deleted", { todo: "PR3-N3 · Codex Paket-03 (split_policy ekleme-yalnız)" }, () => {
    const r = psql(db, "DELETE FROM split_policy WHERE id = 'shuttle-split-v1';");
    assert.notEqual(r.status, 0, "approved policy deleted");
  });
});

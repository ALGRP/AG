// Claude peer review of 41b73e6 (QA-F4/A): two defense-in-depth gaps found with original 0001-0006.
//  PR3-N5: settlement_adjustment.adjustment_reference is UNIQUE but case-sensitive, so the same offset can be stored
//          twice as 'OFS-…-ONAY-1' and 'ofs-…-onay-1' (the app normalizes since PR1-N2; the DB backstop does not).
//  PR3-N6: mfa_verified_at only has an upper bound (not in the future); 2FA evidence from 2019 is accepted.
// Disposable PostgreSQL 16 only: AG_TEST_PG=1 AG_TEST_PG_ISOLATED=YES (optional AG_TEST_PG_CONTAINER).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { after, before, describe, it } from "node:test";

const RUN = process.env.AG_TEST_PG === "1" && process.env.AG_TEST_PG_ISOLATED === "YES";
const CONTAINER = process.env.AG_TEST_PG_CONTAINER;
const ROOT = resolve(import.meta.dirname, "../../..");
const SOURCE = readFileSync(resolve(ROOT, "qa-independent/sql/qa_probes.sql"), "utf8");
const SETUP = SOURCE.slice(0, SOURCE.indexOf("\\echo SETUP_DONE"));

function psql(db: string, sql: string): { status: number | null; out: string } {
  const args = CONTAINER
    ? ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-X", "-q", "-At", "-d", db, "-v", "ON_ERROR_STOP=1", "-f", "-"]
    : ["-X", "-q", "-At", "-d", db, "-v", "ON_ERROR_STOP=1", "-f", "-"];
  const r = spawnSync(CONTAINER ? "docker" : "psql", args, { input: sql, encoding: "utf8", timeout: 30_000 });
  return { status: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
}

const offset = (ref: string, approval: string, mfaAt: string) => `BEGIN;
SET LOCAL ROLE ag_platform;
SET LOCAL app.scope = 'platform';
INSERT INTO settlement_adjustment (id, week_id, original_week_id, debtor_id, creditor_id, amount, currency, kind, reason,
  adjustment_reference, written_approval_reference, actor_id, actor_role, mfa_verified_at)
VALUES (gen_random_uuid(), '2026-W47', '2026-W45', 'agos', 'sup-a', 100, 'EUR', 'offset', 'Manual review approved',
  '${ref}', '${approval}', 'qa-fm', 'finance_manager', ${mfaAt});
COMMIT;`;

describe("QA-F4/A hardening (disposable PG16 only)", {
  skip: RUN ? false : "AG_TEST_PG=1 + AG_TEST_PG_ISOLATED=YES required (NOT RUN)",
}, () => {
  const db = `ag_f4a_hard_${process.pid}`;
  before(() => {
    if (!RUN) return;
    assert.equal(psql("postgres", `CREATE DATABASE ${db};`).status, 0);
    assert.equal(psql(db, readFileSync(resolve(ROOT, "packages/db/migrations/0001_network_core.sql"), "utf8")).status, 0);
    psql(db, SETUP.replace(/^\\.*$/gm, "")); // synthetic fixture setup only (no probes)
    for (const n of ["0002_tenant_rls", "0003_week_integrity", "0004_entry_integrity", "0005_money_events", "0006_adjustments_audit"]) {
      const m = psql(db, readFileSync(resolve(ROOT, `packages/db/migrations/${n}.sql`), "utf8"));
      assert.equal(m.status, 0, `${n}: ${m.out}`);
    }
  });
  after(() => {
    if (RUN) psql("postgres", `DROP DATABASE IF EXISTS ${db};`);
  });

  it("PR3-N5 [RULE] the same offset reference in another letter case is a duplicate", { todo: "PR3-N5 · Codex Paket-03 (adjustment_reference normalize UNIQUE)" }, () => {
    const first = psql(db, offset("OFS-2026-W45-ONAY-N5", "onay-n5", "clock_timestamp() - interval '1 minute'"));
    assert.equal(first.status, 0, first.out);
    const second = psql(db, offset("ofs-2026-w45-onay-n5", "onay-n5", "clock_timestamp() - interval '1 minute'"));
    assert.notEqual(second.status, 0, "case-variant duplicate offset stored");
  });

  it("PR3-N6 [RULE] 2FA evidence must be fresh (a 2019 timestamp is not evidence for a 2026 decision)", { todo: "PR3-N6 · Codex Paket-03 (mfa_verified_at tazelik penceresi)" }, () => {
    const r = psql(db, offset("OFS-2026-W45-ONAY-N6", "onay-n6", "'2019-01-01 00:00+00'"));
    assert.notEqual(r.status, 0, "stale 2FA evidence accepted");
    assert.match(r.out, /AG_F4_ADJUSTMENT_AUDIT_REQUIRED/);
  });
});

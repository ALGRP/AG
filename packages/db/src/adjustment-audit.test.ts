// QA-F4/A: positive/negative audit evidence for offsets and dispute decisions.
// Synthetic PG16 only. NEVER connect to staging or production.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { after, before, describe, it } from "node:test";

const RUN = process.env.AG_TEST_PG === "1" && process.env.AG_TEST_PG_ISOLATED === "YES";
const CONTAINER = process.env.AG_TEST_PG_CONTAINER;
const ROOT = resolve(import.meta.dirname, "../../..");
const FILE = resolve(ROOT, "qa-independent/sql/qa_probes.sql");
const SOURCE = readFileSync(FILE, "utf8");
const SETUP = SOURCE.slice(0, SOURCE.indexOf("\\echo SETUP_DONE") + "\\echo SETUP_DONE".length);

function psql(db: string, sql: string): { status: number | null; out: string } {
  const args = CONTAINER
    ? ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-X", "-q", "-At", "-d", db, "-v", "ON_ERROR_STOP=1", "-f", "-"]
    : ["-X", "-q", "-At", "-d", db, "-v", "ON_ERROR_STOP=1", "-f", "-"];
  const proc = spawnSync(CONTAINER ? "docker" : "psql", args, { input: sql, encoding: "utf8", timeout: 30_000 });
  return { status: proc.status, out: (proc.stdout ?? "") + (proc.stderr ?? "") };
}

const scope = (sql: string) => ["BEGIN;", "SET LOCAL ROLE ag_platform;", "SET LOCAL app.scope='platform';", sql, "COMMIT;"].join("\n");
const actorFields = "actor_id, actor_role, mfa_verified_at";
const actorValues = "'qa-finance-manager','finance_manager',clock_timestamp() - interval '2 minutes'";
const adjustmentSql = (id: string, kind: string, extraColumns: string, extraValues: string) =>
  "INSERT INTO settlement_adjustment (id,week_id,original_week_id,debtor_id,creditor_id,amount,currency,kind,reason,adjustment_reference," +
  extraColumns + ") VALUES ('" + id + "','2026-W47','2026-W45','agos','sup-a',100,'EUR','" + kind +
  "','Manual review approved','REF-" + id.slice(-8) + "'," + extraValues + ");";

describe("QA-F4/A adjustments require human audit columns (disposable PG16 only)", {
  skip: RUN ? false : "AG_TEST_PG=1 + AG_TEST_PG_ISOLATED=YES required (NOT RUN)",
}, () => {
  const db = "ag_f4a_audit_" + process.pid;
  before(() => {
    if (!RUN) return;
    const created = psql("postgres", "CREATE DATABASE " + db + ";");
    assert.equal(created.status, 0, created.out);
    const m1 = psql(db, readFileSync(resolve(ROOT, "packages/db/migrations/0001_network_core.sql"), "utf8"));
    assert.equal(m1.status, 0, m1.out);
    const fixture = psql(db, SETUP);
    assert.equal(fixture.status, 0, fixture.out);
    for (const name of ["0002_tenant_rls", "0003_week_integrity", "0004_entry_integrity",
      "0005_money_events", "0006_adjustments_audit"]) {
      const migration = psql(db, readFileSync(resolve(ROOT, "packages/db/migrations/" + name + ".sql"), "utf8"));
      assert.equal(migration.status, 0, name + ": " + migration.out);
    }
  });
  after(() => {
    if (RUN) assert.equal(psql("postgres", "DROP DATABASE IF EXISTS " + db + ";").status, 0);
  });

  it("accepted offset with 2FA timestamp and written consent passes, reference canonicalized, immutable after insert", () => {
    const id = "00000000-0000-4000-8000-0000000c0a01";
    const valid = adjustmentSql(id, "offset", "written_approval_reference," + actorFields,
      "'onay-kisi-7'," + actorValues);
    const inserted = psql(db, scope(valid));
    assert.equal(inserted.status, 0, inserted.out);
    const row = psql(db, "SELECT written_approval_reference || ':' || actor_id || ':' || actor_role FROM settlement_adjustment WHERE id='" + id + "';");
    assert.equal(row.status, 0, row.out);
    assert.equal(row.out.trim(), "ONAY-KISI-7:qa-finance-manager:finance_manager");
    const mutate = psql(db, scope("UPDATE settlement_adjustment SET reason='fraud changed' WHERE id='" + id + "';"));
    assert.notEqual(mutate.status, 0, "append-only adjustment row could be modified");
  });

  it("accepted dispute decision may write an audited adjustment; rejected dispute cannot", () => {
    const disputeId = "ITZ-2026-W45-0042";
    const decision = psql(db, scope(
      "INSERT INTO statement_dispute (id,week_id,raised_by,reason,category,status,decided_by,decided_role,decided_mfa,decision_reason,decided_at) " +
      "VALUES ('" + disputeId + "','2026-W45','p1','Musteri dekont tutari hatali','calculation_error','accepted'," +
      "'qa-finance-manager','finance_manager',true,'Kanıtlar onaylandı',clock_timestamp());"));
    assert.equal(decision.status, 0, decision.out);
    const valid = adjustmentSql("00000000-0000-4000-8000-0000000c0a02", "dispute_decision",
      "dispute_id," + actorFields, "'" + disputeId + "'," + actorValues);
    const result = psql(db, scope(valid));
    assert.equal(result.status, 0, result.out);
    assert.equal(psql(db, "SELECT count(*) FROM settlement_adjustment WHERE dispute_id='" + disputeId + "';").out.trim(), "1");
    const rejected = adjustmentSql("00000000-0000-4000-8000-0000000c0a03", "dispute_decision",
      "dispute_id," + actorFields, "'ITZ-2026-W45-0001'," + actorValues);
    const wrong = psql(db, scope(rejected));
    assert.notEqual(wrong.status, 0);
    assert.match(wrong.out, /AG_F4_DISPUTE_NOT_ACCEPTED/);
  });

  it("valid written offset with missing actor or future MFA evidence is rejected", () => {
    const noActor = adjustmentSql("00000000-0000-4000-8000-0000000c0a04", "offset",
      "written_approval_reference", "'ONAY-MISSING-ACTOR'");
    const missing = psql(db, scope(noActor));
    assert.notEqual(missing.status, 0);
    assert.match(missing.out, /AG_F4_ADJUSTMENT_AUDIT_REQUIRED/);

    const future = adjustmentSql("00000000-0000-4000-8000-0000000c0a05", "offset",
      "written_approval_reference," + actorFields,
      "'ONAY-FUTURE-MFA','qa-manager','admin',clock_timestamp() + interval '1 day'");
    const afterNow = psql(db, scope(future));
    assert.notEqual(afterNow.status, 0);
    assert.match(afterNow.out, /AG_F4_ADJUSTMENT_AUDIT_REQUIRED/);
  });

  it("site app cannot write audited financial adjustments by claiming the platform scope GUC", () => {
    const attempt = psql(db, [
      "BEGIN;",
      "SET SESSION AUTHORIZATION ag_app;",
      "SET LOCAL app.scope='platform';",
      adjustmentSql("00000000-0000-4000-8000-0000000c0a06", "offset",
        "written_approval_reference," + actorFields, "'ONAY-FORGED'," + actorValues),
      "COMMIT;",
    ].join("\n"));
    assert.notEqual(attempt.status, 0);
    assert.equal(psql(db, "SELECT count(*) FROM settlement_adjustment WHERE id='00000000-0000-4000-8000-0000000c0a06';").out.trim(), "0");
  });
});

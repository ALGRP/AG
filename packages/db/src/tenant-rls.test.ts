// QA-F3: full PostgreSQL 16 RLS smoke test against a *disposable* database.
// Explicit opt-in required: AG_TEST_PG=1 AG_TEST_PG_ISOLATED=YES.
// Optional Docker-only runner: AG_TEST_PG_CONTAINER=<isolated-no-network-postgres-container>.
// NEVER point this harness at production or an existing customer/staging database.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { after, before, describe, it } from "node:test";

const RUN = process.env.AG_TEST_PG === "1" && process.env.AG_TEST_PG_ISOLATED === "YES";
const CONTAINER = process.env.AG_TEST_PG_CONTAINER;
const ROOT = resolve(import.meta.dirname, "../../..");
const MIGRATIONS = [
  readFileSync(resolve(ROOT, "packages/db/migrations/0001_network_core.sql"), "utf8"),
  readFileSync(resolve(ROOT, "packages/db/migrations/0002_tenant_rls.sql"), "utf8"),
];
const FIXTURE = readFileSync(resolve(ROOT, "qa-independent/sql/qa_probes.sql"), "utf8");

function psql(db: string, sql: string, stop = true): { status: number | null; out: string } {
  const args = CONTAINER
    ? ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-X", "-q", "-At", "-d", db, "-v", `ON_ERROR_STOP=${stop ? "1" : "0"}`, "-f", "-"]
    : ["-X", "-q", "-At", "-d", db, "-v", `ON_ERROR_STOP=${stop ? "1" : "0"}`, "-f", "-"];
  const run = spawnSync(CONTAINER ? "docker" : "psql", args, { input: sql, encoding: "utf8", timeout: 30_000 });
  return { status: run.status, out: (run.stdout ?? "") + (run.stderr ?? "") };
}

const ask = (db: string, sql: string): string => {
  const r = psql(db, sql);
  assert.equal(r.status, 0, r.out);
  return r.out.trim();
};

describe("QA-F3 PostgreSQL isolation — disposable PG16 only", {
  skip: RUN ? false : "AG_TEST_PG=1 + AG_TEST_PG_ISOLATED=YES required (NOT RUN)",
}, () => {
  const db = `ag_f3_${process.pid}`;
  before(() => {
    if (!RUN) return;
    const created = psql("postgres", `CREATE DATABASE ${db};`);
    assert.equal(created.status, 0, created.out);
    assert.equal(psql(db, MIGRATIONS[0]!).status, 0, "0001 initial schema");
    const fixture = psql(db, FIXTURE, false);
    assert.ok(fixture.out.includes("SETUP_DONE"), "fixture setup must complete");
    const migration = psql(db, MIGRATIONS[1]!);
    assert.equal(migration.status, 0, migration.out);
  });
  after(() => {
    if (!RUN) return;
    const cleanup = psql("postgres", `DROP DATABASE IF EXISTS ${db};`);
    assert.equal(cleanup.status, 0, cleanup.out);
  });

  it("all ledger tables have enabled and FORCE RLS", () => {
    const lines = ask(db, `SELECT relname||':'||relrowsecurity||':'||relforcerowsecurity
      FROM pg_class WHERE relname IN
      ('booking','booking_money_event','settlement_entry','bank_receipt','settlement_adjustment','statement_dispute')
      ORDER BY relname;`).split("\n");
    assert.deepEqual(lines, [
      "bank_receipt:true:true", "booking:true:true", "booking_money_event:true:true",
      "settlement_adjustment:true:true", "settlement_entry:true:true", "statement_dispute:true:true",
    ]);
  });

  it("unscoped ag_app sees no rows; own party visible but foreign booking/money/receipt hidden", () => {
    const text = ask(db, `SET ROLE ag_app;
      SELECT 'unscoped='||count(*) FROM booking;
      BEGIN;
      SET LOCAL app.scope = 'site';
      SET LOCAL app.party_id = 'p1';
      SELECT 'own='||count(*) FROM booking;
      SELECT 'foreign='||count(*) FROM booking WHERE selling_party_id = 'p2';
      SELECT 'foreign_money='||count(*) FROM booking_money_event
        WHERE booking_id = '00000000-0000-4000-8000-000000000102';
      SELECT 'foreign_receipt='||count(*) FROM bank_receipt WHERE payee_id = 'p2';
      COMMIT;
      SELECT 'after_commit='||count(*) FROM booking;`);
    const rows = Object.fromEntries(text.split("\n").filter((x) => x.includes("=")).map((x) => x.split("=")));
    assert.equal(rows.unscoped, "0");
    assert.ok(Number(rows.own) > 0);
    assert.equal(rows.foreign, "0");
    assert.equal(rows.foreign_money, "0");
    assert.equal(rows.foreign_receipt, "0");
    assert.equal(rows.after_commit, "0");
  });

  it("app cannot bypass by claiming platform scope or SET ROLE ag_platform", () => {
    assert.equal(ask(db, `SET ROLE ag_app; SET app.scope = 'platform'; SELECT count(*) FROM booking;`), "0");
    const flags = ask(db, `SELECT 'app_bypass='||rolbypassrls FROM pg_roles WHERE rolname='ag_app';
      SELECT 'app_owner='||count(*) FROM pg_class
        WHERE relname IN ('booking','bank_receipt','settlement_entry')
          AND relowner = (SELECT oid FROM pg_roles WHERE rolname='ag_app');
      SELECT 'app_platform_member='||pg_has_role('ag_app','ag_platform','member');`);
    assert.deepEqual(flags.trim().split("\n"), [
      "app_bypass=false", "app_owner=0", "app_platform_member=false",
    ]);
    // SET ROLE from a superuser's original session can still switch roles; drop SESSION privileges first.
    const denied = psql(db, "SET SESSION AUTHORIZATION ag_app; SET ROLE ag_platform;");
    assert.notEqual(denied.status, 0, "ag_app must not acquire platform privilege");
  });

  it("site app cannot DELETE ledger rows or INSERT a booking for a rival", () => {
    const deleted = psql(db, "SET ROLE ag_app; DELETE FROM settlement_entry;");
    assert.notEqual(deleted.status, 0, deleted.out);
    const siteRegistry = psql(db, "SET SESSION AUTHORIZATION ag_app; SELECT id, owner_party_id FROM site;");
    assert.notEqual(siteRegistry.status, 0, "site metadata must not be globally readable to site DB connections");
    const insert = psql(db, `SET ROLE ag_app; BEGIN;
      SET LOCAL app.scope='site'; SET LOCAL app.party_id='p1';
      INSERT INTO booking (id, selling_site_id, selling_party_id, service_type, ref, pickup_text, dropoff_text,
        pickup_at, passengers, customer_name, customer_email, customer_phone, customer_locale,
        allowed_collection_methods, lookup_token_hash, fingerprint)
      VALUES ('00000000-0000-4000-8000-999999999999','site-two','p2','private',
        'AG-QQQQ99','A','B','2026-11-04 12:00',1,'x','x@example.test','+90','en',
        ARRAY['cash']::collection_method[],'h','h');`);
    assert.notEqual(insert.status, 0, insert.out);
  });
});

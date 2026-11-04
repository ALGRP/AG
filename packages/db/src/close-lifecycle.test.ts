// QA-F4 / W positive lifecycle (PR3-N1): the week-integrity candidate must still allow the ONE legitimate
// close transaction: insert the finished week row AND its settlement entries atomically.
// The "no entry after close" guard itself is covered by probe Q05 in schema-probes.test.ts.
// Disposable PostgreSQL 16 only. Opt-in: AG_TEST_PG=1 AG_TEST_PG_ISOLATED=YES (optional AG_TEST_PG_CONTAINER).
// NEVER point this at production, staging or any customer database.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { after, before, describe, it } from "node:test";

const RUN = process.env.AG_TEST_PG === "1" && process.env.AG_TEST_PG_ISOLATED === "YES";
const CONTAINER = process.env.AG_TEST_PG_CONTAINER;
const ROOT = resolve(import.meta.dirname, "../../..");
const M0001 = readFileSync(resolve(ROOT, "packages/db/migrations/0001_network_core.sql"), "utf8");
const M0002 = readFileSync(resolve(ROOT, "packages/db/migrations/0002_tenant_rls.sql"), "utf8");
const M0003 = readFileSync(resolve(ROOT, "packages/db/migrations/0003_week_integrity.sql"), "utf8");

function psql(db: string, sql: string): { status: number | null; out: string } {
  const args = CONTAINER
    ? ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-X", "-q", "-At", "-d", db, "-v", "ON_ERROR_STOP=1", "-f", "-"]
    : ["-X", "-q", "-At", "-d", db, "-v", "ON_ERROR_STOP=1", "-f", "-"];
  const r = spawnSync(CONTAINER ? "docker" : "psql", args, { input: sql, encoding: "utf8", timeout: 30_000 });
  return { status: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
}

// A delivered, fully collected W44 booking (synthetic; mirrors the qa_probes fixture shape).
const BOOKING = `INSERT INTO partner (id, legal_name, billing_email) VALUES ('p1','P1','b@x.test');
INSERT INTO site (id, ownership, partner_id, owner_email, whatsapp_e164, owner_party_id, self_operation_verified_at)
VALUES ('site-one','partner','p1','o@x.test','+905550000001','p1',NULL);
INSERT INTO booking (id, selling_site_id, selling_party_id, supplier_id, service_type, final_booking_price, currency, ref, route_code, pickup_text, dropoff_text, pickup_at, passengers, customer_name, customer_email, customer_phone, customer_locale, allowed_collection_methods, lookup_token_hash, fingerprint, status, policy_id, site_commission_amount, agos_fee_amount, supplier_entitlement, collected_amount, collection_method, collected_at, completed_at, price_mode, created_at)
VALUES ('00000000-0000-4000-8000-00000000c044','site-one','p1','sup-a','shuttle',5000,'EUR','AG-QQWW44','AYT-ALN','a','b','2026-10-28 10:00',2,'n','e@x.test','+90','tr',ARRAY['cash']::collection_method[],'h','fc044','delivered','shuttle-split-v1',1000,500,3500,5000,'cash','2026-10-28 10:00+03','2026-10-28 12:00+03','FIXED_SHUTTLE','2026-10-27 09:00+03');
INSERT INTO booking_money_event VALUES ('00000000-0000-4000-8000-00000000d044','00000000-0000-4000-8000-00000000c044','collection',5000,'cash','supplier','SLIP-LIFE-44','2026-10-28 10:00+03');`;

const CLOSE_W44 = `BEGIN;
-- The local platform role must be explicitly scoped by a trusted transaction adapter.
SET LOCAL ROLE ag_platform;
SET LOCAL app.scope = 'platform';
INSERT INTO settlement_week (week_id, period_start, period_end, payment_due, report_snapshot)
SELECT '2026-W44', s, s + interval '7 days', s + interval '8 days 18 hours', '{}'::jsonb
FROM (SELECT ('2026-10-26 00:00'::timestamp AT TIME ZONE 'Europe/Istanbul') AS s) x;
INSERT INTO settlement_entry (id, week_id, booking_id, kind, base_before, base_after, collected_delta, site_delta, agos_delta, supplier_delta, currency, policy_id)
VALUES ('00000000-0000-4000-8000-00000000e044','2026-W44','00000000-0000-4000-8000-00000000c044','collection',0,5000,5000,1000,500,3500,'EUR','shuttle-split-v1');
COMMIT;`;

describe("QA-F4 W — legitimate close lifecycle (disposable PG16 only)", {
  skip: RUN ? false : "AG_TEST_PG=1 + AG_TEST_PG_ISOLATED=YES required (NOT RUN)",
}, () => {
  const db = `ag_f4_life_${process.pid}`;
  before(() => {
    if (!RUN) return;
    assert.equal(psql("postgres", `CREATE DATABASE ${db};`).status, 0);
    assert.equal(psql(db, M0001).status, 0, "0001");
    // Load the synthetic fixture before 0002/0003, since 0002 closes all
    // arbitrary writes under FORCE RLS and the normal platform closer is separate.
    const seed = psql(db, BOOKING);
    assert.equal(seed.status, 0, seed.out);
    for (const [name, sql] of [["0002", M0002], ["0003", M0003]] as const) {
      const migration = psql(db, sql);
      assert.equal(migration.status, 0, name + ": " + migration.out);
    }
  });
  after(() => {
    if (RUN) psql("postgres", `DROP DATABASE IF EXISTS ${db};`);
  });

  it("PR3-N1 [RULE] closing a finished week writes the week row and its entries in one transaction", () => {
    const r = psql(db, CLOSE_W44);
    assert.equal(r.status, 0, `legitimate close rejected: ${r.out.trim()}`);
    assert.equal(psql(db, "SELECT count(*) FROM settlement_entry WHERE week_id = '2026-W44';").out.trim(), "1");
  });

  it("cannot add a second settlement entry for an already committed week, even as platform", () => {
    const later = psql(db, `BEGIN;
SET LOCAL ROLE ag_platform;
SET LOCAL app.scope = 'platform';
INSERT INTO settlement_entry (id, week_id, booking_id, kind, base_before, base_after,
  collected_delta, site_delta, agos_delta, supplier_delta, currency, policy_id)
VALUES ('00000000-0000-4000-8000-00000000e045','2026-W44',
  '00000000-0000-4000-8000-00000000c044','collection',0,5000,5000,
  1000,500,3500,'EUR','shuttle-split-v1');
COMMIT;`);
    assert.notEqual(later.status, 0, "the platform wrote an entry after W44 was committed");
    assert.match(later.out, /AG_F4_CLOSED_WEEK_ENTRY/);
    assert.equal(psql(db, "SELECT count(*) FROM settlement_entry WHERE week_id = '2026-W44';").out.trim(), "1");
  });

  it("cannot add an entry inside a closing transaction as the unprivileged app role", () => {
    const attempt = psql(db, `BEGIN;
SET LOCAL ROLE ag_app;
SET LOCAL app.scope = 'site';
SET LOCAL app.party_id = 'p1';
INSERT INTO settlement_entry (id, week_id, booking_id, kind, base_before, base_after,
  collected_delta, site_delta, agos_delta, supplier_delta, currency, policy_id)
VALUES ('00000000-0000-4000-8000-00000000e046','2026-W44',
  '00000000-0000-4000-8000-00000000c044','collection',0,5000,5000,
  1000,500,3500,'EUR','shuttle-split-v1');
COMMIT;`);
    assert.notEqual(attempt.status, 0, "an untrusted site role inserted a week entry");
    assert.equal(psql(db, "SELECT count(*) FROM settlement_entry WHERE week_id = '2026-W44';").out.trim(), "1");
  });
});

// QA-F4/L: genuine state transitions and terminal-booking edits, disposable PG16 only.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { after, before, describe, it } from "node:test";
import { canTransition, type BookingStatus } from "../../core/src/booking.ts";

const RUN = process.env.AG_TEST_PG === "1" && process.env.AG_TEST_PG_ISOLATED === "YES";
const CONTAINER = process.env.AG_TEST_PG_CONTAINER;
const ROOT = resolve(import.meta.dirname, "../../..");
const migration = (name: string) => readFileSync(resolve(ROOT, `packages/db/migrations/${name}.sql`), "utf8");
const qa = readFileSync(resolve(ROOT, "qa-independent/sql/qa_probes.sql"), "utf8");
const setupEnd = qa.indexOf("\\echo SETUP_DONE");
assert.ok(setupEnd >= 0, "QA source has no setup marker");
const SETUP = qa.slice(0, setupEnd + "\\echo SETUP_DONE".length);
const ID = "00000000-0000-4000-8000-00000000f4d1";
const SETTLED_ID = "00000000-0000-4000-8000-000000000101";
const STATES: readonly BookingStatus[] = ["request", "quoted", "confirmed", "delivered", "cancelled"];

function psql(db: string, sql: string): { status: number | null; out: string } {
  const args = ["-X", "-q", "-At", "-d", db, "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-f", "-"];
  const r = spawnSync(CONTAINER ? "docker" : "psql", CONTAINER
    ? ["exec", "-i", CONTAINER, "psql", "-U", "postgres", ...args] : args,
  { input: sql, encoding: "utf8", timeout: 30_000 });
  return { status: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
}

const booking = (status: BookingStatus) => `INSERT INTO booking
  (id, selling_site_id, selling_party_id, supplier_id, service_type, final_booking_price, currency,
   ref, route_code, pickup_text, dropoff_text, pickup_at, passengers, customer_name, customer_email,
   customer_phone, customer_locale, allowed_collection_methods, lookup_token_hash, fingerprint,
   status, policy_id, site_commission_amount, agos_fee_amount, supplier_entitlement, price_mode,
   completed_at, cancelled_at)
VALUES ('${ID}', 'site-one', 'p1', 'sup-a', 'shuttle', 5000, 'EUR', 'AG-QFFF22', 'AYT-ALN',
  'a', 'b', '2026-11-04 10:00', 2, 'QA', 'qa@example.test', '+90', 'tr',
  ARRAY['cash']::collection_method[], 'h', 'lifecycle-fixture', '${status}', 'shuttle-split-v1',
  1000, 500, 3500, 'FIXED_SHUTTLE',
  ${status === "delivered" ? "'2026-11-04 12:00+03'" : "NULL"},
  ${status === "cancelled" ? "'2026-11-04 09:00+03'" : "NULL"});`;
const platform = (sql: string) => `BEGIN;
SET LOCAL ROLE ag_platform;
SET LOCAL app.scope='platform';
${sql}
ROLLBACK;`;

describe("QA-F4 L booking lifecycle — disposable PG16", {
  skip: RUN ? false : "AG_TEST_PG=1 + AG_TEST_PG_ISOLATED=YES required (NOT RUN)",
}, () => {
  const db = `ag_f4_lifecycle_${process.pid}`;
  before(() => {
    const created = psql("postgres", `CREATE DATABASE ${db};`);
    assert.equal(created.status, 0, created.out);
    const initial = psql(db, migration("0001_network_core"));
    assert.equal(initial.status, 0, initial.out);
    const seeded = psql(db, SETUP);
    assert.equal(seeded.status, 0, seeded.out);
    for (const name of ["0002_tenant_rls", "0003_week_integrity", "0004_entry_integrity", "0005_money_events",
      "0006_adjustments_audit", "0007_adjustment_hardening", "0008_attribution_integrity",
      "0009_attribution_freeze", "0010_supplier_id_format", "0011_self_supply_history", "0012_booking_lifecycle"]) {
      const r = psql(db, migration(name));
      assert.equal(r.status, 0, `${name}: ${r.out}`);
    }
  });
  after(() => {
    const dropped = psql("postgres", `DROP DATABASE IF EXISTS ${db};`);
    assert.equal(dropped.status, 0, dropped.out);
  });

  for (const from of ["request", "quoted", "confirmed"] as const) {
    it(`L-POSITIVE: ${from} can be cancelled before delivery`, () => {
      const r = psql(db, platform(`${booking(from)}
UPDATE booking SET status='cancelled', cancelled_at=clock_timestamp() WHERE id='${ID}';
SELECT status::text, cancelled_at IS NOT NULL, completed_at IS NULL, settlement_week_id IS NULL
  FROM booking WHERE id='${ID}';`));
      assert.equal(r.status, 0, r.out);
      assert.equal(r.out.trim(), "cancelled|t|t|t");
    });
  }

  it("L-POSITIVE: a confirmed booking can be delivered with its completion timestamp", () => {
    const r = psql(db, platform(`${booking("confirmed")}
UPDATE booking SET status='delivered', completed_at='2026-11-04 12:00+03' WHERE id='${ID}';
SELECT status::text, completed_at='2026-11-04 12:00+03'::timestamptz, cancelled_at IS NULL
  FROM booking WHERE id='${ID}';`));
    assert.equal(r.status, 0, r.out);
    assert.equal(r.out.trim(), "delivered|t|t");
  });

  it("L-POSITIVE: a settled delivery still accepts notes and an unchanged status", () => {
    const r = psql(db, platform(`UPDATE booking SET notes='operation note' WHERE id='${SETTLED_ID}';
UPDATE booking SET status='delivered', notes='reviewed' WHERE id='${SETTLED_ID}';
SELECT status::text, notes, settlement_week_id, completed_at IS NOT NULL FROM booking WHERE id='${SETTLED_ID}';`));
    assert.equal(r.status, 0, r.out);
    assert.equal(r.out.trim(), "delivered|reviewed|2026-W45|t");
  });

  it("L-PARITY: all 25 status pairs match the application, allowing unchanged status writes", () => {
    for (const from of STATES) {
      for (const to of STATES) {
        const r = psql(db, platform(`${booking(from)}
UPDATE booking SET status='${to}',
  completed_at=CASE WHEN '${to}'='delivered' THEN coalesce(completed_at, clock_timestamp()) ELSE completed_at END,
  cancelled_at=CASE WHEN '${to}'='cancelled' THEN coalesce(cancelled_at, clock_timestamp()) ELSE cancelled_at END
WHERE id='${ID}' RETURNING status;`));
        if (from === to || canTransition(from, to)) {
          assert.equal(r.status, 0, `${from} -> ${to}: ${r.out}`);
          assert.equal(r.out.trim(), to);
        } else {
          assert.notEqual(r.status, 0, `${from} -> ${to} unexpectedly accepted`);
          assert.match(r.out, /23514: AG_F4_BOOKING_STATUS_TRANSITION_INVALID/);
        }
      }
    }
  });

  it("L-NEGATIVE: a settled delivery cannot be reopened or cancelled by clearing history", () => {
    for (const to of ["request", "quoted", "confirmed", "cancelled"]) {
      const r = psql(db, platform(`UPDATE booking SET status='${to}', completed_at=NULL,
settlement_week_id=NULL, cancelled_at=clock_timestamp() WHERE id='${SETTLED_ID}';`));
      assert.notEqual(r.status, 0, `${to} unexpectedly accepted`);
      assert.match(r.out, /23514: AG_F4_BOOKING_STATUS_TRANSITION_INVALID/);
    }
    const unchanged = psql(db, platform(`SELECT status::text, completed_at IS NOT NULL,
settlement_week_id, cancelled_at IS NULL FROM booking WHERE id='${SETTLED_ID}';`));
    assert.equal(unchanged.status, 0, unchanged.out);
    assert.equal(unchanged.out.trim(), "delivered|t|2026-W45|t");
  });
});

// PR3-N10 (Claude review of ce61a04 / 0013): a 2FA manual price approval binds only the AMOUNT, not the service it
// priced. After a 6-passenger 9000 approval, the same booking can be moved to 16 passengers or another route and keep
// 9000 as SHUTTLE_MANUAL_APPROVED. These tests describe the required behaviour (reject) and are `todo` until fixed.
// The exact error name is Codex's choice; the assertion only requires an AG_F4_ pricing rejection, not an unrelated
// CHECK (e.g. passengers 1..16) or RLS failure. H-22/K17 numeric bounds stay OPEN and are not decided here.
// The legitimate flow (approval → price → note/supplier update with the SAME pax/route) must stay accepted.
// Disposable PostgreSQL 16 only: AG_TEST_PG=1 AG_TEST_PG_ISOLATED=YES (optional AG_TEST_PG_CONTAINER).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { after, before, describe, it } from "node:test";

const RUN = process.env.AG_TEST_PG === "1" && process.env.AG_TEST_PG_ISOLATED === "YES";
const CONTAINER = process.env.AG_TEST_PG_CONTAINER;
const ROOT = resolve(import.meta.dirname, "../../..");
const DIR = resolve(ROOT, "packages/db/migrations");
const MIGRATIONS = existsSync(DIR) ? readdirSync(DIR).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort() : [];

function psql(db: string, sql: string): { status: number | null; out: string } {
  const args = CONTAINER
    ? ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-X", "-q", "-At", "-d", db, "-v", "ON_ERROR_STOP=1", "-f", "-"]
    : ["-X", "-q", "-At", "-d", db, "-v", "ON_ERROR_STOP=1", "-f", "-"];
  const r = spawnSync(CONTAINER ? "docker" : "psql", args, { input: sql, encoding: "utf8", timeout: 30_000 });
  return { status: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
}

const COLS = "id, selling_site_id, selling_party_id, service_type, currency, ref, route_code, pickup_text, dropoff_text, pickup_at, passengers, customer_name, customer_email, customer_phone, customer_locale, allowed_collection_methods, lookup_token_hash, fingerprint, status";
const uid = (id: string) => `00000000-0000-4000-8000-00000000${id}`;
const request6 = (id: string, ref: string) =>
  `INSERT INTO booking (${COLS}) VALUES ('${uid(id)}','site-one','p1','shuttle',NULL,'${ref}','AYT-ALN','a','b','2026-12-10 10:00',6,'n','e@x.test','+90','tr',ARRAY['cash']::collection_method[],'h','f${id}','request');`;
const approve9000 = (id: string) =>
  `INSERT INTO manual_price_approval (booking_id, actor_id, actor_role, mfa_verified, new_price_minor, reason)
VALUES ('${uid(id)}','qa-fm','finance_manager',true,9000,'6 kisi Sprinter onayi');`;
const price9000 = (id: string) =>
  `UPDATE booking SET final_booking_price=9000, currency='EUR', status='confirmed', supplier_id='sup-a', policy_id='shuttle-split-v1',
  site_commission_amount=1800, agos_fee_amount=900, supplier_entitlement=6300, price_mode='SHUTTLE_MANUAL_APPROVED' WHERE id='${uid(id)}';`;

function assertPricingReject(r: { status: number | null; out: string }) {
  assert.notEqual(r.status, 0, "accepted — approval not bound to the priced service: " + r.out);
  assert.match(r.out, /AG_F4_[A-Z_]+/, "rejected for an unrelated reason: " + r.out);
}

describe("PR3-N10 — manual price approval is bound to the priced service (disposable PG16 only)", {
  skip: RUN ? false : "AG_TEST_PG=1 + AG_TEST_PG_ISOLATED=YES required (NOT RUN)",
}, () => {
  const db = `ag_f4_bind_${process.pid}`;
  before(() => {
    if (!RUN) return;
    assert.equal(psql("postgres", `CREATE DATABASE ${db};`).status, 0);
    const [first, ...rest] = MIGRATIONS;
    assert.equal(psql(db, readFileSync(resolve(DIR, first!), "utf8")).status, 0, first);
    const seed = psql(db, `INSERT INTO partner (id, legal_name, billing_email) VALUES ('p1','P1','b@x.test');
INSERT INTO site (id, ownership, partner_id, owner_email, whatsapp_e164, owner_party_id, self_operation_verified_at)
VALUES ('site-one','partner','p1','o@x.test','+905550000001','p1',NULL);`);
    assert.equal(seed.status, 0, seed.out);
    for (const m of rest) {
      const r = psql(db, readFileSync(resolve(DIR, m), "utf8"));
      assert.equal(r.status, 0, `${m}: ${r.out}`);
    }
  });
  after(() => {
    if (RUN) psql("postgres", `DROP DATABASE IF EXISTS ${db};`);
  });

  it("GUARD same pax/route: approved 6-pax booking still accepts a pickup-text update (same pax/route)", () => {
    const r = psql(db, `${request6("e601", "AG-TTSS22")}\n${approve9000("e601")}\n${price9000("e601")}
UPDATE booking SET pickup_text = 'a2' WHERE id='${uid("e601")}';`);
    assert.equal(r.status, 0, r.out);
  });

  it("PR3-N10a priced 6-pax manual booking cannot move to 16 passengers at the same approved amount",
    () => {
      const setup = psql(db, `${request6("e602", "AG-TTSS23")}\n${approve9000("e602")}\n${price9000("e602")}`);
      assert.equal(setup.status, 0, setup.out);
      assertPricingReject(psql(db, `UPDATE booking SET passengers = 16 WHERE id='${uid("e602")}';`));
    });

  it("PR3-N10b approval for 6 pax cannot price the booking after pax changed to 16 before pricing",
    () => {
      const setup = psql(db, `${request6("e603", "AG-TTSS24")}\n${approve9000("e603")}
UPDATE booking SET passengers = 16 WHERE id='${uid("e603")}';`);
      // Either the pax change or the later pricing must be rejected; the final state must not be 16 pax at 9000.
      if (setup.status !== 0) return assertPricingReject(setup);
      assertPricingReject(psql(db, price9000("e603")));
    });

  it("PR3-N10c priced 6-pax manual booking cannot change route at the same approved amount",
    () => {
      const setup = psql(db, `${request6("e604", "AG-TTSS25")}\n${approve9000("e604")}\n${price9000("e604")}`);
      assert.equal(setup.status, 0, setup.out);
      assertPricingReject(psql(db, `UPDATE booking SET route_code = 'AYT-KNY' WHERE id='${uid("e604")}';`));
    });
});

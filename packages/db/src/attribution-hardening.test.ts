// Claude peer review of 6e166a6 (QA-F4/T, 0008): two gaps found with original 0001-0008.
//  PR3-N7: the attribution trigger runs on EVERY booking UPDATE and compares with the CURRENT site owner. After a site
//          is transferred to another partner, any update of a historical booking (completion, notes, cash cache) fails
//          with AG_F4_BOOKING_SELLING_PARTY_MISMATCH. Worse: rewriting selling_party_id TO the new owner is ACCEPTED, so
//          historical commission can be redirected. Attribution is fixed at booking time and must be immutable.
//  PR3-N8: DB supplier id format ^[a-z0-9-]{2,64}$ is stricter than the application's ID /^[a-z0-9_-]{1,64}$/, so a
//          supplier id valid in the app (e.g. "sup_a") is rejected by the database.
// Disposable PostgreSQL 16 only: AG_TEST_PG=1 AG_TEST_PG_ISOLATED=YES (optional AG_TEST_PG_CONTAINER).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { after, before, describe, it } from "node:test";

const RUN = process.env.AG_TEST_PG === "1" && process.env.AG_TEST_PG_ISOLATED === "YES";
const CONTAINER = process.env.AG_TEST_PG_CONTAINER;
const ROOT = resolve(import.meta.dirname, "../../..");
const MIG = (n: string) => readFileSync(resolve(ROOT, `packages/db/migrations/${n}.sql`), "utf8");

function psql(db: string, sql: string): { status: number | null; out: string } {
  const args = CONTAINER
    ? ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-X", "-q", "-At", "-d", db, "-v", "ON_ERROR_STOP=1", "-f", "-"]
    : ["-X", "-q", "-At", "-d", db, "-v", "ON_ERROR_STOP=1", "-f", "-"];
  const r = spawnSync(CONTAINER ? "docker" : "psql", args, { input: sql, encoding: "utf8", timeout: 30_000 });
  return { status: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
}

const COLS = "id, selling_site_id, selling_party_id, supplier_id, service_type, final_booking_price, currency, ref, route_code, pickup_text, dropoff_text, pickup_at, passengers, customer_name, customer_email, customer_phone, customer_locale, allowed_collection_methods, lookup_token_hash, fingerprint, status, policy_id, site_commission_amount, agos_fee_amount, supplier_entitlement, price_mode";
const booking = (id: string, ref: string, party: string, supplier: string) =>
  `INSERT INTO booking (${COLS}) VALUES ('00000000-0000-4000-8000-00000000${id}','site-one','${party}','${supplier}','shuttle',5000,'EUR','${ref}','AYT-ALN','a','b','2026-10-28 10:00',2,'n','e@x.test','+90','tr',ARRAY['cash']::collection_method[],'h','f${id}','confirmed','shuttle-split-v1',1000,500,3500,'FIXED_SHUTTLE');`;

describe("QA-F4/T hardening (disposable PG16 only)", {
  skip: RUN ? false : "AG_TEST_PG=1 + AG_TEST_PG_ISOLATED=YES required (NOT RUN)",
}, () => {
  const db = `ag_f4t_hard_${process.pid}`;
  before(() => {
    if (!RUN) return;
    assert.equal(psql("postgres", `CREATE DATABASE ${db};`).status, 0);
    assert.equal(psql(db, MIG("0001_network_core")).status, 0);
    const seed = psql(db, `INSERT INTO partner (id, legal_name, billing_email) VALUES ('p1','P1','b@x.test'), ('p9','P9','z@x.test');
INSERT INTO site (id, ownership, partner_id, owner_email, whatsapp_e164, owner_party_id, self_operation_verified_at)
VALUES ('site-one','partner','p1','o@x.test','+905550000001','p1',NULL);
${booking("a701", "AG-QQNN22", "p1", "sup-a")}`);
    assert.equal(seed.status, 0, seed.out);
    for (const n of ["0002_tenant_rls", "0003_week_integrity", "0004_entry_integrity", "0005_money_events",
      "0006_adjustments_audit", "0007_adjustment_hardening", "0008_attribution_integrity", "0009_attribution_freeze",
      "0010_supplier_id_format", "0011_self_supply_history"]) {
      const m = psql(db, MIG(n));
      assert.equal(m.status, 0, `${n}: ${m.out}`);
    }
  });
  after(() => {
    if (RUN) psql("postgres", `DROP DATABASE IF EXISTS ${db};`);
  });

  it("PR3-N7 [RULE] after a site transfer, a historical booking stays updatable and keeps its original attribution", () => {
    const transfer = psql(db, "UPDATE site SET partner_id = 'p9', owner_party_id = 'p9' WHERE id = 'site-one';");
    assert.equal(transfer.status, 0, transfer.out);
    const r = psql(db, "UPDATE booking SET notes = 'ops note after transfer' WHERE id = '00000000-0000-4000-8000-00000000a701';");
    assert.equal(r.status, 0, `historical booking not updatable after site transfer: ${r.out.trim()}`);
    assert.equal(psql(db, "SELECT selling_party_id FROM booking WHERE id = '00000000-0000-4000-8000-00000000a701';").out.trim(), "p1");
  });

  it("PR3-N7 [RULE] the attribution of an existing booking cannot be rewritten to the new site owner after a transfer", () => {
    const r = psql(db, "UPDATE booking SET selling_party_id = 'p9' WHERE id = '00000000-0000-4000-8000-00000000a701';");
    assert.notEqual(r.status, 0, "attribution of an existing booking was rewritten");
  });

  it("PR3-N8 [RULE] a supplier id valid for the application (lower case with underscore) is accepted", () => {
    const r = psql(db, booking("a702", "AG-QQNN23", "p9", "sup_a"));
    assert.equal(r.status, 0, `app-valid supplier id rejected: ${r.out.trim()}`);
  });

  it("PR3-N9 [RULE] revoking a site's self-operation verification does not lock its historical self-supplied bookings", () => {
    const setup = psql(db, `UPDATE site SET self_operation_verified_at = '2026-10-01' WHERE id = 'site-one';
${booking("a703", "AG-QQNN24", "p9", "p9").replace("1000,500,3500", "0,500,4500")}
UPDATE site SET self_operation_verified_at = NULL WHERE id = 'site-one';`);
    assert.equal(setup.status, 0, setup.out);
    const r = psql(db, "UPDATE booking SET notes = 'ops note after revocation' WHERE id = '00000000-0000-4000-8000-00000000a703';");
    assert.equal(r.status, 0, `historical self-supplied booking locked after revocation: ${r.out.trim()}`);
  });
});


// QA-F4 / P group GUARDS (Codex Paket-03, 0013): legitimate pricing flows that must stay ACCEPTED when the P
// constraints (Q23 5+ auto price, Q24 manual price without approval, Q25/Q26 tariff totals, Q29 price change after
// delivery+collection, Q31 manual approval for 1-4 pax) are added. They pass today; after 0013 they must still pass
// with unchanged assertions. H-22 / K17 (5+ numeric bounds) is OPEN and not tested here.
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
// Every candidate migration in order (0001..00xx), so the guards run against whatever 0013 becomes.
const MIGRATIONS = existsSync(DIR) ? readdirSync(DIR).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort() : [];

function psql(db: string, sql: string): { status: number | null; out: string } {
  const args = CONTAINER
    ? ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-X", "-q", "-At", "-d", db, "-v", "ON_ERROR_STOP=1", "-f", "-"]
    : ["-X", "-q", "-At", "-d", db, "-v", "ON_ERROR_STOP=1", "-f", "-"];
  const r = spawnSync(CONTAINER ? "docker" : "psql", args, { input: sql, encoding: "utf8", timeout: 30_000 });
  return { status: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
}

const COLS = "id, selling_site_id, selling_party_id, service_type, currency, ref, route_code, pickup_text, dropoff_text, pickup_at, passengers, customer_name, customer_email, customer_phone, customer_locale, allowed_collection_methods, lookup_token_hash, fingerprint, status";
const booking = (id: string, ref: string, pax: number, extraCols = "", extraVals = "") =>
  `INSERT INTO booking (${COLS}${extraCols}) VALUES ('00000000-0000-4000-8000-00000000${id}','site-one','p1','shuttle','EUR','${ref}','AYT-ALN','a','b','2026-12-10 10:00',${pax},'n','e@x.test','+90','tr',ARRAY['cash']::collection_method[],'h','f${id}','confirmed'${extraVals});`;

describe("QA-F4 P — legitimate pricing stays accepted (disposable PG16 only)", {
  skip: RUN ? false : "AG_TEST_PG=1 + AG_TEST_PG_ISOLATED=YES required (NOT RUN)",
}, () => {
  const db = `ag_f4_price_${process.pid}`;
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

  it("P-GUARD a 4-passenger shuttle at the automatic 70 EUR total is accepted", () => {
    const r = psql(db, booking("c401", "AG-QQSS22", 4,
      ", supplier_id, final_booking_price, policy_id, site_commission_amount, agos_fee_amount, supplier_entitlement, price_mode",
      ",'sup-a',7000,'shuttle-split-v1',1400,700,4900,'FIXED_SHUTTLE'"));
    assert.equal(r.status, 0, r.out);
  });

  it("P-GUARD a tariff version with four positive totals (30/50/60/70) is accepted", () => {
    const r = psql(db, `INSERT INTO shuttle_tariff_version (id, approval, published_at, currency, routes, valid_from, max_passengers, totals_minor)
      VALUES ('qa-guard-four', 'proposed', '2026-11-03', 'EUR', ARRAY['AYT-ALN'], '2026-11-03', 10, ARRAY[3000,5000,6000,7000]::bigint[]);`);
    assert.equal(r.status, 0, r.out);
  });

  it("P-GUARD 6-passenger manual price: unpriced booking → 2FA approval record → price set as SHUTTLE_MANUAL_APPROVED", () => {
    // An unpriced shuttle is a 'request' with neither price nor currency (0001 CHECKs); approval then confirms it.
    const unpriced = booking("c601", "AG-QQSS23", 6).replace("'shuttle','EUR'", "'shuttle',NULL").replace("'confirmed')", "'request')");
    const r = psql(db, `${unpriced}
INSERT INTO manual_price_approval (booking_id, actor_id, actor_role, mfa_verified, new_price_minor, reason)
VALUES ('00000000-0000-4000-8000-00000000c601', 'qa-fm', 'finance_manager', true, 9000, '6 kisi Sprinter onayi');
UPDATE booking SET final_booking_price = 9000, currency = 'EUR', status = 'confirmed', supplier_id = 'sup-a', policy_id = 'shuttle-split-v1',
  site_commission_amount = 1800, agos_fee_amount = 900, supplier_entitlement = 6300, price_mode = 'SHUTTLE_MANUAL_APPROVED'
WHERE id = '00000000-0000-4000-8000-00000000c601';`);
    assert.equal(r.status, 0, r.out);
  });
});

// QA-F4 / M group GUARDS (Codex Paket-03): legitimate money movements that must stay ACCEPTED when the M
// constraints (Q12 refund > collected, Q13 shuttle site-collection, Q15 collected_amount rollback, Q16 receipt
// case variant) are added. They pass today; after 0005 they must still pass with unchanged assertions.
// Disposable PostgreSQL 16 only: AG_TEST_PG=1 AG_TEST_PG_ISOLATED=YES (optional AG_TEST_PG_CONTAINER).
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { after, before, describe, it } from "node:test";

const RUN = process.env.AG_TEST_PG === "1" && process.env.AG_TEST_PG_ISOLATED === "YES";
const CONTAINER = process.env.AG_TEST_PG_CONTAINER;
const ROOT = resolve(import.meta.dirname, "../../..");
const MIG = ["0001_network_core", "0002_tenant_rls", "0003_week_integrity", "0004_entry_integrity", "0005_money_events"]
  .map((n) => resolve(ROOT, `packages/db/migrations/${n}.sql`))
  .filter((p) => existsSync(p));

function psql(db: string, sql: string): { status: number | null; out: string } {
  const args = CONTAINER
    ? ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-X", "-q", "-At", "-d", db, "-v", "ON_ERROR_STOP=1", "-f", "-"]
    : ["-X", "-q", "-At", "-d", db, "-v", "ON_ERROR_STOP=1", "-f", "-"];
  const r = spawnSync(CONTAINER ? "docker" : "psql", args, { input: sql, encoding: "utf8", timeout: 30_000 });
  return { status: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
}

async function concurrentPsql(db: string, sql: string): Promise<{ status: number | null; out: string }> {
  const cmd = CONTAINER ? "docker" : "psql";
  const args = CONTAINER
    ? ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-X", "-q", "-At", "-d", db, "-v", "ON_ERROR_STOP=1", "-f", "-"]
    : ["-X", "-q", "-At", "-d", db, "-v", "ON_ERROR_STOP=1", "-f", "-"];
  return new Promise((resolveRun, reject) => {
    const child = spawn(cmd, args);
    let out = "";
    child.stdout.on("data", (b) => { out += String(b); });
    child.stderr.on("data", (b) => { out += String(b); });
    child.on("error", reject);
    child.on("close", (status) => resolveRun({ status, out }));
    child.stdin.end(sql);
  });
}

const COLS = "id, selling_site_id, selling_party_id, supplier_id, service_type, final_booking_price, currency, ref, route_code, pickup_text, dropoff_text, pickup_at, passengers, customer_name, customer_email, customer_phone, customer_locale, allowed_collection_methods, lookup_token_hash, fingerprint, status, policy_id, site_commission_amount, agos_fee_amount, supplier_entitlement, price_mode, created_at";
const SEED = `INSERT INTO partner (id, legal_name, billing_email) VALUES ('p1','P1','b@x.test');
INSERT INTO site (id, ownership, partner_id, owner_email, whatsapp_e164, owner_party_id, self_operation_verified_at)
VALUES ('site-one','partner','p1','o@x.test','+905550000001','p1',NULL);
INSERT INTO booking (${COLS}) VALUES
 ('00000000-0000-4000-8000-00000000f001','site-one','p1','sup-a','shuttle',5000,'EUR','AG-QQMM22','AYT-ALN','a','b','2026-10-28 10:00',2,'n','e@x.test','+90','tr',ARRAY['cash']::collection_method[],'h','fm01','confirmed','shuttle-split-v1',1000,500,3500,'FIXED_SHUTTLE','2026-10-27 09:00+03'),
 ('00000000-0000-4000-8000-00000000f002','site-one','p1','sup-p','private',8000,'EUR','AG-QQMM23',NULL,'a','b','2026-10-28 11:00',2,'n','e@x.test','+90','tr',ARRAY['cash']::collection_method[],'h','fm02','confirmed',NULL,3250,0,4750,'SITE_PRICE','2026-10-27 09:00+03');`;
const EV = (id: string, booking: string, kind: string, amount: number, collector: string, ref: string) =>
  `INSERT INTO booking_money_event VALUES ('00000000-0000-4000-8000-0000000${id}','00000000-0000-4000-8000-00000000${booking}','${kind}',${amount},'cash','${collector}','${ref}','2026-10-28 12:00+03');`;

describe("QA-F4 M — legitimate money movements stay accepted (disposable PG16 only)", {
  skip: RUN ? false : "AG_TEST_PG=1 + AG_TEST_PG_ISOLATED=YES required (NOT RUN)",
}, () => {
  const db = `ag_f4_money_${process.pid}`;
  before(() => {
    if (!RUN) return;
    assert.equal(psql("postgres", `CREATE DATABASE ${db};`).status, 0);
    const [first, ...rest] = MIG;
    assert.equal(psql(db, readFileSync(first!, "utf8")).status, 0, "0001");
    const seed = psql(db, SEED);
    assert.equal(seed.status, 0, seed.out);
    for (const p of rest) {
      const m = psql(db, readFileSync(p, "utf8"));
      assert.equal(m.status, 0, `${p}: ${m.out}`);
    }
  });
  after(() => {
    if (RUN) psql("postgres", `DROP DATABASE IF EXISTS ${db};`);
  });

  it("M-GUARD shuttle: supplier collects 50 EUR, then refunds 20 EUR (refund <= collected)", () => {
    const r = psql(db, EV("ff001", "f001", "collection", 5000, "supplier", "SLIP-M-1") + EV("ff002", "f001", "refund", 2000, "supplier", "RF-M-1"));
    assert.equal(r.status, 0, r.out);
  });

  it("M-GUARD private: the SITE may collect (shuttle-only restriction must not leak to private)", () => {
    const r = psql(db, EV("ff003", "f002", "collection", 8000, "site", "SLIP-M-2"));
    assert.equal(r.status, 0, r.out);
  });

  it("M-RACE: concurrent 20 EUR refunds after an earlier 20 EUR refund permit only one, even from two SQL connections", async () => {
    // The regular positive test already inserted 50 EUR collection and 20 EUR
    // refund for booking f001. Two further 20 EUR refunds would total 60 EUR.
    // The first transaction keeps the row lock briefly to provoke contention.
    const script = (id: string, ref: string) => `BEGIN;
INSERT INTO booking_money_event VALUES
('00000000-0000-4000-8000-0000000${id}',
 '00000000-0000-4000-8000-00000000f001',
 'refund',2000,'cash','supplier','${ref}','2026-10-28 12:00+03');
SELECT pg_sleep(0.25);
COMMIT;`;
    const [first, second] = await Promise.all([
      concurrentPsql(db, script("ff004", "RF-M-RACE-A")),
      concurrentPsql(db, script("ff005", "RF-M-RACE-B")),
    ]);
    const results = [first, second];
    assert.equal(results.filter((x) => x.status === 0).length, 1, JSON.stringify(results));
    assert.equal(results.filter((x) => x.out.includes("AG_F4_REFUND_EXCEEDS_COLLECTED")).length, 1, JSON.stringify(results));
    const total = psql(db, "SELECT count(*)||':'||sum(amount) FROM booking_money_event WHERE kind='refund' AND booking_id='00000000-0000-4000-8000-00000000f001';");
    assert.equal(total.status, 0, total.out);
    assert.equal(total.out.trim(), "2:4000");
  });

  it("M-CACHE: money totals can be synchronized to recorded events but manual drift is rejected", () => {
    // Earlier guard inserted 80 EUR as a private/site collection for booking f002.
    const accurate = psql(db, "UPDATE booking SET collected_amount=8000 WHERE id='00000000-0000-4000-8000-00000000f002';");
    assert.equal(accurate.status, 0, accurate.out);
    const drift = psql(db, "UPDATE booking SET collected_amount=7000 WHERE id='00000000-0000-4000-8000-00000000f002';");
    assert.notEqual(drift.status, 0);
    assert.match(drift.out, /AG_F4_COLLECTED_AMOUNT_DRIFT/);
    assert.equal(psql(db, "SELECT collected_amount FROM booking WHERE id='00000000-0000-4000-8000-00000000f002';").out.trim(), "8000");
  });

  it("M-RLS: platform-scoped INSERT is allowed; ag_app cannot escalate with a forged scope GUC", () => {
    const accepted = psql(db, `BEGIN;
SET LOCAL ROLE ag_platform;
SET LOCAL app.scope='platform';
INSERT INTO booking_money_event VALUES
('00000000-0000-4000-8000-0000000ff010',
 '00000000-0000-4000-8000-00000000f002',
 'collection',100,'cash','site','SLIP-M-ROLE','2026-10-29 13:00+03');
COMMIT;`);
    assert.equal(accepted.status, 0, accepted.out);
    const denied = psql(db, `BEGIN;
SET SESSION AUTHORIZATION ag_app;
SET LOCAL app.scope='platform';
INSERT INTO booking_money_event VALUES
('00000000-0000-4000-8000-0000000ff011',
 '00000000-0000-4000-8000-00000000f002',
 'collection',100,'cash','site','SLIP-M-FAKE','2026-10-29 13:00+03');
COMMIT;`);
    assert.notEqual(denied.status, 0, "untrusted app connection inserted a collection by spoofing scope");
  });

  it("M-GUARD receipts: the same bank reference from a DIFFERENT payer is a different receipt", () => {
    const r = psql(db, `INSERT INTO bank_receipt (id, week_id, payer_id, payee_id, amount, currency, bank_reference, paid_at) VALUES
      ('00000000-0000-4000-8000-0000000fb001','2026-W44','sup-a','p1',1000,'EUR','TR-M-0001','2026-10-29 09:00+03'),
      ('00000000-0000-4000-8000-0000000fb002','2026-W44','sup-p','p1',1000,'EUR','tr-m-0001','2026-10-29 09:00+03');`);
    assert.equal(r.status, 0, r.out);
  });

  it("PR3-N4 [RULE] a booking cannot be INSERTED with cash totals that no money event supports (cache drift via INSERT)", { todo: "PR3-N4 · Codex Paket-03 (0005 yalnız UPDATE'i koruyor)" }, () => {
    const r = psql(db, `INSERT INTO booking (${COLS}, collected_amount, collection_method, collected_at) VALUES
      ('00000000-0000-4000-8000-00000000f0d1','site-one','p1','sup-a','shuttle',5000,'EUR','AG-QQMM24','AYT-ALN','a','b','2026-10-28 10:00',2,'n','e@x.test','+90','tr',ARRAY['cash']::collection_method[],'h','fmd1','confirmed','shuttle-split-v1',1000,500,3500,'FIXED_SHUTTLE','2026-10-27 09:00+03',4000,'cash','2026-10-28 10:00+03');`);
    assert.notEqual(r.status, 0, "booking inserted with collected_amount 4000 and no collection event");
    assert.match(r.out, /AG_F4_COLLECTED_AMOUNT_DRIFT/);
  });
});


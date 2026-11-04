// QA-F4/P adversarial and positive coverage on the complete disposable candidate.
// The independent price-lifecycle.test.ts guard assertions remain byte-for-byte intact.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { after, before, describe, it } from "node:test";

const RUN = process.env.AG_TEST_PG === "1" && process.env.AG_TEST_PG_ISOLATED === "YES";
const CONTAINER = process.env.AG_TEST_PG_CONTAINER;
const DIR = resolve(import.meta.dirname, "../migrations");
const A = "00000000-0000-4000-8000-00000000d001";
const B = "00000000-0000-4000-8000-00000000d002";
const where = ` WHERE id='${A}';`;
const cmd = CONTAINER ? "docker" : "psql";
const args = (db: string) => [
  ...(CONTAINER ? ["exec", "-i", CONTAINER, "psql", "-U", "postgres"] : []),
  "-X", "-q", "-At", "-d", db, "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-f", "-",
];
function psql(db: string, sql: string) {
  const r = spawnSync(cmd, args(db), { input: sql, encoding: "utf8", timeout: 30_000 });
  return { status: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
}
const platform = (sql: string) => `BEGIN; SET LOCAL ROLE ag_platform; SET LOCAL app.scope='platform';\n${sql}\nROLLBACK;`;
function booking(overrides: Record<string, string> = {}) {
  const fields = {
    id: `'${A}'`, selling_site_id: "'site-one'", selling_party_id: "'p1'", supplier_id: "NULL",
    service_type: "'shuttle'", final_booking_price: "5000", currency: "'EUR'", ref: "'AG-QPPP22'",
    route_code: "'AYT-ALN'", pickup_text: "'a'", dropoff_text: "'b'", pickup_at: "'2026-11-10 10:00'",
    passengers: "2", customer_name: "'Synthetic QA'", customer_email: "'qa@example.test'",
    customer_phone: "'+90'", customer_locale: "'tr'", allowed_collection_methods: "ARRAY['cash']::collection_method[]",
    lookup_token_hash: "'h'", fingerprint: "'pricing-qa'", status: "'confirmed'",
    policy_id: "'shuttle-split-v1'", site_commission_amount: "1000", agos_fee_amount: "500",
    supplier_entitlement: "3500", price_mode: "'FIXED_SHUTTLE'", ...overrides,
  };
  return `INSERT INTO booking (${Object.keys(fields).join(",")}) VALUES (${Object.values(fields).join(",")});`;
}
const unpriced = (overrides: Record<string, string> = {}) => booking({
  final_booking_price: "NULL", currency: "NULL", passengers: "6", status: "'request'",
  policy_id: "NULL", site_commission_amount: "NULL", agos_fee_amount: "NULL", supplier_entitlement: "NULL",
  price_mode: "NULL", ...overrides,
});
const approve = (id = A, actorRole = "finance_manager", mfa = "true", reason = "synthetic six passenger approval") =>
  `INSERT INTO manual_price_approval (booking_id,actor_id,actor_role,mfa_verified,new_price_minor,reason)
   VALUES ('${id}','qa-manager','${actorRole}',${mfa},9000,'${reason}');`;
const manual = `UPDATE booking SET final_booking_price=9000,currency='EUR',price_mode='SHUTTLE_MANUAL_APPROVED',
  status='confirmed',policy_id='shuttle-split-v1',site_commission_amount=1800,agos_fee_amount=900,supplier_entitlement=6300${where}`;
const reprice = `UPDATE booking SET final_booking_price=6000,site_commission_amount=1200,
  agos_fee_amount=600,supplier_entitlement=4200${where}`;
const event = (kind: "collection" | "refund", amount: number) =>
  `INSERT INTO booking_money_event (id,booking_id,kind,amount,method,collector,reference,at)
   VALUES ('00000000-0000-4000-8000-00000000${kind === "collection" ? "e001" : "e002"}',
     '${A}','${kind}',${amount},'cash','supplier','QA-${kind}','2026-11-10 12:00+03');`;
const tariff = (totals: string) => `INSERT INTO shuttle_tariff_version
  (id,approval,published_at,currency,routes,valid_from,max_passengers,totals_minor)
  VALUES ('qa-pricing','proposed','2026-11-03','EUR',ARRAY['AYT-ALN'],'2026-11-03',10,${totals});`;

// Signal after acquiring the booking lock; the second connection must wait for
// the first transaction rather than relying on scheduler-dependent launch order.
async function lockedTransaction(db: string, sql: string) {
  const child = spawn(cmd, args(db));
  let output = "";
  let signal!: () => void;
  const ready = new Promise<void>((resolveReady) => { signal = resolveReady; });
  const timer = setTimeout(() => child.kill(), 10_000);
  const done = new Promise<{ status: number | null; out: string }>((resolveDone, reject) => {
    child.stdout.on("data", (data) => { output += String(data); if (output.includes("LOCK_READY")) signal(); });
    child.stderr.on("data", (data) => { output += String(data); });
    child.on("error", (err) => { clearTimeout(timer); reject(err); });
    child.on("close", (status) => { clearTimeout(timer); resolveDone({ status, out: output }); });
  });
  child.stdin.end(`BEGIN; SET LOCAL ROLE ag_platform; SET LOCAL app.scope='platform';
${sql}
\\echo LOCK_READY
SELECT pg_sleep(0.5);
COMMIT;`);
  await Promise.race([ready, done.then((r) => { throw new Error(`lock not acquired: ${r.out}`); })]);
  return { done };
}

async function oldSnapshot(db: string, id: string) {
  const child = spawn(cmd, args(db));
  let output = "";
  let signal!: () => void;
  const ready = new Promise<void>((resolveReady) => { signal = resolveReady; });
  const timer = setTimeout(() => child.kill(), 10_000);
  const done = new Promise<{ status: number | null; out: string }>((resolveDone, reject) => {
    child.stdout.on("data", (data) => { output += String(data); if (output.includes("SNAPSHOT_READY")) signal(); });
    child.stderr.on("data", (data) => { output += String(data); });
    child.on("error", (err) => { clearTimeout(timer); reject(err); });
    child.on("close", (status) => { clearTimeout(timer); resolveDone({ status, out: output }); });
  });
  child.stdin.write(`BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL ROLE ag_platform; SET LOCAL app.scope='platform';
SELECT id FROM booking WHERE id='${id}';
\\echo SNAPSHOT_READY
`);
  await Promise.race([ready, done.then((r) => { throw new Error(`snapshot not established: ${r.out}`); })]);
  return { finish: (sql: string) => { child.stdin.end(sql + "COMMIT;"); return done; } };
}

describe("QA-F4 P pricing integrity — disposable PG16", {
  skip: RUN ? false : "AG_TEST_PG=1 + AG_TEST_PG_ISOLATED=YES required (NOT RUN)",
}, () => {
  const db = `ag_f4_pricing_${process.pid}`;
  const accepted = (sql: string) => {
    const r = psql(db, sql);
    assert.equal(r.status, 0, r.out);
    return r.out.trim();
  };
  const denied = (sql: string, reason: string) => {
    const r = psql(db, sql);
    assert.notEqual(r.status, 0, `unexpected acceptance: ${sql}`);
    assert.match(r.out, /23514:/, r.out);
    assert.ok(r.out.includes(reason), `wrong rejection: ${r.out}`);
  };
  before(() => {
    assert.equal(psql("postgres", `CREATE DATABASE ${db};`).status, 0);
    for (const name of readdirSync(DIR).filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) {
      accepted(readFileSync(resolve(DIR, name), "utf8"));
    }
    accepted(`INSERT INTO partner (id,legal_name,billing_email) VALUES ('p1','QA','qa@example.test');
INSERT INTO site (id,ownership,partner_id,owner_email,whatsapp_e164,owner_party_id)
VALUES ('site-one','partner','p1','qa@example.test','+905550000001','p1');`);
  });
  after(() => {
    const r = psql("postgres", `DROP DATABASE IF EXISTS ${db};`);
    assert.equal(r.status, 0, r.out);
  });

  it("accepts all 1–4 automatic group totals under the scoped platform role", () => {
    for (const [i, total] of [3000, 5000, 6000, 7000].entries()) {
      const out = accepted(platform(booking({ passengers: String(i + 1), final_booking_price: String(total),
        site_commission_amount: String(total * 0.2), agos_fee_amount: String(total * 0.1),
        supplier_entitlement: String(total * 0.7) }) + `SELECT passengers,final_booking_price FROM booking${where}`));
      assert.equal(out, `${i + 1}|${total}`);
    }
  });

  it("accepts the unpriced request → MFA approval → matching manual price under RLS", () => {
    const out = accepted(platform(unpriced() + approve() + manual +
      `SELECT passengers,final_booking_price,price_mode,status,price_locked_at IS NULL FROM booking${where}`));
    assert.equal(out, "6|9000|SHUTTLE_MANUAL_APPROVED|confirmed|t");
  });

  it("accepts permitted repricing before delivery/collection and preserves the new split", () => {
    const out = accepted(platform(booking() + reprice +
      `SELECT final_booking_price,site_commission_amount,agos_fee_amount,supplier_entitlement FROM booking${where}`));
    assert.equal(out, "6000|1200|600|4200");
  });

  it("accepts post-delivery notes, first supplier assignment, collection, refund and cash-cache synchronization", () => {
    const out = accepted(platform(booking({ status: "'delivered'" }) +
      `UPDATE booking SET notes='reviewed',supplier_id='sup-a'${where}` + event("collection", 2000) + event("refund", 500) +
      `UPDATE booking SET collected_amount=2000,refunded_amount=500${where}
SELECT final_booking_price,notes,supplier_id,collected_amount,refunded_amount,price_locked_at IS NOT NULL FROM booking${where}`));
    assert.equal(out, "5000|reviewed|sup-a|2000|500|t");
  });

  it("rejects 5+ automatic pricing on INSERT and UPDATE for the passenger rule", () => {
    denied(platform(booking({ passengers: "5" })), "AG_F4_SHUTTLE_AUTO_PRICE_PASSENGERS");
    denied(platform(booking() + `UPDATE booking SET passengers=5${where}`), "AG_F4_SHUTTLE_AUTO_PRICE_PASSENGERS");
  });

  it("rejects manual pricing without approval, including NULL/SITE_PRICE mode bypasses", () => {
    for (const mode of ["'SHUTTLE_MANUAL_APPROVED'", "NULL", "'SITE_PRICE'"]) {
      denied(platform(booking({ passengers: "6", price_mode: mode })), "AG_F4_MANUAL_PRICE_APPROVAL_REQUIRED");
      denied(platform(unpriced() + `UPDATE booking SET final_booking_price=9000,currency='EUR',price_mode=${mode}${where}`),
        "AG_F4_MANUAL_PRICE_APPROVAL_REQUIRED");
    }
  });

  it("rejects a mismatched approved amount and another booking's approval", () => {
    denied(platform(unpriced() + approve() + manual.replaceAll("9000", "8000")), "AG_F4_MANUAL_PRICE_APPROVAL_REQUIRED");
    denied(platform(unpriced() + approve() + unpriced({ id: `'${B}'`, ref: "'AG-QPPP23'" }) + manual.replaceAll(A, B)),
      "AG_F4_MANUAL_PRICE_APPROVAL_REQUIRED");
  });

  it("rejects approval of automatic, private and already priced bookings", () => {
    denied(platform(booking() + approve()), "AG_F4_MANUAL_PRICE_BOOKING_INELIGIBLE");
    denied(platform(unpriced({ service_type: "'private'", route_code: "NULL" }) + approve()), "AG_F4_MANUAL_PRICE_BOOKING_INELIGIBLE");
    denied(platform(unpriced() + approve() + manual + approve()), "AG_F4_MANUAL_PRICE_BOOKING_INELIGIBLE");
  });

  it("keeps an existing manual approval attached to an eligible 5+ shuttle", () => {
    for (const change of ["passengers=2", "service_type='private',route_code=NULL"]) {
      denied(platform(unpriced() + approve() + `UPDATE booking SET ${change}${where}`), "AG_F4_MANUAL_PRICE_BOOKING_INELIGIBLE");
    }
  });

  it("preserves MFA, manager-role, reason and append-only approval controls", () => {
    for (const [role, mfa, reason, constraint] of [
      ["finance_manager", "false", "valid synthetic reason", "manual_price_approval_mfa_verified_check"],
      ["operator", "true", "valid synthetic reason", "manual_price_approval_actor_role_check"],
      ["finance_manager", "true", " ", "manual_price_approval_reason_check"],
    ]) denied(platform(unpriced() + approve(A, role, mfa, reason)), constraint!);
    for (const statement of ["UPDATE manual_price_approval SET new_price_minor=10000", "DELETE FROM manual_price_approval"]) {
      const r = psql(db, `BEGIN;${unpriced()}${approve()}${statement};ROLLBACK;`);
      assert.notEqual(r.status, 0, r.out);
      assert.match(r.out, /manual_price_approval is append-only/);
    }
  });

  it("accepts positive tariff vectors and updates; rejects count, shape, NULL, zero and negative totals", () => {
    for (const totals of ["ARRAY[3000]", "ARRAY[3000,5000]", "ARRAY[3000,5000,6000]", "ARRAY[3000,5000,6000,7000]"]) {
      accepted(`BEGIN;${tariff(`${totals}::bigint[]`)}UPDATE shuttle_tariff_version SET totals_minor=ARRAY[3100,5100] WHERE id='qa-pricing';ROLLBACK;`);
    }
    for (const [totals, reason] of [
      ["ARRAY[3000,5000,6000,7000,8000]::bigint[]", "AG_F4_TARIFF_AUTO_TOTAL_COUNT"],
      ["ARRAY[[3000,5000],[6000,7000]]::bigint[]", "AG_F4_TARIFF_AUTO_TOTAL_COUNT"],
      ["'[0:1]={3000,5000}'::bigint[]", "AG_F4_TARIFF_AUTO_TOTAL_COUNT"],
      ["ARRAY[NULL,5000]::bigint[]", "AG_F4_TARIFF_TOTAL_INVALID"],
      ["ARRAY[0,5000]::bigint[]", "AG_F4_TARIFF_TOTAL_INVALID"],
      ["ARRAY[3000,-1]::bigint[]", "AG_F4_TARIFF_TOTAL_INVALID"],
    ]) {
      denied(`BEGIN;${tariff(totals!)}ROLLBACK;`, reason!);
      denied(`BEGIN;${tariff("ARRAY[3000,5000]::bigint[]")}UPDATE shuttle_tariff_version SET totals_minor=${totals} WHERE id='qa-pricing';ROLLBACK;`, reason!);
    }
  });

  it("freezes the complete price snapshot, split and pricing inputs after delivery", () => {
    for (const change of [
      "final_booking_price=6000", "currency='USD'", "price_mode=NULL", "price_source_version='other'",
      "price_frozen_at=clock_timestamp()", "policy_id=NULL", "site_commission_amount=900",
      "agos_fee_amount=400", "supplier_entitlement=3000", "service_type='private',route_code=NULL",
      "passengers=3", "route_code='ALN-AYT'", "price_locked_at=NULL",
    ]) denied(platform(booking({ status: "'delivered'" }) + `UPDATE booking SET ${change}${where}`), "AG_F4_BOOKING_PRICE_FROZEN");
  });

  it("freezes on completion evidence even with a confirmed status, including same- and two-step clearing attempts", () => {
    const completed = booking({ completed_at: "'2026-11-10 12:00+03'" });
    denied(platform(completed + reprice.replace("SET ", "SET completed_at=NULL,")), "AG_F4_BOOKING_PRICE_FROZEN");
    denied(platform(completed + `UPDATE booking SET completed_at=NULL${where}` + reprice), "AG_F4_BOOKING_PRICE_FROZEN");
  });

  it("freezes on collection ledger evidence before cash-cache synchronization and after a full refund", () => {
    denied(platform(booking() + event("collection", 5000) + reprice), "AG_F4_BOOKING_PRICE_FROZEN");
    denied(platform(booking() + event("collection", 5000) + event("refund", 5000) +
      `UPDATE booking SET collected_amount=5000,refunded_amount=5000${where}` + reprice), "AG_F4_BOOKING_PRICE_FROZEN");
  });

  it("site app cannot forge platform scope to write a manual approval", () => {
    const r = psql(db, `BEGIN;${unpriced()}SET SESSION AUTHORIZATION ag_app;
SET LOCAL app.scope='platform';${approve()}COMMIT;`);
    assert.notEqual(r.status, 0, r.out);
    assert.match(r.out, /permission denied for table manual_price_approval/);
  });

  it("serializes approval with a concurrent passenger-count change", async () => {
    accepted(unpriced());
    const first = await lockedTransaction(db, approve());
    const second = psql(db, platform(`UPDATE booking SET passengers=2${where}`));
    const result = await first.done;
    assert.equal(result.status, 0, result.out);
    assert.notEqual(second.status, 0, second.out);
    assert.match(second.out, /AG_F4_MANUAL_PRICE_BOOKING_INELIGIBLE/);
    assert.equal(accepted(`SELECT passengers FROM booking${where}`), "6");
  });

  it("serializes collection with concurrent repricing while the cash cache is still zero", async () => {
    // Use the other fixture ID because the approval-race evidence is committed.
    accepted(booking({ id: `'${B}'`, ref: "'AG-QPPP23'" }));
    const first = await lockedTransaction(db, event("collection", 1000).replaceAll(A, B));
    const second = psql(db, platform(reprice.replaceAll(A, B)));
    const result = await first.done;
    assert.equal(result.status, 0, result.out);
    assert.notEqual(second.status, 0, second.out);
    assert.match(second.out, /AG_F4_BOOKING_PRICE_FROZEN/);
    assert.equal(accepted(`SELECT final_booking_price,collected_amount FROM booking WHERE id='${B}';`), "5000|0");
  });

  it("rejects stale REPEATABLE READ updates after an approval or collection commits", async () => {
    const c = "00000000-0000-4000-8000-00000000d003";
    const d = "00000000-0000-4000-8000-00000000d004";
    accepted(unpriced({ id: `'${c}'`, ref: "'AG-QPPP24'" }) + booking({ id: `'${d}'`, ref: "'AG-QPPP25'" }));
    for (const [id, evidence, change] of [
      [c, approve(c), `UPDATE booking SET passengers=2 WHERE id='${c}';`],
      [d, event("collection", 1000).replaceAll(A, d).replaceAll("e001", "e003"), reprice.replaceAll(A, d)],
    ]) {
      const old = await oldSnapshot(db, id!);
      accepted(`BEGIN; SET LOCAL ROLE ag_platform; SET LOCAL app.scope='platform';${evidence}COMMIT;`);
      const r = await old.finish(change!);
      assert.notEqual(r.status, 0, r.out);
      assert.match(r.out, /40001: could not serialize access due to concurrent update/);
    }
    assert.equal(accepted(`SELECT passengers FROM booking WHERE id='${c}';`), "6");
    assert.equal(accepted(`SELECT final_booking_price,collected_amount,price_locked_at IS NOT NULL FROM booking WHERE id='${d}';`), "5000|0|t");
  });
});

// PR3-N10: exact-cause, RLS, upgrade and concurrency checks for approval binding.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { after, before, describe, it } from "node:test";

const RUN = process.env.AG_TEST_PG === "1" && process.env.AG_TEST_PG_ISOLATED === "YES";
const CONTAINER = process.env.AG_TEST_PG_CONTAINER;
const DIR = resolve(import.meta.dirname, "../migrations");
const A = "00000000-0000-4000-8000-00000000a010";
const B = "00000000-0000-4000-8000-00000000a011";
const LEGACY = "00000000-0000-4000-8000-00000000b010";
const ERROR = "AG_F4_MANUAL_PRICE_SERVICE_IMMUTABLE";
const command = CONTAINER ? "docker" : "psql";
const args = (db: string) => [
  ...(CONTAINER ? ["exec", "-i", CONTAINER, "psql", "-U", "postgres"] : []),
  "-X", "-q", "-At", "-d", db, "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-f", "-",
];
function psql(db: string, sql: string) {
  const r = spawnSync(command, args(db), { input: sql, encoding: "utf8", timeout: 30_000 });
  return { status: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
}
const begin = "BEGIN; SET LOCAL ROLE ag_platform; SET LOCAL app.scope='platform';\n";
const platform = (sql: string) => begin + sql + "\nROLLBACK;";
const request = (id = A, ref = "AG-NNPP22", pax = 6, route = "AYT-ALN") => `INSERT INTO booking
  (id,selling_site_id,selling_party_id,service_type,ref,route_code,pickup_text,dropoff_text,pickup_at,
   passengers,customer_name,customer_email,customer_phone,customer_locale,allowed_collection_methods,
   lookup_token_hash,fingerprint,status)
VALUES ('${id}','site-one','p1','shuttle','${ref}','${route}','a','b','2026-12-10 10:00',${pax},
  'Synthetic QA','qa@example.test','+90','tr',ARRAY['cash']::collection_method[],'h','n10-fixture','request');`;
const approve = (id = A) => `INSERT INTO manual_price_approval
  (booking_id,actor_id,actor_role,mfa_verified,new_price_minor,reason)
VALUES ('${id}','qa-manager','finance_manager',true,9000,'synthetic service approval');`;
const price = (id = A, extra = "") => `UPDATE booking SET final_booking_price=9000,currency='EUR',
  price_mode='SHUTTLE_MANUAL_APPROVED',status='confirmed',policy_id='shuttle-split-v1',
  site_commission_amount=1800,agos_fee_amount=900,supplier_entitlement=6300${extra} WHERE id='${id}';`;
const change = (fields: string, id = A) => `UPDATE booking SET ${fields} WHERE id='${id}';`;

// Interactive psql provides a deterministic barrier: keep the transaction open
// after its row lock or snapshot is established, then explicitly finish it.
async function session(db: string, sql: string) {
  const child = spawn(command, args(db));
  let output = "";
  let signal!: () => void;
  const ready = new Promise<void>((resolveReady) => { signal = resolveReady; });
  const timer = setTimeout(() => child.kill(), 10_000);
  const done = new Promise<{ status: number | null; out: string }>((resolveDone, reject) => {
    child.stdout.on("data", (data) => { output += String(data); if (output.includes("SESSION_READY")) signal(); });
    child.stderr.on("data", (data) => { output += String(data); });
    child.on("error", (err) => { clearTimeout(timer); reject(err); });
    child.on("close", (status) => { clearTimeout(timer); resolveDone({ status, out: output }); });
  });
  child.stdin.write(sql + "\n\\echo SESSION_READY\n");
  await Promise.race([ready, done.then((r) => { throw new Error(`session failed: ${r.out}`); })]);
  return { finish: (tail: string) => { child.stdin.end(tail); return done; } };
}

describe("PR3-N10 approval service freeze — disposable PG16", {
  skip: RUN ? false : "AG_TEST_PG=1 + AG_TEST_PG_ISOLATED=YES required (NOT RUN)",
}, () => {
  const db = `ag_n10_freeze_${process.pid}`;
  const accepted = (sql: string) => {
    const r = psql(db, sql);
    assert.equal(r.status, 0, r.out);
    return r.out.trim();
  };
  const denied = (sql: string, reason = ERROR) => {
    const r = psql(db, sql);
    assert.notEqual(r.status, 0, `unexpected acceptance: ${sql}`);
    assert.match(r.out, /23514:/, r.out);
    assert.ok(r.out.includes(reason), `wrong rejection: ${r.out}`);
  };
  before(() => {
    assert.equal(psql("postgres", `CREATE DATABASE ${db};`).status, 0);
    const migrations = readdirSync(DIR).filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort();
    for (const name of migrations.filter((n) => n < "0014")) accepted(readFileSync(resolve(DIR, name), "utf8"));
    accepted(`INSERT INTO partner (id,legal_name,billing_email) VALUES ('p1','QA','qa@example.test');
INSERT INTO site (id,ownership,partner_id,owner_email,whatsapp_e164,owner_party_id)
VALUES ('site-one','partner','p1','qa@example.test','+905550000001','p1');`);
    // An approval that already exists when the additive migration is installed.
    accepted(begin + request(LEGACY, "AG-NNPP29") + approve(LEGACY) + price(LEGACY) + "COMMIT;");
    for (const name of migrations.filter((n) => n >= "0014")) accepted(readFileSync(resolve(DIR, name), "utf8"));
  });
  after(() => {
    const r = psql("postgres", `DROP DATABASE IF EXISTS ${db};`);
    assert.equal(r.status, 0, r.out);
  });

  it("allows changes to an unpriced request before approval", () => {
    assert.equal(accepted(platform(request() + change("passengers=8,route_code='AYT-KNY'") +
      `SELECT passengers,route_code FROM booking WHERE id='${A}';`)), "8|AYT-KNY");
    assert.equal(accepted(platform(request() + change("service_type='private',route_code=NULL") +
      `SELECT service_type,route_code IS NULL FROM booking WHERE id='${A}';`)), "private|t");
  });

  it("keeps same-service pricing, pickup-text/notes edits and first supplier assignment valid under RLS", () => {
    const out = accepted(platform(request() + approve() + change("passengers=6,route_code='AYT-ALN',service_type='shuttle',notes='before price'") +
      price() + change("pickup_text='a2',notes='reviewed',supplier_id='sup-a'") +
      `SELECT passengers,route_code,final_booking_price,pickup_text,notes,supplier_id FROM booking WHERE id='${A}';`));
    assert.equal(out, "6|AYT-ALN|9000|a2|reviewed|sup-a");
  });

  it("rejects passenger/route changes after approval, including the same UPDATE that sets the price", () => {
    for (const fields of ["passengers=16", "route_code='AYT-KNY'", "passengers=8,route_code='ALN-AYT'"]) {
      denied(platform(request() + approve() + change(fields)));
      denied(platform(request() + approve() + price(A, "," + fields)));
      denied(platform(request() + approve() + price() + change(fields)));
    }
  });

  it("preserves the existing exact eligibility rejection for a service-type change", () => {
    for (const priced of [false, true]) {
      denied(platform(request() + approve() + (priced ? price() : "") + change("service_type='private',route_code=NULL")),
        "AG_F4_MANUAL_PRICE_BOOKING_INELIGIBLE");
    }
  });

  it("cannot unlock the service by keeping price mode NULL or cancelling the approved request", () => {
    denied(platform(request() + approve() + change("price_mode=NULL,passengers=16")));
    denied(platform(request() + approve() + change("status='cancelled'") + change("route_code='AYT-KNY'")));
  });

  it("allows pre-delivery cancellation and a different service on a NEW booking with its own approval", () => {
    const out = accepted(platform(request() + approve() + price() + change("status='cancelled',cancelled_at=clock_timestamp()") +
      request(B, "AG-NNPP23", 8, "AYT-KNY") + approve(B) + price(B) +
      `SELECT status,passengers,route_code FROM booking WHERE id IN ('${A}','${B}') ORDER BY id;`));
    assert.equal(out, "cancelled|6|AYT-ALN\nconfirmed|8|AYT-KNY");
  });

  it("protects an existing 0013 approval immediately, while allowing same-service edits", () => {
    denied(platform(change("passengers=16", LEGACY)));
    denied(platform(change("route_code='AYT-KNY'", LEGACY)));
    assert.equal(accepted(platform(change("notes='retained approval'", LEGACY) +
      `SELECT passengers,route_code,notes FROM booking WHERE id='${LEGACY}';`)), "6|AYT-ALN|retained approval");
  });

  it("serializes a new approval against a concurrent still-eligible passenger change", async () => {
    accepted(request());
    const first = await session(db, begin + approve());
    const second = await session(db, begin + "SET LOCAL application_name='n10-service-update';");
    // The second UPDATE is submitted while approval holds the row lock.
    const pending = second.finish(change("passengers=16") + "COMMIT;");
    let waitedForLock = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      waitedForLock = accepted(`SELECT EXISTS (SELECT 1 FROM pg_stat_activity
        WHERE datname='${db}' AND application_name='n10-service-update' AND wait_event_type='Lock');`) === "t";
      if (waitedForLock) break;
      await new Promise((resolveWait) => setTimeout(resolveWait, 10));
    }
    const approved = await first.finish("COMMIT;");
    assert.equal(approved.status, 0, approved.out);
    const changed = await pending;
    assert.ok(waitedForLock, "concurrent UPDATE did not wait for approval's booking-row lock");
    assert.notEqual(changed.status, 0, changed.out);
    assert.match(changed.out, /23514: AG_F4_MANUAL_PRICE_SERVICE_IMMUTABLE/);
    assert.equal(accepted(`SELECT passengers FROM booking WHERE id='${A}';`), "6");
  });

  it("an older REPEATABLE READ snapshot cannot miss a new approval and change route", async () => {
    accepted(request(B, "AG-NNPP23"));
    const old = await session(db, `BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL ROLE ag_platform; SET LOCAL app.scope='platform'; SELECT id FROM booking WHERE id='${B}';`);
    accepted(begin + approve(B) + "COMMIT;");
    const changed = await old.finish(change("route_code='AYT-KNY'", B) + "COMMIT;");
    assert.notEqual(changed.status, 0, changed.out);
    assert.match(changed.out, /40001: could not serialize access due to concurrent update/);
    assert.equal(accepted(`SELECT route_code FROM booking WHERE id='${B}';`), "AYT-ALN");
  });
});

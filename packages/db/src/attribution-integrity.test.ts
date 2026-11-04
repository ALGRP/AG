// QA-F4 T positive paths, PostgreSQL 16 disposable only. No staging or CRS.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { after, before, describe, it } from "node:test";

const RUN = process.env.AG_TEST_PG === "1" && process.env.AG_TEST_PG_ISOLATED === "YES";
const CONTAINER = process.env.AG_TEST_PG_CONTAINER;
const ROOT = resolve(import.meta.dirname, "../../..");
const readMigration = (name: string) => readFileSync(resolve(ROOT, "packages/db/migrations", name), "utf8");
const qa = readFileSync(resolve(ROOT, "qa-independent/sql/qa_probes.sql"), "utf8");
const setup = qa.slice(0, qa.indexOf("\\echo SETUP_DONE") + "\\echo SETUP_DONE".length);

function psql(db: string, sql: string): { status: number | null; out: string } {
  const cmd = CONTAINER ? "docker" : "psql";
  const args = CONTAINER
    ? ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-X", "-q", "-At", "-d", db, "-v", "ON_ERROR_STOP=1", "-f", "-"]
    : ["-X", "-q", "-At", "-d", db, "-v", "ON_ERROR_STOP=1", "-f", "-"];
  const r = spawnSync(cmd, args, { input: sql, encoding: "utf8", timeout: 30_000 });
  return { status: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
}

const columns = "id,selling_site_id,selling_party_id,supplier_id,service_type,final_booking_price,currency,ref,route_code,pickup_text,dropoff_text,pickup_at,passengers,customer_name,customer_email,customer_phone,customer_locale,allowed_collection_methods,lookup_token_hash,fingerprint,status,policy_id,site_commission_amount,agos_fee_amount,supplier_entitlement,price_mode";
function booking(id: string, ref: string, site: string, party: string, supplier: string, type: string,
  amount: number, siteFee: number, platformFee: number, carrierFee: number): string {
  const route = type === "shuttle" ? "'AYT-ALN'" : "NULL";
  const policy = type === "shuttle" ? "'shuttle-split-v1'" : "NULL";
  const mode = type === "shuttle" ? "'FIXED_SHUTTLE'" : "'SITE_PRICE'";
  return "INSERT INTO booking (" + columns + ") VALUES ('" + id + "','" + site + "','" + party +
    "','" + supplier + "','" + type + "'," + amount + ",'EUR','" + ref + "'," + route +
    ",'AYT','Alanya','2026-11-04 14:00',2,'QA Test','qa@example.test','+90','tr'," +
    "ARRAY['cash']::collection_method[],'lookhash','f" + ref + "','confirmed'," + policy +
    "," + siteFee + "," + platformFee + "," + carrierFee + "," + mode + ");";
}
const platform = (sql: string) => "BEGIN;\nSET LOCAL ROLE ag_platform;\nSET LOCAL app.scope='platform';\n" + sql + "\nCOMMIT;";

describe("QA-F4 T valid ownership, self-supply and private economics — disposable PG16", {
  skip: RUN ? false : "isolated PG16 opt-in required",
}, () => {
  const db = "ag_f4t_positive_" + process.pid;
  before(() => {
    if (!RUN) return;
    assert.equal(psql("postgres", "CREATE DATABASE " + db + ";").status, 0);
    const init = psql(db, readMigration("0001_network_core.sql"));
    assert.equal(init.status, 0, init.out);
    const seeded = psql(db, setup);
    assert.equal(seeded.status, 0, seeded.out);
    for (const name of ["0002_tenant_rls.sql", "0003_week_integrity.sql", "0004_entry_integrity.sql",
      "0005_money_events.sql", "0006_adjustments_audit.sql", "0007_adjustment_hardening.sql", "0008_attribution_integrity.sql"]) {
      const m = psql(db, readMigration(name));
      assert.equal(m.status, 0, name + " => " + m.out);
    }
  });
  after(() => {
    if (RUN) assert.equal(psql("postgres", "DROP DATABASE IF EXISTS " + db + ";").status, 0);
  });

  it("platform accepts normal shuttle, verified self-supplied shuttle and priced private business", () => {
    const q = [
      booking("00000000-0000-4000-8000-00000000f4b1", "AG-QTTT22", "site-one", "p1", "sup-a",
        "shuttle", 5000, 1000, 500, 3500),
      booking("00000000-0000-4000-8000-00000000f4b2", "AG-QTTT23", "site-self", "p3", "p3",
        "shuttle", 5000, 0, 500, 4500),
      booking("00000000-0000-4000-8000-00000000f4b3", "AG-QTTT24", "site-two", "p2", "sup-p",
        "private", 8000, 3250, 0, 4750),
    ];
    const inserted = psql(db, platform(q.join("\n")));
    assert.equal(inserted.status, 0, inserted.out);
    const count = psql(db, "SELECT count(*) FROM booking WHERE id::text LIKE '00000000-0000-4000-8000-00000000f4b%';");
    assert.equal(count.out.trim(), "3");
  });

  it("a future verification date never grants self-operation", () => {
    assert.equal(psql(db, "UPDATE site SET self_operation_verified_at='2099-01-01' WHERE id='site-self';").status, 0);
    const attempt = psql(db, platform(booking("00000000-0000-4000-8000-00000000f4b4", "AG-QTTT25",
      "site-self", "p3", "p3", "shuttle", 5000, 0, 500, 4500)));
    assert.notEqual(attempt.status, 0);
    assert.match(attempt.out, /AG_F4_BOOKING_SELF_SUPPLY_UNVERIFIED/);
  });

  it("ag_app cannot escalate into the platform booking writer", () => {
    const query = booking("00000000-0000-4000-8000-00000000f4b5", "AG-QTTT26",
      "site-one", "p1", "sup-a", "shuttle", 5000, 1000, 500, 3500);
    const result = psql(db, "BEGIN;\nSET SESSION AUTHORIZATION ag_app;\nSET LOCAL app.scope='platform';\n" + query + "\nCOMMIT;");
    assert.notEqual(result.status, 0);
    assert.equal(psql(db, "SELECT count(*) FROM booking WHERE ref='AG-QTTT26';").out.trim(), "0");
  });
});

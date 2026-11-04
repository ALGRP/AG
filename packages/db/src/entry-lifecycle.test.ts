// QA-F4 E: real positive share-entry lifecycles in disposable PostgreSQL 16 only.
// Explicit opt-in: AG_TEST_PG=1 AG_TEST_PG_ISOLATED=YES; no staging or real CRS.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { after, before, describe, it } from "node:test";

const RUN = process.env.AG_TEST_PG === "1" && process.env.AG_TEST_PG_ISOLATED === "YES";
const CONTAINER = process.env.AG_TEST_PG_CONTAINER;
const ROOT = resolve(import.meta.dirname, "../../..");
const migration = (id: string) => readFileSync(resolve(ROOT, "packages/db/migrations", id), "utf8");

function psql(db: string, sql: string): { status: number | null; out: string } {
  const args = CONTAINER
    ? ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-X", "-q", "-At", "-d", db, "-v", "ON_ERROR_STOP=1", "-f", "-"]
    : ["-X", "-q", "-At", "-d", db, "-v", "ON_ERROR_STOP=1", "-f", "-"];
  const proc = spawnSync(CONTAINER ? "docker" : "psql", args, { input: sql, encoding: "utf8", timeout: 30_000 });
  return { status: proc.status, out: (proc.stdout ?? "") + (proc.stderr ?? "") };
}

const ID = "00000000-0000-4000-8000-00000000f400";
const E1 = "00000000-0000-4000-8000-00000000e400";
const E2 = "00000000-0000-4000-8000-00000000e401";
const E3 = "00000000-0000-4000-8000-00000000e402";
const seedTemplate = [
  "INSERT INTO partner (id, legal_name, billing_email) VALUES ('p1','P1','b@x.test');",
  "INSERT INTO site (id, ownership, partner_id, owner_email, whatsapp_e164, owner_party_id) VALUES ('site-one','partner','p1','o@x.test','+905550000001','p1');",
  "INSERT INTO booking (id, selling_site_id, selling_party_id, supplier_id, service_type, final_booking_price, currency, ref, route_code, pickup_text, dropoff_text, pickup_at, passengers, customer_name, customer_email, customer_phone, customer_locale, allowed_collection_methods, lookup_token_hash, fingerprint, status, policy_id, site_commission_amount, agos_fee_amount, supplier_entitlement, collected_amount, collection_method, collected_at, completed_at, price_mode, created_at)",
  "VALUES ('" + ID + "','site-one','p1','sup-a','shuttle',5000,'EUR','AG-QAEE44','AYT-ALN','a','b','__DAY__ 10:00',2,'Test','t@example.test','+90','tr',ARRAY['cash']::collection_method[],'hash','fingerprint','delivered','shuttle-split-v1',1000,500,3500,3000,'cash','__DAY__ 10:00+03','__DAY__ 12:00+03','FIXED_SHUTTLE','__DAY__ 09:00+03');",
  "INSERT INTO booking_money_event (id, booking_id, kind, amount, method, collector, reference, at) VALUES ('00000000-0000-4000-8000-00000000d400','" + ID + "','collection',3000,'cash','supplier','SLIP-PARTIAL-1','__DAY__ 10:00+03');",
].join("\n");
const seed = (day: string) => seedTemplate.replaceAll("__DAY__", day);

function close(week: string, entryId: string, kind: string, before: number, afterValue: number, site: number, agos: number, supplier: number): string {
  const start = "ag_f4_week_start('" + week + "')";
  return [
    "BEGIN;",
    "SET LOCAL ROLE ag_platform;",
    "SET LOCAL app.scope = 'platform';",
    "INSERT INTO settlement_week (week_id, period_start, period_end, payment_due, report_snapshot)",
    "SELECT '" + week + "', " + start + ", " + start + " + interval '7 days', " + start + " + interval '8 days 18 hours', '{}'::jsonb;",
    "INSERT INTO settlement_entry (id, week_id, booking_id, kind, base_before, base_after, collected_delta, site_delta, agos_delta, supplier_delta, currency, policy_id)",
    "VALUES ('" + entryId + "','" + week + "','" + ID + "','" + kind + "'," + before + "," + afterValue + "," + (afterValue - before) + "," + site + "," + agos + "," + supplier + ",'EUR','shuttle-split-v1');",
    "COMMIT;",
  ].join("\n");
}
function nextCollection(day: string, amount = 2000): string {
  return [
    "BEGIN;",
    "SET LOCAL ROLE ag_platform;",
    "SET LOCAL app.scope='platform';",
    "INSERT INTO booking_money_event (id, booking_id, kind, amount, method, collector, reference, at)",
    "VALUES ('00000000-0000-4000-8000-00000000d401','" + ID + "','collection'," + amount + ",'cash','supplier','SLIP-PARTIAL-2','" + day + " 10:00+03');",
    "COMMIT;",
  ].join("\n");
}

describe("QA-F4 E — positive atomic financial close and legacy share handling (PG16 disposable)", {
  skip: RUN ? false : "AG_TEST_PG=1 + AG_TEST_PG_ISOLATED=YES required (NOT RUN)",
}, () => {
  const normalDb = "ag_f4e_normal_" + process.pid;
  const legacyDb = "ag_f4e_legacy_" + process.pid;
  const tinyDb = "ag_f4e_one_cent_" + process.pid;

  before(() => {
    if (!RUN) return;
    for (const [db, day] of [[normalDb, "2026-10-13"], [legacyDb, "2026-09-29"], [tinyDb, "2026-10-13"]] as const) {
      assert.equal(psql("postgres", "CREATE DATABASE " + db + ";").status, 0);
      assert.equal(psql(db, migration("0001_network_core.sql")).status, 0, "0001 migration");
      const fixtureSql = db === tinyDb
        ? seed(day).replace("3500,3000,'cash'", "3500,4,'cash'")
          .replace("'collection',3000,'cash'", "'collection',4,'cash'")
        : seed(day);
      const fixture = psql(db, fixtureSql);
      assert.equal(fixture.status, 0, fixture.out);
      for (const name of ["0002_tenant_rls.sql", "0003_week_integrity.sql"]) {
        const applied = psql(db, migration(name));
        assert.equal(applied.status, 0, name + ": " + applied.out);
      }
      if (db !== legacyDb) {
        const applied = psql(db, migration("0004_entry_integrity.sql"));
        assert.equal(applied.status, 0, applied.out);
      }
    }
  });

  after(() => {
    if (!RUN) return;
    for (const db of [normalDb, legacyDb, tinyDb]) {
      assert.equal(psql("postgres", "DROP DATABASE IF EXISTS " + db + ";").status, 0);
    }
  });

  it("E-POSITIVE: 30 EUR then 20 EUR in two consecutive finished weeks has exactly 6/3/21 then 4/2/14", () => {
    const w42 = psql(normalDb, close("2026-W42", E1, "collection", 0, 3000, 600, 300, 2100));
    assert.equal(w42.status, 0, w42.out);
    const collected = psql(normalDb, nextCollection("2026-10-20"));
    assert.equal(collected.status, 0, collected.out);
    const w43 = psql(normalDb, close("2026-W43", E2, "collection", 3000, 5000, 400, 200, 1400));
    assert.equal(w43.status, 0, w43.out);
    const rows = psql(normalDb,
      "SELECT week_id || ':' || collected_delta || ':' || site_delta || ':' || agos_delta || ':' || supplier_delta FROM settlement_entry ORDER BY week_id;");
    assert.equal(rows.status, 0, rows.out);
    assert.deepEqual(rows.out.trim().split("\n"), [
      "2026-W42:3000:600:300:2100",
      "2026-W43:2000:400:200:1400",
    ]);
  });

  it("E-H23: one-cent next collection permits a negative one-cent AGOS delta (current rounding only)", () => {
    const w42 = psql(tinyDb, close("2026-W42", E1, "collection", 0, 4, 0, 2, 2));
    assert.equal(w42.status, 0, w42.out);
    const collected = psql(tinyDb, nextCollection("2026-10-20", 1));
    assert.equal(collected.status, 0, collected.out);
    const w43 = psql(tinyDb, close("2026-W43", E2, "collection", 4, 5, 1, -1, 1));
    assert.equal(w43.status, 0, w43.out);
    const delta = psql(tinyDb,
      "SELECT collected_delta || ':' || site_delta || ':' || agos_delta || ':' || supplier_delta FROM settlement_entry WHERE week_id='2026-W43';");
    assert.equal(delta.status, 0, delta.out);
    assert.equal(delta.out.trim(), "1:1:-1:1");
  });

  it("E-D-F05/F06: legacy discrepant shares do not block later cash, then cancellation reverses exact recorded shares", () => {
    // Before 0004, represent a historical accepted row with a 50-cent site/AGOS mismatch.
    const oldClose = psql(legacyDb, close("2026-W40", E1, "collection", 0, 3000, 550, 350, 2100));
    assert.equal(oldClose.status, 0, oldClose.out);
    const migrated = psql(legacyDb, migration("0004_entry_integrity.sql"));
    assert.equal(migrated.status, 0, migrated.out);
    const collected = psql(legacyDb, nextCollection("2026-10-06"));
    assert.equal(collected.status, 0, collected.out);
    const next = psql(legacyDb, close("2026-W41", E2, "collection", 3000, 5000, 400, 200, 1400));
    assert.equal(next.status, 0, next.out);
    const cancelled = psql(legacyDb, close("2026-W42", E3, "cancellation_reversal", 5000, 0, -950, -550, -3500));
    assert.equal(cancelled.status, 0, cancelled.out);
    const shares = psql(legacyDb,
      "SELECT coalesce(sum(collected_delta),0)::text || ':' || coalesce(sum(site_delta),0)::text || ':' || coalesce(sum(agos_delta),0)::text || ':' || coalesce(sum(supplier_delta),0)::text FROM settlement_entry;");
    assert.equal(shares.status, 0, shares.out);
    assert.equal(shares.out.trim(), "0:0:0:0");
  });
});

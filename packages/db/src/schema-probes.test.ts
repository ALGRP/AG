// Veritabanı şema adayı için negatif problar — gerçek PostgreSQL ister.
// Çalıştırma: AG_TEST_PG=1 ve PGHOST / PGPORT / PGUSER (ör. yerel atılabilir küme). Ayar yoksa test ATLANIR;
// atlanan test geçti sayılmaz. Problar kopyalanmaz: mevcut SQL dosyaları çalıştırılır ve her ERROR, dosyadaki
// işarete (ör. "-- P3", "\echo Q07") bağlanır.
//  · packages/db/probes/0001_probes.sql  → P1–P16 reddedilmeli, OK blokları kabul edilmeli (bugün geçer)
//  · qa-independent/sql/qa_probes.sql   → C01–C05 reddedilmeli (bugün geçer); Q01–Q35 reddedilmeli (QA-F4, todo)
//  · QA-F3 (DB): defter tablolarında satır düzeyi güvenlik (todo)
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { after, before, describe, it } from "node:test";

const ROOT = resolve(import.meta.dirname, "../../..");
const MIGRATION = resolve(ROOT, "packages/db/migrations/0001_network_core.sql");
const RLS_MIGRATION = resolve(ROOT, "packages/db/migrations/0002_tenant_rls.sql");
const WEEK_MIGRATION = resolve(ROOT, "packages/db/migrations/0003_week_integrity.sql");
const ENTRY_MIGRATION = resolve(ROOT, "packages/db/migrations/0004_entry_integrity.sql");
const MONEY_MIGRATION = resolve(ROOT, "packages/db/migrations/0005_money_events.sql");
const AUDIT_MIGRATION = resolve(ROOT, "packages/db/migrations/0006_adjustments_audit.sql");
const HARDEN_MIGRATION = resolve(ROOT, "packages/db/migrations/0007_adjustment_hardening.sql");
const ATTRIBUTION_MIGRATION = resolve(ROOT, "packages/db/migrations/0008_attribution_integrity.sql");
const ATTRIBUTION_PROBES: Readonly<Record<string, string>> = {
  Q33: "AG_F4_BOOKING_SELLING_PARTY_MISMATCH",
  Q34: "AG_F4_BOOKING_SUPPLIER_ID_NOT_CANONICAL",
  Q35: "AG_F4_PRIVATE_SUPPLIER_EXCEEDS_PRICE",
};
const AUDIT_PROBES: Readonly<Record<string, string>> = {
  Q17: "AG_F4_OFFSET_APPROVAL_REQUIRED",
  Q19: "AG_F4_DISPUTE_NOT_ACCEPTED",
};
const MONEY_PROBES: Readonly<Record<string, string>> = {
  Q12: "AG_F4_REFUND_EXCEEDS_COLLECTED",
  Q13: "AG_F4_SHUTTLE_COLLECTOR_NOT_SUPPLIER",
  Q15: "AG_F4_COLLECTED_AMOUNT_DRIFT",
  Q16: "AG_F4_RECEIPT_DUPLICATE",
};
const ENTRY_PROBES: Readonly<Record<string, string>> = {
  Q01: "AG_F4_ENTRY_BASE_MISMATCH",
  Q02: "AG_F4_ENTRY_EXCEEDS_PRICE",
  Q03: "AG_F4_ENTRY_SPLIT_MISMATCH",
  Q04: "AG_F4_PRIVATE_AGOS_NONZERO",
  Q10: "AG_F4_ENTRY_POLICY_INVALID",
  Q11: "AG_F4_ENTRY_CURRENCY_MISMATCH",
};
const WEEK_PROBES: Readonly<Record<string, string>> = {
  Q05: "AG_F4_CLOSED_WEEK_ENTRY",
  Q06: "AG_F4_WEEK_NOT_FINISHED",
  Q07: "AG_F4_WEEK_OUT_OF_ORDER",
  Q08: "AG_F4_WEEK_PERIOD_MISMATCH",
  Q09: "AG_F4_WEEK_INVALID",
  Q14: "AG_F4_CLOSED_WEEK_MONEY_EVENT",
  Q18: "AG_F4_CLOSED_WEEK_ADJUSTMENT",
  Q20: "AG_F4_WEEK_INVALID",
};
const PROBES = resolve(ROOT, "packages/db/probes/0001_probes.sql");
const QA_PROBES = resolve(ROOT, "qa-independent/sql/qa_probes.sql");
const ENABLED = process.env.AG_TEST_PG === "1" && process.env.AG_TEST_PG_ISOLATED === "YES";
const CONTAINER = process.env.AG_TEST_PG_CONTAINER; // disposable, network-none container only
const LEDGER_TABLES = ["bank_receipt", "booking", "booking_money_event", "settlement_adjustment", "settlement_entry", "statement_dispute"];

function psql(db: string, args: readonly string[], input?: string): { status: number | null; out: string } {
  const cli = [...args];
  const fileAt = cli.indexOf("-f");
  // Docker cannot read the Mac's absolute paths; pass the unchanged original SQL via stdin.
  if (CONTAINER && fileAt >= 0 && cli[fileAt + 1] !== "-") {
    input = readFileSync(cli[fileAt + 1]!, "utf8");
    cli[fileAt + 1] = "-";
  }
  const cmd = CONTAINER ? "docker" : "psql";
  const argv = CONTAINER
    ? ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-X", "-q", "-d", db, ...cli]
    : ["-X", "-q", "-d", db, ...cli];
  const r = spawnSync(cmd, argv, { encoding: "utf8", input, timeout: 30_000 });
  return { status: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

/** SQL dosyasını işaretlerine böler ve her işaretin satır aralığına düşen ERROR sayısını döner. İşaretten önceki hatalar "PRE". */
function errorsByMarker(file: string, output: string, marker: RegExp): Map<string, number> {
  const marks: { id: string; line: number }[] = [];
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((text, i) => {
      const m = marker.exec(text);
      if (m) marks.push({ id: m[1]!, line: i + 1 });
    });
  const counts = new Map<string, number>([["PRE", 0], ...marks.map((m): [string, number] => [m.id, 0])]);
  for (const m of output.matchAll(/^psql:.*?:(\d+): ERROR:/gm)) {
    const at = Number(m[1]);
    let owner = "PRE";
    for (const k of marks) if (k.line <= at) owner = k.id;
    counts.set(owner, (counts.get(owner) ?? 0) + 1);
  }
  return counts;
}

const qIds = [...readFileSync(QA_PROBES, "utf8").matchAll(/^\\echo (Q\d+)\b/gm)].map((m) => m[1]!).filter((id) => id !== "Q21");

describe("DB şema adayı — negatif problar (PostgreSQL)", { skip: ENABLED ? false : "AG_TEST_PG=1 ve PGHOST/PGPORT/PGUSER gerekli (atlandı; geçti sayılmaz)" }, () => {
  const dbA = `ag_probe_${process.pid}_a`;
  const dbB = `ag_probe_${process.pid}_b`;
  const dbW = `ag_probe_${process.pid}_w`;
  const dbE = `ag_probe_${process.pid}_e`;
  const dbM = `ag_probe_${process.pid}_m`;
  const dbA6 = `ag_probe_${process.pid}_a6`;
  const dbT = `ag_probe_${process.pid}_t`;
  const weekResults = new Map<string, { status: number | null; out: string }>();
  const entryResults = new Map<string, { status: number | null; out: string }>();
  const moneyResults = new Map<string, { status: number | null; out: string }>();
  const auditResults = new Map<string, { status: number | null; out: string }>();
  const attributionResults = new Map<string, { status: number | null; out: string }>();
  let p0001 = new Map<string, number>();
  let pQa = new Map<string, number>();
  let q21 = "";
  let rls = "";
  let foreign = "";

  before(() => {
    for (const db of [dbA, dbB, dbW, dbE, dbM, dbA6, dbT]) {
      const c = psql("postgres", ["-c", `DROP DATABASE IF EXISTS ${db}`, "-c", `CREATE DATABASE ${db}`]);
      assert.equal(c.status, 0, c.out);
      const m = psql(db, ["-v", "ON_ERROR_STOP=1", "-f", MIGRATION]);
      assert.equal(m.status, 0, `migration: ${m.out}`);
    }
    // Keep the existing P1–P16, C01–C05 and non-W QA-F4 probes on the 0001 baseline.
    // Run the unchanged W-group statements separately against 0001->0002->0003,
    // so an unrelated legacy constraint cannot accidentally count as a W probe pass.
    const sourceLines = readFileSync(QA_PROBES, "utf8").split("\n");
    const setupEnd = sourceLines.findIndex((line) => line.trim() === "\\echo SETUP_DONE");
    assert.ok(setupEnd >= 0, "QA source has no setup marker");
    const seedSql = sourceLines.slice(0, setupEnd + 1).join("\n") + "\n";
    const seeded = psql(dbW, ["-v", "ON_ERROR_STOP=1", "-f", "-"], seedSql);
    assert.equal(seeded.status, 0, "W-group seed failed: " + seeded.out);
    for (const path of [RLS_MIGRATION, WEEK_MIGRATION]) {
      const migrated = psql(dbW, ["-v", "ON_ERROR_STOP=1", "-f", path]);
      assert.equal(migrated.status, 0, path + ": " + migrated.out);
    }
    for (const id of Object.keys(WEEK_PROBES)) {
      const start = sourceLines.findIndex((line) => line.startsWith("\\echo " + id + " "));
      assert.ok(start > setupEnd, "missing probe " + id);
      const stopIndex = sourceLines.findIndex((line, index) => index > start && line.startsWith("\\echo "));
      const stop = stopIndex < 0 ? sourceLines.length : stopIndex;
      const statement = "\\set VERBOSITY terse\n" + sourceLines.slice(start, stop).join("\n") + "\n";
      weekResults.set(id, psql(dbW, ["-v", "ON_ERROR_STOP=1", "-f", "-"], statement));
    }

    // QA-F4 E original SQL probes are run separately against the FULL 0001-0004
    // candidate. Assert the exact entry-integrity error, never count an unrelated
    // closed-week or RLS denial as success.
    const eSeed = psql(dbE, ["-v", "ON_ERROR_STOP=1", "-f", "-"], seedSql);
    assert.equal(eSeed.status, 0, "E-group seed failed: " + eSeed.out);
    for (const path of [RLS_MIGRATION, WEEK_MIGRATION, ENTRY_MIGRATION]) {
      const migrated = psql(dbE, ["-v", "ON_ERROR_STOP=1", "-f", path]);
      assert.equal(migrated.status, 0, "E-group migration " + path + ": " + migrated.out);
    }
    for (const id of Object.keys(ENTRY_PROBES)) {
      const start = sourceLines.findIndex((line) => line.startsWith("\\echo " + id + " "));
      assert.ok(start > setupEnd, "missing original SQL probe " + id);
      const stopIndex = sourceLines.findIndex((line, index) => index > start && line.startsWith("\\echo "));
      const stop = stopIndex < 0 ? sourceLines.length : stopIndex;
      const statement = "\\set VERBOSITY terse\n" + sourceLines.slice(start, stop).join("\n") + "\n";
      entryResults.set(id, psql(dbE, ["-v", "ON_ERROR_STOP=1", "-f", "-"], statement));
    }

    // QA-F4 M: repeat the unmodified Q12/Q13/Q15/Q16 probes on the
    // complete isolated 0001..0005 candidate and inspect the exact error.
    const moneySeed = psql(dbM, ["-v", "ON_ERROR_STOP=1", "-f", "-"], seedSql);
    assert.equal(moneySeed.status, 0, "M-group seed failed: " + moneySeed.out);
    for (const path of [RLS_MIGRATION, WEEK_MIGRATION, ENTRY_MIGRATION, MONEY_MIGRATION]) {
      const migrated = psql(dbM, ["-v", "ON_ERROR_STOP=1", "-f", path]);
      assert.equal(migrated.status, 0, "M-group migration " + path + ": " + migrated.out);
    }
    for (const id of Object.keys(MONEY_PROBES)) {
      const start = sourceLines.findIndex((line) => line.startsWith("\\echo " + id + " "));
      assert.ok(start > setupEnd, "missing original SQL probe " + id);
      const stopIndex = sourceLines.findIndex((line, index) => index > start && line.startsWith("\\echo "));
      const stop = stopIndex < 0 ? sourceLines.length : stopIndex;
      const statement = "\\set VERBOSITY terse\n" + sourceLines.slice(start, stop).join("\n") + "\n";
      moneyResults.set(id, psql(dbM, ["-v", "ON_ERROR_STOP=1", "-f", "-"], statement));
    }

    // QA-F4/A exact-original probes: audit controls take priority over 0003's
    // closed-week guard and 0006's NOT NULL evidence columns.
    const auditSeed = psql(dbA6, ["-v", "ON_ERROR_STOP=1", "-f", "-"], seedSql);
    assert.equal(auditSeed.status, 0, "A-group seed failed: " + auditSeed.out);
    for (const path of [RLS_MIGRATION, WEEK_MIGRATION, ENTRY_MIGRATION, MONEY_MIGRATION, AUDIT_MIGRATION]) {
      const migrated = psql(dbA6, ["-v", "ON_ERROR_STOP=1", "-f", path]);
      assert.equal(migrated.status, 0, "A-group migration " + path + ": " + migrated.out);
    }
    for (const id of Object.keys(AUDIT_PROBES)) {
      const start = sourceLines.findIndex((line) => line.startsWith("\\echo " + id + " "));
      assert.ok(start > setupEnd, "missing original A SQL probe " + id);
      const stopIndex = sourceLines.findIndex((line, index) => index > start && line.startsWith("\\echo "));
      const stop = stopIndex < 0 ? sourceLines.length : stopIndex;
      const statement = "\\set VERBOSITY terse\n" + sourceLines.slice(start, stop).join("\n") + "\n";
      auditResults.set(id, psql(dbA6, ["-v", "ON_ERROR_STOP=1", "-f", "-"], statement));
    }
    q21 = psql(dbA6, ["-At", "-c",
      "SELECT count(*) FROM information_schema.columns WHERE table_name='settlement_adjustment' AND column_name IN ('actor_id','actor_role','mfa_verified_at') AND is_nullable='NO'"]).out.trim();

    // Q33-Q35: preserve the original SQL from qa_probes.sql and require a
    // specific ownership, supplier identity or private price error in a fresh
    // synthetic database running all additive candidate migrations.
    const tSeed = psql(dbT, ["-v", "ON_ERROR_STOP=1", "-f", "-"], seedSql);
    assert.equal(tSeed.status, 0, "T-group seed failed: " + tSeed.out);
    for (const path of [RLS_MIGRATION, WEEK_MIGRATION, ENTRY_MIGRATION, MONEY_MIGRATION,
      AUDIT_MIGRATION, HARDEN_MIGRATION, ATTRIBUTION_MIGRATION]) {
      const migrated = psql(dbT, ["-v", "ON_ERROR_STOP=1", "-f", path]);
      assert.equal(migrated.status, 0, "T-group migration " + path + ": " + migrated.out);
    }
    for (const id of Object.keys(ATTRIBUTION_PROBES)) {
      const start = sourceLines.findIndex((line) => line.startsWith("\\echo " + id + " "));
      assert.ok(start > setupEnd, "missing original T SQL probe " + id);
      const stopIndex = sourceLines.findIndex((line, index) => index > start && line.startsWith("\\echo "));
      const stop = stopIndex < 0 ? sourceLines.length : stopIndex;
      const statement = "\\set VERBOSITY terse\n" + sourceLines.slice(start, stop).join("\n") + "\n";
      attributionResults.set(id, psql(dbT, ["-v", "ON_ERROR_STOP=1", "-f", "-"], statement));
    }

    p0001 = errorsByMarker(PROBES, psql(dbA, ["-f", PROBES]).out, /^-- (P\d+|OK\d*)\b/);
    pQa = errorsByMarker(QA_PROBES, psql(dbB, ["-f", QA_PROBES]).out, /^\\echo (SETUP_DONE|SETUP|RLS_SETUP|END|Q\d+|C\d+|R\d+)\b/);
    // q21 is checked against the fully migrated QA-F4/A candidate, not baseline 0001.
    // The independent 0001 financial-rule probes must run first against the baseline.
    // After those are recorded, the isolated dbB is migrated to candidate 0002 for QA-F3 RLS checks.
    const m2 = psql(dbB, ["-v", "ON_ERROR_STOP=1", "-f", RLS_MIGRATION]);
    assert.equal(m2.status, 0, `tenant RLS candidate: ${m2.out}`);
    rls = psql(dbB, ["-At", "-c", `SELECT relname || ':' || relrowsecurity || ':' || relforcerowsecurity FROM pg_class WHERE relname IN (${LEDGER_TABLES.map((t) => `'${t}'`).join(",")}) ORDER BY relname`]).out.trim();
    foreign = psql(dbB, [
      "-At",
      "-c",
      "SET ROLE qa_party; SET app.party_id = 'p1'; SELECT (SELECT count(*) FROM booking_money_event WHERE booking_id = '00000000-0000-4000-8000-000000000102') + (SELECT count(*) FROM bank_receipt WHERE payee_id = 'p2' OR payer_id = 'sup-p');",
    ]).out.trim();
  });

  after(() => {
    for (const db of [dbA, dbB, dbW, dbE, dbM, dbA6, dbT]) psql("postgres", ["-c", `DROP DATABASE IF EXISTS ${db}`]);
  });

  it("0001 problar: P1–P16 reddedilir, OK blokları kabul edilir", () => {
    const p = [...p0001].filter(([id]) => /^P\d+$/.test(id));
    assert.equal(p.length, 16);
    assert.deepEqual(p.filter(([, n]) => n === 0).map(([id]) => id), [], "kabul edilen ihlaller");
    assert.deepEqual([...p0001].filter(([id, n]) => (id === "PRE" || id.startsWith("OK")) && n > 0), [], "beklenmeyen hata");
  });

  it("bağımsız problar: kurulum hatasız, C01–C05 kontrolleri reddedilir", () => {
    assert.equal((pQa.get("PRE") ?? 0) + (pQa.get("SETUP") ?? 0), 0, "kurulum hatası");
    for (const c of ["C01", "C02", "C03", "C04", "C05"]) assert.ok((pQa.get(c) ?? 0) > 0, `${c} reddedilmedi`);
  });

  for (const id of qIds) {
    if (Object.hasOwn(WEEK_PROBES, id)) {
      it(`QA-F4 W ${id}: exact week-integrity rule rejects the original SQL probe`, () => {
        const result = weekResults.get(id);
        assert.ok(result, `W-group ${id} was not run`);
        assert.notEqual(result.status, 0, `${id} unexpectedly accepted`);
        assert.ok(result.out.includes(WEEK_PROBES[id]!), `${id} rejected for WRONG reason: ${result.out}`);
      });
    } else if (Object.hasOwn(ENTRY_PROBES, id)) {
      it(`QA-F4 E ${id}: original entry violation rejected for exact financial invariant`, () => {
        const result = entryResults.get(id);
        assert.ok(result, `E-group ${id} not executed`);
        assert.notEqual(result.status, 0, `${id} unexpectedly accepted`);
        assert.ok(result.out.includes(ENTRY_PROBES[id]!), `${id} WRONG rejection cause: ${result.out}`);
      });
    } else if (Object.hasOwn(MONEY_PROBES, id)) {
      it(`QA-F4 M ${id}: original money violation rejected for exact financial invariant`, () => {
        const result = moneyResults.get(id);
        assert.ok(result, `M-group ${id} not executed`);
        assert.notEqual(result.status, 0, `${id} unexpectedly accepted`);
        assert.ok(result.out.includes(MONEY_PROBES[id]!), `${id} WRONG rejection cause: ${result.out}`);
      });
    } else if (Object.hasOwn(AUDIT_PROBES, id)) {
      it(`QA-F4 A ${id}: original adjustment violation denied for exact audit/decision rule`, () => {
        const result = auditResults.get(id);
        assert.ok(result, `A-group ${id} was not executed`);
        assert.notEqual(result.status, 0, `${id} unexpectedly accepted`);
        assert.ok(result.out.includes(AUDIT_PROBES[id]!), `${id} WRONG rejection cause: ${result.out}`);
      });
    } else if (Object.hasOwn(ATTRIBUTION_PROBES, id)) {
      it(`QA-F4 T ${id}: original attribution violation rejected for exact rule`, () => {
        const result = attributionResults.get(id);
        assert.ok(result, `T-group ${id} not run`);
        assert.notEqual(result.status, 0, `${id} unexpectedly accepted`);
        assert.ok(result.out.includes(ATTRIBUTION_PROBES[id]!), `${id} WRONG rejection cause: ${result.out}`);
      });
    } else {
      it(`QA-F4 ${id}: ihlal reddedilmeli`, { todo: "QA-F4 · Paket-03 (DB defter kısıtları)" }, () => {
        assert.ok((pQa.get(id) ?? 0) > 0, `${id} kabul edildi`);
      });
    }
  }

  it("QA-F4 A Q21: actor/role/2FA timestamp are all NOT NULL in adjustment audit", () => {
    assert.equal(q21, "3", `required non-null audit columns: ${q21}`);
  });

  it("QA-F3 (DB): p1 oturumu p2'nin para hareketini ve dekontunu göremez; defter tablolarında RLS açık ve zorunlu", () => {
    assert.equal(foreign, "0", `p1 oturumunun gördüğü yabancı satır: ${foreign}`);
    assert.deepEqual(rls.split("\n"), LEDGER_TABLES.map((t) => `${t}:true:true`));
  });
});

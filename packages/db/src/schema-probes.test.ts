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
const PROBES = resolve(ROOT, "packages/db/probes/0001_probes.sql");
const QA_PROBES = resolve(ROOT, "qa-independent/sql/qa_probes.sql");
const ENABLED = process.env.AG_TEST_PG === "1";
const LEDGER_TABLES = ["bank_receipt", "booking", "booking_money_event", "settlement_adjustment", "settlement_entry", "statement_dispute"];

function psql(db: string, args: readonly string[]): { status: number | null; out: string } {
  const r = spawnSync("psql", ["-X", "-q", "-d", db, ...args], { encoding: "utf8" });
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
  let p0001 = new Map<string, number>();
  let pQa = new Map<string, number>();
  let q21 = "";
  let rls = "";
  let foreign = "";

  before(() => {
    for (const db of [dbA, dbB]) {
      const c = psql("postgres", ["-c", `DROP DATABASE IF EXISTS ${db}`, "-c", `CREATE DATABASE ${db}`]);
      assert.equal(c.status, 0, c.out);
      const m = psql(db, ["-v", "ON_ERROR_STOP=1", "-f", MIGRATION]);
      assert.equal(m.status, 0, `migration: ${m.out}`);
    }
    p0001 = errorsByMarker(PROBES, psql(dbA, ["-f", PROBES]).out, /^-- (P\d+|OK\d*)\b/);
    pQa = errorsByMarker(QA_PROBES, psql(dbB, ["-f", QA_PROBES]).out, /^\\echo (SETUP_DONE|SETUP|RLS_SETUP|END|Q\d+|C\d+|R\d+)\b/);
    q21 = psql(dbB, ["-At", "-c", "SELECT count(*) FROM information_schema.columns WHERE table_name = 'settlement_adjustment' AND column_name ~ '(mfa|actor|approved_by|decided_by|role)'"]).out.trim();
    rls = psql(dbB, ["-At", "-c", `SELECT relname || ':' || relrowsecurity || ':' || relforcerowsecurity FROM pg_class WHERE relname IN (${LEDGER_TABLES.map((t) => `'${t}'`).join(",")}) ORDER BY relname`]).out.trim();
    foreign = psql(dbB, [
      "-At",
      "-c",
      "SET ROLE qa_party; SET app.party_id = 'p1'; SELECT (SELECT count(*) FROM booking_money_event WHERE booking_id = '00000000-0000-4000-8000-000000000102') + (SELECT count(*) FROM bank_receipt WHERE payee_id = 'p2' OR payer_id = 'sup-p');",
    ]).out.trim();
  });

  after(() => {
    for (const db of [dbA, dbB]) psql("postgres", ["-c", `DROP DATABASE IF EXISTS ${db}`]);
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
    it(`QA-F4 ${id}: ihlal reddedilmeli`, { todo: "QA-F4 · Paket-03 (DB defter kısıtları)" }, () => {
      assert.ok((pQa.get(id) ?? 0) > 0, `${id} kabul edildi`);
    });
  }

  it("QA-F4 Q21: mahsup kaydında aktör / rol / 2FA alanı bulunmalı", { todo: "QA-F4 · Paket-03" }, () => {
    assert.ok(Number(q21) > 0, `bulunan sütun: ${q21}`);
  });

  it("QA-F3 (DB): p1 oturumu p2'nin para hareketini ve dekontunu göremez; defter tablolarında RLS açık ve zorunlu", { todo: "QA-F3 · Paket-02/03 (kiracı izolasyonu)" }, () => {
    assert.equal(foreign, "0", `p1 oturumunun gördüğü yabancı satır: ${foreign}`);
    assert.deepEqual(rls.split("\n"), LEDGER_TABLES.map((t) => `${t}:true:true`));
  });
});

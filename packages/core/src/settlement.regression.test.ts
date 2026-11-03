// AGOS Skills V2 devir (03.11.2026) §3 — finans regresyonları.
// Önce başarısız test olarak yazıldı (ayrı commit), sonra en küçük düzeltme ayrı commit'te.
// Kimlikler devir belgesindekilerdir (D-F0x); bağımsız AI okumasındaki F1–F14 ile karıştırılmasın.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AGOS_PARTY_ID,
  SHUTTLE_SPLIT_V1,
  collectionSummary,
  shuttleSplit,
  splitOnCollected,
  transfers,
  weekBounds,
  weeklyReport,
  type MoneyEvent,
  type SettlementEntry,
  type SettlementLine,
  type SplitPolicy,
} from "./index.ts";

const W45 = "2026-W45"; // 2–8 Kasım 2026 (İstanbul)
const W46 = "2026-W46"; // 9–15 Kasım 2026
const W47 = "2026-W47";
const IN_W45 = "2026-11-04T09:00:00Z";
const IN_W46 = "2026-11-11T09:00:00Z";

let n = 0;
const ev = (amount: number, at = IN_W45, kind: MoneyEvent["kind"] = "collection"): MoneyEvent => ({
  id: `rg${++n}`,
  kind,
  amount,
  at,
  method: "cash",
  collector: "supplier",
  reference: `RG-${n}`,
});

function line(over: Partial<SettlementLine> & Pick<SettlementLine, "booking_id">): SettlementLine {
  const final = over.final_booking_price ?? 5000;
  const site = over.selling_party_id ?? "site-1";
  const supplier = over.supplier_id ?? "sup-1";
  const split = shuttleSplit(final, "EUR", site, supplier);
  const events = over.money_events ?? [ev(final)];
  const sum = collectionSummary(events, final);
  return {
    booking_ref: `AG-${over.booking_id.toUpperCase().padEnd(6, "X").slice(0, 6)}`,
    selling_site_id: `${site}-web`,
    selling_party_id: site,
    supplier_id: supplier,
    service_type: "shuttle",
    final_booking_price: final,
    currency: "EUR",
    collection_method: "cash",
    collector: "supplier",
    collection_status: sum.status,
    collected_amount: sum.net,
    refunded_amount: sum.refunded,
    collected_at: sum.firstAt,
    completed_at: IN_W45,
    cancelled: false,
    cancelled_at: null,
    disputed: false,
    disputed_at: null,
    dispute_reason: null,
    suspected_duplicate: false,
    self_supplied: split.self_supplied,
    site_commission_amount: split.site_commission_amount,
    agos_fee_amount: split.agos_fee_amount,
    supplier_entitlement: split.supplier_entitlement,
    ...transfers(split, final, "supplier"),
    policy_id: split.policy_id,
    settlement_week_id: null,
    settlement_status: "open",
    payment_reference: null,
    invoice_reference: null,
    adjustment_reference: null,
    money_events: events,
    ...over,
  };
}

const run = (weekId: string, lines: SettlementLine[], priorEntries: readonly SettlementEntry[] = [], policy?: SplitPolicy) =>
  weeklyReport({ weekId, now: weekBounds(weekId).end_utc, lines, priorEntries, adjustments: [], receipts: [], ...(policy ? { policy } : {}) });

const shares = (entries: readonly SettlementEntry[], bookingId: string) =>
  entries
    .filter((e) => e.booking_id === bookingId)
    .reduce((s, e) => ({ base: s.base + e.collected_delta, site: s.site + e.site_delta, agos: s.agos + e.agos_delta, supplier: s.supplier + e.supplier_delta }), { base: 0, site: 0, agos: 0, supplier: 0 });

describe("D-F03 — yeni komisyon ile iade alacağı yazılı mahsup onayı olmadan netleşmez", () => {
  it("aynı tedarikçi→site çiftinde +400 yeni komisyon ve −1000 iade düzeltmesi iki ayrı brüt kalem kalır", () => {
    const a = line({ booking_id: "f3a" });
    const w45 = run(W45, [a]);
    const aRefunded = { ...a, money_events: [...a.money_events, ev(5000, IN_W46, "refund")] };
    const b = line({ booking_id: "f3b", money_events: [ev(2000, IN_W46)], completed_at: IN_W46 });
    const w46 = run(W46, [aRefunded, b], w45.entries);

    const siteLines = w46.obligations.filter((o) => o.debtor_id === "sup-1" && o.creditor_id === "site-1" && o.kind === "site_commission");
    assert.deepEqual(siteLines.map((o) => o.amount).sort((x, y) => x - y), [-1000, 400], "brüt kalemler ayrı olmalı (net −600 tek kalem değil)");
    const agosLines = w46.obligations.filter((o) => o.debtor_id === "sup-1" && o.creditor_id === AGOS_PARTY_ID);
    assert.deepEqual(agosLines.map((o) => o.amount).sort((x, y) => x - y), [-500, 200]);

    // Borç listesi: tedarikçi siteye 400 öder; site tedarikçiye 1000 iade eder — ikisi ayrı, netleşmeden.
    assert.ok(w46.debts_and_disputes.some((d) => d.kind === "missing_payment" && d.debtor_id === "sup-1" && d.creditor_id === "site-1" && d.amount === 400));
    assert.ok(w46.debts_and_disputes.some((d) => d.kind === "credit_due" && d.debtor_id === "site-1" && d.creditor_id === "sup-1" && d.amount === 1000));
  });

  it("paket F03: net sıfır olsa da +1000 yeni komisyon ve −1000 iade düzeltmesi iki brüt kalem kalır", () => {
    const a = line({ booking_id: "f3c" });
    const w45 = run(W45, [a]);
    const aRefunded = { ...a, money_events: [...a.money_events, ev(5000, IN_W46, "refund")] };
    const b = line({ booking_id: "f3d", money_events: [ev(5000, IN_W46)], completed_at: IN_W46 });
    const w46 = run(W46, [aRefunded, b], w45.entries);
    const siteLines = w46.obligations.filter((o) => o.debtor_id === "sup-1" && o.creditor_id === "site-1" && o.kind === "site_commission");
    assert.deepEqual(siteLines.map((o) => [o.amount, o.status]).sort(), [[-1000, "credit_due"], [1000, "unpaid"]]);
  });
});

describe("D-F04 — müşteriye iade ve onaylı hizmet kredisi yeniden müşteri borcu oluşturmaz", () => {
  it("tam iade edilen iş 'müşteri borçlu' listesine girmez", () => {
    const a = line({ booking_id: "f4a" });
    const w45 = run(W45, [a]);
    const refunded = { ...a, money_events: [...a.money_events, ev(5000, IN_W46, "refund")] };
    const w46 = run(W46, [refunded], w45.entries);
    assert.equal(w46.customer_balances.filter((c) => c.booking_id === "f4a").length, 0);
  });

  it("tam ödenmiş işte iyi niyet iadesi (onaylı kredi) müşteri borcu doğurmaz", () => {
    const a = line({ booking_id: "f4b", money_events: [ev(5000), ev(1000, IN_W46, "refund")] });
    const w46 = run(W46, [a], run(W45, [line({ booking_id: "f4b" })]).entries);
    assert.equal(w46.customer_balances.filter((c) => c.booking_id === "f4b").length, 0);
  });

  it("kısmi tahsilattan sonra yapılan iade, kalan borcu artırmaz (yalnız asıl eksik 20 € kalır)", () => {
    const a = line({ booking_id: "f4c", money_events: [ev(3000), ev(1000, IN_W46, "refund")] });
    const w46 = run(W46, [a]);
    assert.deepEqual(w46.customer_balances.filter((c) => c.booking_id === "f4c").map((c) => c.remaining), [2000]);
  });

  it(
    "paket F04: 30 € tahsil + onaylı 20 € nakitsiz hizmet kredisi → müşteri borcu 0",
    { todo: "PKG-F04b · Paket-02: onaylı kredi notu kaydı (2FA, gerekçe, referans) henüz yok" },
    () => {
      const withCredit = { ...line({ booking_id: "f4d", money_events: [ev(3000)] }), approved_credit_minor: 2000 } as SettlementLine & { approved_credit_minor: number };
      const w45 = run(W45, [withCredit]);
      assert.equal(w45.customer_balances.filter((c) => c.booking_id === "f4d").length, 0);
    },
  );
});

describe("D-F06 — iptal filtresi, kaydedilmiş komisyonun ters hareketini atlamaz", () => {
  it("W45'te hesaplanmış iş W46'da iptal edilip iade edilince W46'da tam ters hareket oluşur", () => {
    const a = line({ booking_id: "f6a" });
    const w45 = run(W45, [a]);
    const cancelled = { ...a, cancelled: true, cancelled_at: IN_W46, money_events: [...a.money_events, ev(5000, IN_W46, "refund")] };
    const w46 = run(W46, [cancelled], w45.entries);
    const s = shares([...w45.entries, ...w46.entries], "f6a");
    assert.deepEqual(s, { base: 0, site: 0, agos: 0, supplier: 0 }, "iptal sonrası kümülatif pay sıfır olmalı");
    const rev = w46.entries.filter((e) => e.booking_id === "f6a");
    assert.equal(rev.length, 1);
    assert.notEqual(rev[0]!.kind, "collection");
  });

  it("iade henüz yapılmadan iptal: komisyon yine ters çevrilir, müşteri iadesi istisnada izlenir", () => {
    const a = line({ booking_id: "f6b" });
    const w45 = run(W45, [a]);
    const cancelled = { ...a, cancelled: true, cancelled_at: IN_W46 };
    const w46 = run(W46, [cancelled], w45.entries);
    assert.deepEqual(shares([...w45.entries, ...w46.entries], "f6b"), { base: 0, site: 0, agos: 0, supplier: 0 });
    assert.ok(w46.exceptions.some((x) => x.booking_id === "f6b" && x.reason === "cancelled_after_collection" && x.customer_refund_due === 5000));
  });

  it("ters hareket bir kez yazılır; sonraki haftada tekrar etmez", () => {
    const a = line({ booking_id: "f6c" });
    const w45 = run(W45, [a]);
    const cancelled = { ...a, cancelled: true, cancelled_at: IN_W46, money_events: [...a.money_events, ev(5000, IN_W46, "refund")] };
    const w46 = run(W46, [cancelled], w45.entries);
    const w47 = run(W47, [cancelled], [...w45.entries, ...w46.entries]);
    assert.equal(w47.entries.filter((e) => e.booking_id === "f6c").length, 0);
  });
});

describe("D-F05 — önceki paylar güncel politikayla yeniden hesaplanmaz", () => {
  // Varsayımsal yeni politika: yalnız test için; Owner kararı değildir.
  const V2: SplitPolicy = Object.freeze({ id: "shuttle-split-test-v2", status: "approved", carrierBps: 6500, partnerBps: 2500, platformBps: 1000 });

  it("politika değişse de rezervasyon kendi dondurulmuş politikasıyla tamamlanır; toplam pay v1 ile aynı", () => {
    const a = line({ booking_id: "f5a", money_events: [ev(3000)] });
    const w45 = run(W45, [a]);
    const later = { ...a, money_events: [...a.money_events, ev(2000, IN_W46)] };
    const w46 = run(W46, [later], w45.entries, V2);
    const total = shares([...w45.entries, ...w46.entries], "f5a");
    const v1 = shuttleSplit(5000, "EUR", "site-1", "sup-1", SHUTTLE_SPLIT_V1);
    assert.deepEqual(total, { base: 5000, site: v1.site_commission_amount, agos: v1.agos_fee_amount, supplier: v1.supplier_entitlement });
  });

  it("önceki pay, gerçek kayıtlardan alınır: W46 farkı = hedef − kayıtlı toplam", () => {
    const a = line({ booking_id: "f5b", money_events: [ev(3000)] });
    const w45 = run(W45, [a]);
    const later = { ...a, money_events: [...a.money_events, ev(2000, IN_W46)] };
    const w46 = run(W46, [later], w45.entries, V2);
    const e = w46.entries.find((x) => x.booking_id === "f5b")!;
    const recorded = shares(w45.entries, "f5b");
    const target = splitOnCollected(later, 5000, SHUTTLE_SPLIT_V1);
    assert.deepEqual([e.site_delta, e.agos_delta, e.supplier_delta], [
      target.site_commission_amount - recorded.site,
      target.agos_fee_amount - recorded.agos,
      target.supplier_entitlement - recorded.supplier,
    ]);
  });

  it(
    "paket F05: aynı tabanda kayıtlı pay (900/600/3500) dondurulmuş politikadan (1000/500/3500) farklıysa sessizce atlanmaz",
    { todo: "PKG-F05b · Codex Paket-01: 'share_mismatch' istisnası; otomatik düzeltme H-24 kararına bağlı" },
    () => {
      const a = line({ booking_id: "f5c" });
      const recorded: SettlementEntry = { ...run(W45, [a]).entries[0]!, site_delta: 900, agos_delta: 600, supplier_delta: 3500 };
      const w46 = run(W46, [a], [recorded]);
      const flagged = w46.exceptions.some((x) => x.booking_id === "f5c" && (x.reason as string) === "share_mismatch");
      const corrected = w46.entries.some((e) => e.booking_id === "f5c" && e.site_delta === 100 && e.agos_delta === -100 && e.supplier_delta === 0);
      assert.ok(flagged || corrected, "kayıtlı pay ile hedef pay arasındaki fark ne istisna ne düzeltme olarak görünüyor");
    },
  );
});

describe("D-F02 — küsurat dağıtımı (politika kararı bekleniyor; algoritma değiştirilmedi)", () => {
  it("bugünkü kural: her tahsilat düzeyinde AGOS kümülatif payı tam %10'un altına düşmez; üç pay tahsilata eşittir", () => {
    for (let c = 0; c <= 10000; c++) {
      const s = splitOnCollected(line({ booking_id: "f2x", final_booking_price: 10000 }), c);
      assert.equal(s.site_commission_amount + s.agos_fee_amount + s.supplier_entitlement, c);
      assert.ok(s.agos_fee_amount >= Math.floor(c / 10), `c=${c}`);
    }
  });

  it(
    "pozitif bir tahsilat haftasında AGOS payı azalmamalı (49,99 € sonrası son 1 kuruş; paket F02: 9 → 10 kuruş)",
    { todo: "BLOCKED: Owner küsurat dağıtım politikası (H-23). Algoritma sessizce değiştirilmez." },
    () => {
      for (const [first, id] of [[4999, "f2a"], [9, "f2b"]] as const) {
        const a = line({ booking_id: id, money_events: [ev(first)] });
        const w45 = run(W45, [a]);
        const later = { ...a, money_events: [...a.money_events, ev(1, IN_W46)] };
        const e = run(W46, [later], w45.entries).entries.find((x) => x.booking_id === id)!;
        assert.equal(e.collected_delta, 1);
        assert.ok(e.agos_delta >= 0, `${first}+1: agos_delta=${e.agos_delta}, site_delta=${e.site_delta}, supplier_delta=${e.supplier_delta}`);
      }
    },
  );
});

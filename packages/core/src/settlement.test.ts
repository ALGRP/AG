import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import {
  AGOS_PARTY_ID,
  SHUTTLE_SPLIT_V1,
  privateSplit,
  refundAdjustments,
  settlementWeekId,
  shuttleSplit,
  transfers,
  weekBounds,
  weeklyReport,
  type BankReceipt,
  type SettlementLine,
} from "./index.ts";

const AG = "alanya-group"; // alanyagroup.com sahibi
const W45 = "2026-W45"; // 2 Kasım (Pzt) – 8 Kasım (Paz) 2026

function line(over: Partial<SettlementLine> & Pick<SettlementLine, "booking_id">): SettlementLine {
  const final = over.final_booking_price ?? 5000;
  const site = over.selling_party_id ?? "site-1";
  const supplier = over.supplier_id ?? "sup-1";
  const split = (over.service_type ?? "shuttle") === "shuttle" ? shuttleSplit(final, "EUR", site, supplier) : privateSplit(final, 4750, site, supplier);
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
    collection_status: "collected",
    collected_amount: final,
    completed_at: "2026-11-04T09:00:00Z",
    cancelled: false,
    cancelled_at: null,
    disputed: false,
    disputed_at: null,
    dispute_reason: null,
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
    ...over,
  };
}

describe("K15 split — single source 20 / 10 / 70", () => {
  it("Owner table: 30/50/60/70 € → site 6/10/12/14, AGOS 3/5/6/7, supplier 21/35/42/49", () => {
    const rows = [3000, 5000, 6000, 7000].map((p) => {
      const s = shuttleSplit(p, "EUR", "site-1", "sup-1");
      const t = transfers(s, p, "supplier");
      return [s.site_commission_amount, s.agos_fee_amount, s.supplier_entitlement, t.supplier_payment_to_site, t.supplier_payment_to_agos];
    });
    assert.deepEqual(rows, [
      [600, 300, 2100, 600, 300],
      [1000, 500, 3500, 1000, 500],
      [1200, 600, 4200, 1200, 600],
      [1400, 700, 4900, 1400, 700],
    ]);
  });

  it("alanyagroup.com follows the same rule (20 % to the AG sales channel, 10 % AGOS)", () => {
    const s = shuttleSplit(5000, "EUR", AG, "sup-1");
    assert.deepEqual([s.site_commission_amount, s.agos_fee_amount, s.supplier_entitlement], [1000, 500, 3500]);
  });

  it("a site using its own vehicle keeps 90 %, pays AGOS 10 %, and no self-commission is created", () => {
    const s = shuttleSplit(5000, "EUR", "site-1", "site-1");
    const t = transfers(s, 5000, "supplier");
    assert.equal(s.self_supplied, true);
    assert.deepEqual([s.site_commission_amount, s.agos_fee_amount, s.supplier_entitlement], [0, 500, 4500]);
    assert.equal(t.supplier_payment_to_site, 0);
    assert.equal(t.supplier_payment_to_agos, 500);
  });

  it("the database seed uses the same 2000 / 1000 / 7000 basis points as the code", () => {
    const sql = readFileSync(resolve(import.meta.dirname, "../../db/migrations/0001_network_core.sql"), "utf8");
    const m = /INSERT INTO split_policy VALUES \('shuttle-split-v1', 'approved', (\d+), (\d+), (\d+)\)/.exec(sql);
    assert.ok(m, "split policy seed present");
    assert.deepEqual(m.slice(1).map(Number), [SHUTTLE_SPLIT_V1.carrierBps, SHUTTLE_SPLIT_V1.partnerBps, SHUTTLE_SPLIT_V1.platformBps]);
    assert.deepEqual([SHUTTLE_SPLIT_V1.partnerBps, SHUTTLE_SPLIT_V1.platformBps, SHUTTLE_SPLIT_V1.carrierBps], [2000, 1000, 7000]);
  });
});

describe("Private / VIP — site-set entitlement, no AGOS fee", () => {
  it("customer pays supplier: supplier passes (sale − entitlement) to the site", () => {
    const s = privateSplit(8000, 4750, "site-1", "sup-1");
    const t = transfers(s, 8000, "supplier");
    assert.deepEqual([s.site_commission_amount, s.agos_fee_amount, s.supplier_entitlement], [3250, 0, 4750]);
    assert.deepEqual([t.supplier_payment_to_site, t.supplier_payment_to_agos, t.site_payment_to_supplier], [3250, 0, 0]);
  });

  it("customer pays the site: the site passes the entitlement to the supplier", () => {
    const t = transfers(privateSplit(12000, 6000, "site-1", "sup-1"), 12000, "site");
    assert.deepEqual([t.supplier_payment_to_site, t.site_payment_to_supplier], [0, 6000]);
  });

  it("own vehicle: everything stays with the site; entitlement above the sale is refused", () => {
    const s = privateSplit(8000, 0, "site-1", "site-1");
    assert.deepEqual([s.site_commission_amount, s.agos_fee_amount, s.supplier_entitlement], [0, 0, 8000]);
    assert.throws(() => privateSplit(8000, 9000, "site-1", "sup-1"));
  });

  it("site collection is not allowed where an AGOS fee exists (shuttle)", () => {
    assert.throws(() => transfers(shuttleSplit(5000, "EUR", "site-1", "sup-1"), 5000, "site"));
  });
});

describe("settlement week (Europe/Istanbul)", () => {
  it("Monday 00:00 – Sunday 23:59 Istanbul, due Tuesday 18:00", () => {
    assert.equal(settlementWeekId("2026-11-01T21:00:00Z"), W45); // Pzt 00:00 İstanbul
    assert.equal(settlementWeekId("2026-11-08T20:59:59Z"), W45); // Paz 23:59:59 İstanbul
    assert.equal(settlementWeekId("2026-11-08T21:00:00Z"), "2026-W46"); // sonraki Pzt 00:00
    assert.equal(settlementWeekId("2026-11-01T20:59:59Z"), "2026-W44");
    const b = weekBounds(W45);
    assert.equal(b.start_utc, "2026-11-01T21:00:00.000Z");
    assert.equal(b.end_utc, "2026-11-08T21:00:00.000Z");
    assert.equal(b.payment_due_utc, "2026-11-10T15:00:00.000Z"); // Salı 18:00 İstanbul
    assert.equal(settlementWeekId("2027-01-01T12:00:00Z"), "2026-W53");
    assert.throws(() => weekBounds("2026-W60"));
  });
});

describe("weekly report", () => {
  const receipt = (over: Partial<BankReceipt> & Pick<BankReceipt, "id" | "payer_id" | "payee_id" | "amount">): BankReceipt => ({
    week_id: W45,
    currency: "EUR",
    bank_reference: `DEKONT-${over.id}`,
    paid_at: "2026-11-10T09:00:00Z",
    ...over,
  });

  const lines: SettlementLine[] = [
    line({ booking_id: "b1", final_booking_price: 3000 }), // sup-1 ← site-1
    line({ booking_id: "b2", final_booking_price: 5000, collection_method: "card_pos" }), // sup-1 ← site-1
    line({ booking_id: "b3", final_booking_price: 7000, selling_party_id: AG }), // sup-1 ← alanyagroup.com
    line({ booking_id: "b4", final_booking_price: 6000, selling_party_id: "site-2", supplier_id: "site-2" }), // kendi aracı
    line({ booking_id: "b5", service_type: "private", final_booking_price: 8000, supplier_id: "sup-2" }), // private
    // İstisnalar
    line({ booking_id: "x1", cancelled: true, cancelled_at: "2026-11-03T10:00:00Z", completed_at: null, collected_amount: 0, collection_status: "pending" }),
    line({ booking_id: "x2", collection_status: "short_collected", collected_amount: 3000 }),
    line({ booking_id: "x3", disputed: true, disputed_at: "2026-11-05T10:00:00Z", dispute_reason: "müşteri gelmedi" }),
    line({ booking_id: "x4", collection_status: "refunded", collected_amount: 0 }),
    // Kapsam dışı: gelecek hafta tamamlanan, daha önce hesaplanmış
    line({ booking_id: "n1", completed_at: "2026-11-09T09:00:00Z" }),
    line({ booking_id: "o1", settlement_week_id: "2026-W44", settlement_status: "included" }),
  ];

  it("includes only completed + fully collected jobs and lists every exception separately", () => {
    const r = weeklyReport({ weekId: W45, now: "2026-11-09T08:00:00Z", lines, adjustments: [], receipts: [] });
    assert.deepEqual(r.included.map((l) => l.booking_id).sort(), ["b1", "b2", "b3", "b4", "b5"]);
    assert.ok(r.included.every((l) => l.settlement_week_id === W45));
    assert.deepEqual(
      r.exceptions.map((e) => [e.booking_id, e.reason]).sort(),
      [
        ["x1", "cancelled"],
        ["x2", "short_collected"],
        ["x3", "disputed"],
        ["x4", "refunded"],
      ],
    );
    assert.equal(r.payout_execution, "disabled_owner_go_required");
  });

  it("builds supplier statements, site receivables and AGOS fees that add up", () => {
    const r = weeklyReport({ weekId: W45, now: "2026-11-09T08:00:00Z", lines, adjustments: [], receipts: [] });
    const sup1 = r.supplier_statements.find((s) => s.supplier_id === "sup-1")!;
    // 30 + 50 + 70 = 150 € tahsil; hak ediş 21 + 35 + 49 = 105; siteye 6 + 10 (site-1) ve 14 (AG); AGOS 3 + 5 + 7
    assert.deepEqual([sup1.jobs, sup1.collected, sup1.entitlement, sup1.owes_agos, sup1.total_owed], [3, 15000, 10500, 1500, 4500]);
    assert.equal(sup1.collected, sup1.entitlement + sup1.total_owed, "collected = entitlement + owed");
    assert.deepEqual(sup1.owes_sites.map((o) => [o.site_party_id, o.amount]).sort(), [
      [AG, 1400],
      ["site-1", 1600],
    ]);
    const self = r.supplier_statements.find((s) => s.supplier_id === "site-2")!;
    assert.deepEqual([self.owes_sites.length, self.owes_agos, self.entitlement], [0, 600, 5400], "own vehicle: 90/10, no self commission");
    const sup2 = r.supplier_statements.find((s) => s.supplier_id === "sup-2")!;
    assert.deepEqual([sup2.owes_agos, sup2.owes_sites[0]!.amount], [0, 3250], "private: no AGOS fee");

    const site1 = r.site_receivables.find((s) => s.site_party_id === "site-1")!;
    assert.equal(site1.total, 600 + 1000 + 3250);
    assert.equal(r.agos_fees.total_by_currency.EUR, 300 + 500 + 700 + 600);
    // Korunum: tüm tahsilat = hak edişler + site alacakları + AGOS
    const collected = r.included.reduce((s, l) => s + l.collected_amount, 0);
    const parts =
      r.included.reduce((s, l) => s + l.supplier_entitlement, 0) +
      r.site_receivables.reduce((s, x) => s + x.total, 0) +
      (r.agos_fees.total_by_currency.EUR ?? 0);
    assert.equal(collected, parts);
  });

  it("matches bank receipts, reports partial, missing, late, over-payments and unmatched receipts", () => {
    const receipts = [
      receipt({ id: "r1", payer_id: "sup-1", payee_id: "site-1", amount: 1600 }), // tam
      receipt({ id: "r2", payer_id: "sup-1", payee_id: AGOS_PARTY_ID, amount: 1000 }), // kısmi (1500)
      receipt({ id: "r3", payer_id: "site-2", payee_id: AGOS_PARTY_ID, amount: 700 }), // fazla (600)
      receipt({ id: "r4", payer_id: "sup-9", payee_id: "site-1", amount: 500 }), // borç yok
    ];
    const before = weeklyReport({ weekId: W45, now: "2026-11-10T14:00:00Z", lines, adjustments: [], receipts });
    const o = (d: string, c: string) => before.obligations.find((x) => x.debtor_id === d && x.creditor_id === c)!;
    assert.deepEqual([o("sup-1", "site-1").status, o("sup-1", "site-1").receipt_ids], ["paid", ["r1"]]);
    assert.equal(o("sup-1", AGOS_PARTY_ID).status, "partially_paid");
    assert.equal(o("site-2", AGOS_PARTY_ID).status, "overpaid");
    assert.equal(o("sup-1", AG).status, "unpaid");
    assert.ok(!before.obligations.some((x) => x.late), "before Tuesday 18:00 nothing is late");
    assert.deepEqual(before.unmatched_receipts.map((r) => r.id), ["r4"]);
    const b1 = before.included.find((l) => l.booking_id === "b1")!;
    assert.deepEqual(b1.payment_reference?.split(",").sort(), ["DEKONT-r1", "DEKONT-r2"], "line carries its bank receipt references");
    const kinds = before.debts_and_disputes.map((d) => d.kind).sort();
    assert.deepEqual(kinds, ["booking_dispute", "missing_payment", "missing_payment", "overpayment", "partial_payment", "unmatched_receipt"]);

    const after = weeklyReport({ weekId: W45, now: "2026-11-10T15:00:00Z", lines, adjustments: [], receipts });
    assert.ok(after.obligations.find((x) => x.debtor_id === "sup-1" && x.creditor_id === AG)!.late);
    assert.equal(after.supplier_statements.find((s) => s.supplier_id === "sup-1")!.status, "late");
    assert.ok(after.debts_and_disputes.some((d) => d.kind === "late_payment" && d.creditor_id === AG));
  });

  it("never counts a booking twice: a line settled in W45 is not included again in W46", () => {
    const w45 = weeklyReport({ weekId: W45, now: "2026-11-09T08:00:00Z", lines, adjustments: [], receipts: [] });
    const settled = lines.map((l) => (w45.included.some((i) => i.booking_id === l.booking_id) ? { ...l, settlement_week_id: W45 } : l));
    const w46 = weeklyReport({ weekId: "2026-W46", now: "2026-11-16T08:00:00Z", lines: settled, adjustments: [], receipts: [] });
    assert.deepEqual(w46.included.map((l) => l.booking_id), ["n1"]);
    // Açık istisnalar çözülene kadar sonraki haftada da listelenir; tahsilatsız iptal ve iade yalnız kendi haftasında.
    assert.deepEqual(w46.exceptions.map((e) => e.booking_id).sort(), ["x2", "x3"]);
  });

  it("refund after settlement: the old week stays unchanged; a correction is posted to the current week", () => {
    const settledLine = { ...line({ booking_id: "b2" }), settlement_week_id: W45, settlement_status: "included" as const };
    let n = 0;
    const adj = refundAdjustments(settledLine, 5000, "2026-W46", () => `a${++n}`);
    assert.deepEqual(
      adj.map((a) => [a.creditor_id, a.amount, a.original_week_id, a.week_id]),
      [
        ["site-1", -1000, W45, "2026-W46"],
        [AGOS_PARTY_ID, -500, W45, "2026-W46"],
      ],
    );
    assert.ok(adj.every((a) => a.adjustment_reference === `ADJ-${settledLine.booking_ref}-2026-W46`));
    // W45 raporu düzeltmeden etkilenmez
    const w45 = weeklyReport({ weekId: W45, now: "2026-11-16T08:00:00Z", lines: [settledLine], adjustments: adj, receipts: [] });
    assert.equal(w45.site_receivables[0]!.total, 1000);
    // W46 raporunda tedarikçinin site ve AGOS borcu eksiye düşer (alacak/mahsup)
    const w46 = weeklyReport({ weekId: "2026-W46", now: "2026-11-16T08:00:00Z", lines: [settledLine], adjustments: adj, receipts: [] });
    assert.deepEqual(
      w46.obligations.map((o) => [o.creditor_id, o.amount, o.adjustment_ids.length]),
      [
        [AGOS_PARTY_ID, -500, 1],
        ["site-1", -1000, 1],
      ],
    );
    assert.equal(w46.supplier_statements[0]!.adjustments, -1500);
    // Partial refund uses the same single-source split
    const half = refundAdjustments(settledLine, 3000, "2026-W46", () => "h");
    assert.deepEqual(half.map((a) => a.amount), [-600, -300]);
    assert.throws(() => refundAdjustments(settledLine, 6000, "2026-W46", () => "x"), /exceed/);
    assert.throws(() => refundAdjustments({ ...settledLine, settlement_week_id: null }, 1000, "2026-W46", () => "x"), /exception/);
    assert.throws(() => refundAdjustments({ ...settledLine, service_type: "private" }, 1000, "2026-W46", () => "x"), /manual/);
  });
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import {
  AGOS_PARTY_ID,
  SHUTTLE_SPLIT_V1,
  checkManualPrice,
  collectionSummary,
  disputeTiming,
  nextWeekId,
  parseShuttleTariff,
  priceShuttle,
  privateSplit,
  settlementWeekId,
  shuttleSplit,
  splitOnCollected,
  transfers,
  weekBounds,
  weeklyReport,
  type Adjustment,
  type BankReceipt,
  type MoneyEvent,
  type SettlementEntry,
  type SettlementLine,
} from "./index.ts";

const AG = "alanya-group";
const W45 = "2026-W45"; // 2 Kasım (Pzt) – 8 Kasım (Paz) 2026
const W46 = "2026-W46";
let evN = 0;
const pay = (amount: number, at = "2026-11-04T09:00:00Z", kind: MoneyEvent["kind"] = "collection"): MoneyEvent => ({
  id: `ev${++evN}`,
  kind,
  amount,
  at,
  method: "cash",
  collector: "supplier",
  reference: `SLIP-${evN}`,
});

function line(over: Partial<SettlementLine> & Pick<SettlementLine, "booking_id">): SettlementLine {
  const final = over.final_booking_price ?? 5000;
  const site = over.selling_party_id ?? "site-1";
  const supplier = over.supplier_id ?? "sup-1";
  const type = over.service_type ?? "shuttle";
  const split = type === "shuttle" ? shuttleSplit(final, "EUR", site, supplier) : privateSplit(final, 4750, site, supplier);
  const events = over.money_events ?? [pay(final)];
  const sum = collectionSummary(events, final);
  return {
    booking_ref: `AG-${over.booking_id.toUpperCase().padEnd(6, "X").slice(0, 6)}`,
    selling_site_id: `${site}-web`,
    selling_party_id: site,
    supplier_id: supplier,
    service_type: type,
    final_booking_price: final,
    currency: "EUR",
    collection_method: "cash",
    collector: "supplier",
    collection_status: sum.status,
    collected_amount: sum.net,
    refunded_amount: sum.refunded,
    collected_at: sum.firstAt,
    completed_at: "2026-11-04T09:00:00Z",
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

const report = (lines: SettlementLine[], weekId = W45, extra: Partial<Parameters<typeof weeklyReport>[0]> = {}) =>
  weeklyReport({ weekId, now: weekBounds(weekId).end_utc, lines, priorEntries: [], adjustments: [], receipts: [], ...extra });

describe("K15 split — single source 20 / 10 / 70", () => {
  it("Owner table: 30/50/60/70 € → site 6/10/12/14, AGOS 3/5/6/7, supplier 21/35/42/49", () => {
    const rows = [3000, 5000, 6000, 7000].map((p) => {
      const s = shuttleSplit(p, "EUR", "site-1", "sup-1");
      return [s.site_commission_amount, s.agos_fee_amount, s.supplier_entitlement];
    });
    assert.deepEqual(rows, [
      [600, 300, 2100],
      [1000, 500, 3500],
      [1200, 600, 4200],
      [1400, 700, 4900],
    ]);
  });

  it("alanyagroup.com is a sales channel; own vehicle keeps 90 % with no self-commission", () => {
    assert.deepEqual(Object.values(shuttleSplit(5000, "EUR", AG, "sup-1")).slice(1, 4), [1000, 500, 3500]);
    const self = shuttleSplit(5000, "EUR", "site-1", "site-1");
    assert.deepEqual([self.self_supplied, self.site_commission_amount, self.agos_fee_amount, self.supplier_entitlement], [true, 0, 500, 4500]);
  });

  it("the database seed uses the same basis points as the code", () => {
    const sql = readFileSync(resolve(import.meta.dirname, "../../db/migrations/0001_network_core.sql"), "utf8");
    const m = /INSERT INTO split_policy VALUES \('shuttle-split-v1', 'approved', (\d+), (\d+), (\d+)\)/.exec(sql);
    assert.ok(m);
    assert.deepEqual(m.slice(1).map(Number), [SHUTTLE_SPLIT_V1.carrierBps, SHUTTLE_SPLIT_V1.partnerBps, SHUTTLE_SPLIT_V1.platformBps]);
  });

  it("private/VIP: site-set entitlement, no AGOS fee; supplier passes the difference to the site", () => {
    const s = privateSplit(8000, 4750, "site-1", "sup-1");
    assert.deepEqual([s.site_commission_amount, s.agos_fee_amount, s.supplier_entitlement], [3250, 0, 4750]);
    assert.deepEqual(transfers(s, 8000, "supplier").supplier_payment_to_site, 3250);
    assert.deepEqual(transfers(s, 8000, "site").site_payment_to_supplier, 4750);
    assert.throws(() => transfers(shuttleSplit(5000, "EUR", "site-1", "sup-1"), 5000, "site"));
  });
});

describe("T2 — commission only on what is actually collected", () => {
  it("Owner example: 50 € booking, 30 € collected → 6 / 3 / 21; the remaining 20 € later → +4 / +2 / +14", () => {
    const l = line({ booking_id: "ex", money_events: [pay(3000, "2026-11-04T10:00:00Z")] });
    const w45 = report([l]);
    assert.deepEqual(w45.entries.map((e) => [e.collected_delta, e.site_delta, e.agos_delta, e.supplier_delta]), [[3000, 600, 300, 2100]]);
    assert.deepEqual(w45.customer_balances.map((b) => [b.final_booking_price, b.collected_amount, b.remaining]), [[5000, 3000, 2000]], "customer still owes 20 €; price unchanged");
    const later = { ...l, money_events: [...l.money_events, pay(2000, "2026-11-10T10:00:00Z")] };
    const w46 = report([later], W46, { priorEntries: w45.entries });
    assert.deepEqual(w46.entries.map((e) => [e.collected_delta, e.site_delta, e.agos_delta, e.supplier_delta]), [[2000, 400, 200, 1400]]);
    assert.equal(w46.customer_balances.length, 0);
  });

  it("uncollected money is never paid out as if collected", () => {
    const r = report([line({ booking_id: "none", money_events: [] })]);
    assert.equal(r.entries.length, 0);
    assert.equal(r.obligations.length, 0);
    assert.equal(r.customer_balances[0]!.remaining, 5000);
  });

  it("no commission before the transfer is completed, even if money was collected", () => {
    const r = report([line({ booking_id: "early", completed_at: null })]);
    assert.equal(r.entries.length, 0);
    const done = report([line({ booking_id: "early", completed_at: "2026-11-10T09:00:00Z" })], W46);
    assert.equal(done.entries[0]!.collected_delta, 5000);
  });

  it("partial collections never drift: cumulative split equals the split of the total", () => {
    const parts = [333, 333, 333, 4001];
    let prior: SettlementEntry[] = [];
    let at = Date.parse("2026-11-04T10:00:00Z");
    const events: MoneyEvent[] = [];
    let week = W45;
    const totals = { site: 0, agos: 0, sup: 0 };
    for (const p of parts) {
      events.push(pay(p, new Date(at).toISOString()));
      const r = report([line({ booking_id: "drift", money_events: [...events] })], week, { priorEntries: prior });
      for (const e of r.entries) {
        totals.site += e.site_delta;
        totals.agos += e.agos_delta;
        totals.sup += e.supplier_delta;
      }
      prior = [...prior, ...r.entries];
      at += 7 * 86400_000;
      week = nextWeekId(week);
    }
    assert.deepEqual([totals.site, totals.agos, totals.sup], [1000, 500, 3500]);
  });

  it("private/VIP partial collection (candidate rule): the sale difference is earned pro rata", () => {
    const s = splitOnCollected({ service_type: "private", final_booking_price: 8000, currency: "EUR", selling_party_id: "site-1", supplier_id: "sup-1", site_commission_amount: 3250 }, 4000);
    assert.deepEqual([s.site_commission_amount, s.agos_fee_amount, s.supplier_entitlement], [1625, 0, 2375]);
  });
});

describe("T1 — overcollection, refunds and overpayments", () => {
  it("overcollection: commission on the sale price only, excess listed as a customer refund", () => {
    const r = report([line({ booking_id: "over", final_booking_price: 3000, money_events: [pay(3500)] })]);
    assert.equal(r.entries[0]!.collected_delta, 3000);
    assert.deepEqual(r.exceptions.map((e) => [e.reason, e.customer_refund_due]), [["overcollected", 500]]);
  });

  it("a refund after closing recalculates the shares as a negative entry in the current week; the old week stays", () => {
    const l = line({ booking_id: "rf" });
    const w45 = report([l]);
    const refunded = { ...l, money_events: [...l.money_events, pay(5000, "2026-11-11T09:00:00Z", "refund")] };
    const w46 = report([refunded], W46, { priorEntries: w45.entries });
    assert.deepEqual(w46.entries.map((e) => [e.kind, e.collected_delta, e.site_delta, e.agos_delta]), [["refund_correction", -5000, -1000, -500]]);
    assert.deepEqual(w46.obligations.map((o) => [o.creditor_id, o.amount, o.status]).sort(), [
      [AGOS_PARTY_ID, -500, "credit_due"],
      ["site-1", -1000, "credit_due"],
    ]);
    assert.ok(w46.debts_and_disputes.some((d) => d.kind === "credit_due" && d.debtor_id === "site-1" && d.amount === 1000));
    assert.equal(report([l], W45).entries[0]!.collected_delta, 5000, "W45 recomputed from its own data is unchanged");
  });

  it("an overpayment is refunded to the payer (overpayment_refund receipt), not silently offset", () => {
    const rc = (id: string, payer: string, payee: string, amount: number, purpose: BankReceipt["purpose"]): BankReceipt => ({
      id, week_id: W45, payer_id: payer, payee_id: payee, amount, currency: "EUR", bank_reference: `DK-${id}`, paid_at: "2026-11-10T09:00:00Z", purpose,
    });
    const l = [line({ booking_id: "op" })];
    const over = report(l, W45, { receipts: [rc("1", "sup-1", AGOS_PARTY_ID, 600, "settlement")] });
    const o = over.obligations.find((x) => x.creditor_id === AGOS_PARTY_ID)!;
    assert.equal(o.status, "overpaid");
    assert.match(over.debts_and_disputes.find((d) => d.kind === "overpayment")!.detail, /yazılı onay/);
    const back = report(l, W45, { receipts: [rc("1", "sup-1", AGOS_PARTY_ID, 600, "settlement"), rc("2", AGOS_PARTY_ID, "sup-1", 100, "overpayment_refund")] });
    assert.equal(back.obligations.find((x) => x.creditor_id === AGOS_PARTY_ID)!.status, "paid");
  });

  it("a written-approval offset is a separate manual movement in the next open week", () => {
    const off: Adjustment = {
      id: "o1", week_id: W46, original_week_id: W45, debtor_id: AGOS_PARTY_ID, creditor_id: "sup-1", amount: 100, currency: "EUR",
      kind: "offset", reason: "fazla ödeme mahsubu", adjustment_reference: "OFS-1", written_approval_reference: "YAZILI-ONAY-17", booking_id: null, dispute_id: null,
    };
    const r = report([], W46, { adjustments: [off] });
    assert.deepEqual(r.obligations.map((o) => [o.kind, o.debtor_id, o.creditor_id, o.amount]), [["manual", AGOS_PARTY_ID, "sup-1", 100]]);
  });
});

describe("exceptions and payments", () => {
  it("cancellation, dispute and suspected duplicate block commission; open ones stay listed every week", () => {
    const lines = [
      line({ booking_id: "c1", cancelled: true, cancelled_at: "2026-11-03T10:00:00Z", completed_at: null, money_events: [] }),
      line({ booking_id: "c2", cancelled: true, cancelled_at: "2026-11-03T11:00:00Z", completed_at: null }),
      line({ booking_id: "d1", disputed: true, disputed_at: "2026-11-05T10:00:00Z", dispute_reason: "no-show" }),
      line({ booking_id: "u1", suspected_duplicate: true }),
    ];
    const w45 = report(lines);
    assert.equal(w45.entries.length, 0);
    assert.deepEqual(w45.exceptions.map((e) => [e.booking_id, e.reason, e.customer_refund_due]).sort(), [
      ["c1", "cancelled", 0],
      ["c2", "cancelled_after_collection", 5000],
      ["d1", "disputed", 0],
      ["u1", "suspected_duplicate", 0],
    ]);
    assert.deepEqual(report(lines, W46).exceptions.map((e) => e.booking_id).sort(), ["c2", "d1", "u1"], "open exceptions carry; a cancellation without money does not");
  });

  it("matches receipts; reports late, paid-late, partial and unmatched; subscriptions are kept apart", () => {
    const rc = (id: string, payee: string, amount: number, paid_at: string, purpose: BankReceipt["purpose"] = "settlement", payer = "sup-1"): BankReceipt => ({
      id, week_id: W45, payer_id: payer, payee_id: payee, amount, currency: "EUR", bank_reference: `DK-${id}`, paid_at, purpose,
    });
    const r = weeklyReport({
      weekId: W45,
      now: "2026-11-20T00:00:00Z",
      lines: [line({ booking_id: "p1" }), line({ booking_id: "p2", selling_party_id: AG })],
      priorEntries: [],
      adjustments: [],
      receipts: [
        rc("1", "site-1", 1000, "2026-11-19T09:00:00Z"),
        rc("2", AGOS_PARTY_ID, 500, "2026-11-10T09:00:00Z"),
        rc("3", "x", 700, "2026-11-10T09:00:00Z", "settlement", "sup-x"),
        rc("4", AGOS_PARTY_ID, 20000, "2026-11-10T09:00:00Z", "subscription"),
      ],
    });
    const ob = (c: string) => r.obligations.find((o) => o.creditor_id === c)!;
    assert.deepEqual([ob("site-1").status, ob("site-1").paid_late], ["paid", true]);
    assert.deepEqual([ob(AGOS_PARTY_ID).status, ob(AG).late], ["partially_paid", true]);
    const kinds = r.debts_and_disputes.map((d) => d.kind).sort();
    assert.deepEqual(kinds, ["late_payment", "paid_late", "partial_payment", "unmatched_receipt"]);
    assert.deepEqual(r.subscription_receipts.map((x) => x.id), ["4"]);
    assert.deepEqual(r.entries.find((e) => e.booking_id === "p1")!.payment_reference, "DK-1,DK-2");
  });

  it("weekly totals reconcile: collected = entitlement + site + AGOS", () => {
    const r = report([line({ booking_id: "a" }), line({ booking_id: "b", final_booking_price: 7000, selling_party_id: AG }), line({ booking_id: "c", selling_party_id: "site-2", supplier_id: "site-2" }), line({ booking_id: "d", service_type: "private", final_booking_price: 8000 })]);
    const collected = r.entries.reduce((s, e) => s + e.collected_delta, 0);
    const parts = r.entries.reduce((s, e) => s + e.supplier_delta, 0) + r.site_receivables.reduce((s, x) => s + x.total, 0) + (r.agos_fees.total_by_currency.EUR ?? 0);
    assert.equal(collected, parts);
    assert.equal(r.payout_execution, "disabled_owner_go_required");
  });
});

describe("settlement week (Europe/Istanbul)", () => {
  it("Monday 00:00 – Sunday 23:59 Istanbul, due Tuesday 18:00, ISO week 53", () => {
    assert.equal(settlementWeekId("2026-11-01T21:00:00Z"), W45);
    assert.equal(settlementWeekId("2026-11-08T20:59:59Z"), W45);
    assert.equal(settlementWeekId("2026-11-08T21:00:00Z"), W46);
    assert.equal(weekBounds(W45).payment_due_utc, "2026-11-10T15:00:00.000Z");
    assert.equal(settlementWeekId("2027-01-01T12:00:00Z"), "2026-W53");
    assert.equal(nextWeekId("2026-W53"), "2027-W01");
    assert.throws(() => weekBounds("2026-W60"));
  });
});

describe("T3 — disputes on a closed week", () => {
  it("7 calendar days from when the statement was sent; late disputes are never auto-rejected", () => {
    const base = { statement_sent_at: "2026-11-10T09:00:00Z" };
    assert.equal(disputeTiming({ ...base, raised_at: "2026-11-17T09:00:00Z", category: "other" }).within_window, true);
    const late = disputeTiming({ ...base, raised_at: "2026-11-18T09:00:00Z", category: "other" });
    assert.deepEqual([late.within_window, late.reviewable], [false, true]);
    for (const c of ["legal_right", "fraud_suspicion", "calculation_error"] as const) {
      assert.match(disputeTiming({ ...base, raised_at: "2027-02-01T00:00:00Z", category: c }).note, /otomatik reddedilmez/);
    }
    assert.equal(disputeTiming({ statement_sent_at: null, raised_at: "2027-02-01T00:00:00Z", category: "other" }).deadline, null);
  });
});

describe("K17 and K8 — manual price bounds and route metadata", () => {
  const tariff = parseShuttleTariff({
    id: "t", approval: "approved", publishedAt: "2026-11-01", currency: "EUR",
    routes: ["AYT-ALN", "ALN-AYT", "AYT-KMR"],
    routeInfo: {
      "AYT-ALN": { active: true, coverage: "AYT → Alanya" },
      "ALN-AYT": { active: true, coverage: "Alanya → AYT" },
      "AYT-KMR": { active: false, coverage: "AYT → Kemer (pasif)" },
    },
    manualPriceBounds: { "AYT-ALN": { minMinor: 8000, maxMinor: 14000, status: "approved" }, "ALN-AYT": { minMinor: 8000, maxMinor: 14000, status: "proposed" } },
    validFrom: "2026-11-01", maxPassengers: 10, totalsMinor: [3000, 5000, 6000, 7000],
  });

  it("refuses 0.01 €, out-of-bound and unapproved-bound prices", () => {
    assert.deepEqual(checkManualPrice(tariff, "AYT-ALN", 1), { ok: false, reason: "below_min" });
    assert.deepEqual(checkManualPrice(tariff, "AYT-ALN", 14001), { ok: false, reason: "above_max" });
    assert.deepEqual(checkManualPrice(tariff, "AYT-ALN", 9000), { ok: true });
    assert.deepEqual(checkManualPrice(tariff, "ALN-AYT", 9000), { ok: false, reason: "bounds_not_approved" });
    assert.deepEqual(checkManualPrice(tariff, "AYT-KMR", 9000), { ok: false, reason: "route_inactive" });
  });

  it("5 passengers never reactivate the old 80 € tariff; inactive routes are not priced", () => {
    assert.deepEqual(priceShuttle(tariff, "AYT-ALN", "2026-12-01", 5), { ok: false, reason: "requires_approval" });
    assert.deepEqual(priceShuttle(tariff, "AYT-KMR", "2026-12-01", 2), { ok: false, reason: "route_inactive" });
  });

  it("every route needs coverage and an active flag; bounds must be sane", () => {
    const base = { id: "x", approval: "proposed", publishedAt: "2026-11-01", currency: "EUR", routes: ["AYT-ALN"], validFrom: "2026-11-01", maxPassengers: 10, totalsMinor: [3000] };
    assert.throws(() => parseShuttleTariff(base), /routeInfo/);
    assert.throws(() => parseShuttleTariff({ ...base, routeInfo: { "AYT-ALN": { active: true, coverage: "x" } }, manualPriceBounds: { "AYT-ALN": { minMinor: 9000, maxMinor: 8000, status: "approved" } } }), /min <= max/);
  });
});

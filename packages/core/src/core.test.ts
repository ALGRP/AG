import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SHUTTLE_DIRECT_SPLIT_PROPOSED,
  SHUTTLE_SPLIT_V1,
  PASS_POLICY_DECK_V3,
  checkPaymentEvent,
  closeWeek,
  earnPassShares,
  paymentSummary,
  splitPass,
  assertTransition,
  balances,
  canTransition,
  earnShuttleShares,
  money,
  parseShuttleTariff,
  parseSiteRecord,
  placeInPool,
  priceShuttle,
  resolveSite,
  reverseEntries,
  slotStartFor,
  splitShuttleRevenue,
  validateIntake,
  type ShuttleRun,
  type LedgerEntry,
  type PaymentEvent,
} from "./index.ts";

const POLICIES = { partnerSourced: SHUTTLE_SPLIT_V1, direct: SHUTTLE_DIRECT_SPLIT_PROPOSED };

const tariff = parseShuttleTariff({
  id: "test-tariff",
  approval: "approved",
  publishedAt: "2026-11-01",
  currency: "EUR",
  routes: ["AYT-ALN"],
  validFrom: "2026-11-01",
  validTo: "2027-03-31",
  maxPassengers: 10,
  totalsMinor: [3000, 5000, 6000, 7000],
});

describe("shuttle tariff (Owner decision 03.11.2026)", () => {
  it("prices booking totals 30/50/60/70 for 1–4 passengers (not per person)", () => {
    const totals = [1, 2, 3, 4].map((p) => {
      const r = priceShuttle(tariff, "AYT-ALN", "2026-12-01", p);
      assert.ok(r.ok);
      assert.equal(r.tariffVersionId, "test-tariff");
      return r.total.amountMinor;
    });
    assert.deepEqual(totals, [3000, 5000, 6000, 7000]);
  });

  it("sends 5 or more passengers to manual approval instead of extrapolating", () => {
    for (const p of [5, 6, 10]) {
      assert.deepEqual(priceShuttle(tariff, "AYT-ALN", "2026-12-01", p), { ok: false, reason: "requires_approval" });
    }
  });

  it("refuses to invent a price outside the tariff", () => {
    assert.deepEqual(priceShuttle(tariff, "AYT-XYZ", "2026-12-01", 2), { ok: false, reason: "route_not_in_tariff" });
    assert.deepEqual(priceShuttle(tariff, "AYT-ALN", "2027-04-01", 2), { ok: false, reason: "date_out_of_range" });
    assert.deepEqual(priceShuttle(tariff, "AYT-ALN", "2026-12-01", 11), { ok: false, reason: "over_capacity" });
    assert.deepEqual(priceShuttle(tariff, "AYT-ALN", "2026-12-01", 0), { ok: false, reason: "invalid_passengers" });
  });

  it("rejects a stale config that still carries a per-person extra", () => {
    assert.throws(
      () =>
        parseShuttleTariff({
          id: "old",
          approval: "approved",
          publishedAt: "2026-01-01",
          currency: "EUR",
          routes: ["AYT-ALN"],
          validFrom: "2026-01-01",
          maxPassengers: 10,
          totalsMinor: [3000],
          extraPerPassengerMinor: 3500,
        }),
      /no longer supported/,
    );
  });
});

describe("commission split 70/20/10", () => {
  it("splits each Owner sample booking exactly: supplier 70 %, site 20 %, centre 10 %", () => {
    const expected: Array<[number, number, number, number]> = [
      [3000, 2100, 600, 300],
      [5000, 3500, 1000, 500],
      [6000, 4200, 1200, 600],
      [7000, 4900, 1400, 700],
    ];
    for (const [sale, supplier, site, centre] of expected) {
      const s = splitShuttleRevenue(money(sale, "EUR"), SHUTTLE_SPLIT_V1);
      assert.deepEqual([s.carrier.amountMinor, s.partner.amountMinor, s.platform.amountMinor], [supplier, site, centre]);
    }
  });

  it("splits a partner-sourced booking exactly", () => {
    const s = splitShuttleRevenue(money(5000, "EUR"), SHUTTLE_SPLIT_V1);
    assert.equal(s.carrier.amountMinor, 3500);
    assert.equal(s.partner.amountMinor, 1000);
    assert.equal(s.platform.amountMinor, 500);
  });

  it("always sums to the base; rounding remainder goes to the platform", () => {
    for (const base of [1, 7, 333, 9999, 12345]) {
      const s = splitShuttleRevenue(money(base, "EUR"), SHUTTLE_SPLIT_V1);
      assert.equal(s.carrier.amountMinor + s.partner.amountMinor + s.platform.amountMinor, base);
    }
    const s = splitShuttleRevenue(money(333, "EUR"), SHUTTLE_SPLIT_V1);
    assert.deepEqual([s.carrier.amountMinor, s.partner.amountMinor, s.platform.amountMinor], [233, 66, 34]);
  });

  it("K4 proposal: direct Alanya Group sale 50 € → AG 5 €, supplier 45 €", () => {
    const s = splitShuttleRevenue(money(5000, "EUR"), SHUTTLE_DIRECT_SPLIT_PROPOSED);
    assert.deepEqual([s.carrier.amountMinor, s.partner.amountMinor, s.platform.amountMinor], [4500, 0, 500]);
  });

  it("rejects a policy that does not sum to 100%", () => {
    assert.throws(() =>
      splitShuttleRevenue(money(100, "EUR"), { id: "bad", status: "approved", carrierBps: 7000, partnerBps: 2000, platformBps: 500 }),
    );
  });
});

describe("booking status model", () => {
  it("keeps request, confirmed and delivered distinct", () => {
    assert.ok(canTransition("request", "confirmed"));
    assert.ok(!canTransition("request", "delivered"));
    assert.ok(!canTransition("delivered", "cancelled"));
    assert.throws(() => assertTransition("cancelled", "confirmed"));
  });
});

describe("ledger", () => {
  let n = 0;
  const ctx = { now: "2026-12-01T10:00:00Z", newId: () => `e${++n}` };
  const booking = {
    id: "b1",
    status: "delivered" as const,
    paymentStatus: "paid" as const,
    isTest: false,
    isDuplicate: false,
    sourcePartnerId: "p1",
    shareBase: money(5000, "EUR"),
  };

  it("earns shares only for delivered + paid, non-test, non-duplicate bookings", () => {
    assert.deepEqual(earnShuttleShares({ ...booking, status: "confirmed" }, "c1", POLICIES, ctx), {
      ok: false,
      reason: "not_delivered",
    });
    assert.deepEqual(earnShuttleShares({ ...booking, paymentStatus: "unpaid" }, "c1", POLICIES, ctx), {
      ok: false,
      reason: "not_paid",
    });
    assert.deepEqual(earnShuttleShares({ ...booking, isTest: true }, "c1", POLICIES, ctx), {
      ok: false,
      reason: "test_booking",
    });
    assert.deepEqual(earnShuttleShares({ ...booking, isDuplicate: true }, "c1", POLICIES, ctx), {
      ok: false,
      reason: "duplicate_booking",
    });
  });

  it("K4: a direct AG-site shuttle earns NO automatic shares while the 90/10 policy is only proposed", () => {
    const { sourcePartnerId: _drop, ...direct } = booking;
    assert.deepEqual(earnShuttleShares({ ...direct, id: "b-direct" }, "supplier-1", POLICIES, ctx), {
      ok: false,
      reason: "split_policy_not_approved",
    });
    const approved = { ...POLICIES, direct: { ...SHUTTLE_DIRECT_SPLIT_PROPOSED, status: "approved" as const } };
    const r = earnShuttleShares({ ...direct, id: "b-direct" }, "supplier-1", approved, ctx);
    assert.ok(r.ok);
    assert.deepEqual(
      r.entries.map((e) => [e.party.kind, e.amount.amountMinor]),
      [
        ["carrier", 4500],
        ["platform", 500],
      ],
      "no extra 20 % is written to the centre",
    );
  });

  it("records supplier, site and centre shares as separate entries", () => {
    const earned = earnShuttleShares({ ...booking, id: "b-sep" }, "supplier-1", POLICIES, ctx);
    assert.ok(earned.ok);
    assert.deepEqual(
      earned.entries.map((e) => [e.party.kind, e.party.id, e.amount.amountMinor, e.policyId]),
      [
        ["carrier", "supplier-1", 3500, "shuttle-split-v1"],
        ["partner", "p1", 1000, "shuttle-split-v1"],
        ["platform", "central", 500, "shuttle-split-v1"],
      ],
    );
    assert.equal(new Set(earned.entries.map((e) => e.id)).size, 3);
  });

  it("reverses each share exactly once after a post-payment cancellation", () => {
    const earned = earnShuttleShares(booking, "c1", POLICIES, ctx);
    assert.ok(earned.ok);
    const first = reverseEntries(earned.entries, "b1", ctx);
    assert.equal(first.length, 3);
    const second = reverseEntries([...earned.entries, ...first], "b1", ctx);
    assert.equal(second.length, 0, "repeat call must not duplicate reversals");
    const totals = balances([...earned.entries, ...first]);
    assert.ok(totals.every((row) => row.amountMinor === 0));
  });
});

describe("shuttle pool", () => {
  it("slots pickup times", () => {
    assert.equal(slotStartFor("2026-12-01T14:35", 60), "2026-12-01T14:00");
    assert.equal(slotStartFor("2026-12-01T14:35", 30), "2026-12-01T14:30");
  });

  it("fills the fullest run first and opens a new run instead of overbooking", () => {
    let k = 0;
    const opts = { slotMinutes: 60, capacity: 10, newRunId: () => `r${++k}` };
    const runs: ShuttleRun[] = [];
    const add = (id: string, pax: number, at = "2026-12-01T14:10") => {
      const p = placeInPool(runs, { bookingId: id, passengers: pax, routeCode: "AYT-ALN", pickupAt: at }, opts);
      const idx = runs.findIndex((r) => r.id === p.run.id);
      if (idx >= 0) runs[idx] = p.run;
      else runs.push(p.run);
      return p;
    };
    assert.equal(add("a", 6).kind, "new");
    assert.equal(add("b", 4, "2026-12-01T14:50").kind, "existing");
    const third = add("c", 2);
    assert.equal(third.kind, "new", "run is full at 10; must open a second vehicle");
    assert.equal(runs.length, 2);
  });
});

describe("site resolution", () => {
  const site = parseSiteRecord({
    id: "ornek-site",
    ownership: "partner",
    partnerId: "p1",
    domains: ["www.ornek.example", "ornek.example"],
    ownerEmail: "owner@ornek.example",
    status: "live",
  });
  const sites = new Map([[site.id, site]]);

  it("accepts only https origins on registered domains", () => {
    assert.ok(resolveSite(sites, "ornek-site", "https://www.ornek.example").ok);
    assert.deepEqual(resolveSite(sites, "ornek-site", "http://www.ornek.example"), {
      ok: false,
      reason: "origin_not_allowed",
    });
    assert.deepEqual(resolveSite(sites, "ornek-site", "https://evil.example"), {
      ok: false,
      reason: "origin_not_allowed",
    });
    assert.deepEqual(resolveSite(sites, "nope", "https://www.ornek.example"), { ok: false, reason: "unknown_site" });
  });

  it("requires partnerId for partner sites", () => {
    assert.throws(() =>
      parseSiteRecord({ id: "x-site", ownership: "partner", domains: ["a.example"], ownerEmail: "a@b.co", status: "live" }),
    );
  });
});

describe("intake validation", () => {
  const valid = {
    siteId: "ornek-site",
    product: "shuttle",
    routeCode: "AYT-ALN",
    pickup: "Antalya Airport (AYT)",
    dropoff: "Alanya, Oba",
    pickupAt: "2026-12-01T14:35",
    passengers: 2,
    customer: { name: "Jane Doe", email: "Jane@Example.com", phone: "+44 7700 900123", locale: "en" },
    consent: true,
  };

  it("accepts a valid shuttle request and normalises email", () => {
    const r = validateIntake(valid);
    assert.ok(r.ok);
    assert.equal(r.value.customer.email, "jane@example.com");
  });

  it("ignores any client-sent price", () => {
    const r = validateIntake({ ...valid, price: 1 });
    assert.ok(r.ok);
    assert.ok(!("price" in r.value));
  });

  it("rejects bots, bad dates and missing consent", () => {
    const r = validateIntake({ ...valid, website: "spam", pickupAt: "2026-02-30T10:00", consent: false });
    assert.ok(!r.ok);
    const fields = r.errors.map((e) => e.field).sort();
    assert.deepEqual(fields, ["consent", "pickupAt", "website"]);
  });

  it("requires a route for shuttle", () => {
    const { routeCode: _omit, ...rest } = valid;
    const r = validateIntake(rest);
    assert.ok(!r.ok);
    assert.deepEqual(r.errors, [{ field: "routeCode", code: "required" }]);
  });
});

describe("partner deck V3 (03.11.2026)", () => {
  it("K12 Model B (NETWORK_PASS): 80 € → supplier 47,50 €, site 32,50 €, Alanya Group 0 €", () => {
    const prices = { private: 8000, vip: 12000 };
    const p = splitPass("private", prices, "EUR", PASS_POLICY_DECK_V3);
    assert.ok(p.ok);
    assert.equal(p.split.partner.amountMinor, 3250);
    const v = splitPass("vip", prices, "EUR", PASS_POLICY_DECK_V3);
    assert.ok(v.ok);
    assert.equal(v.split.partner.amountMinor, 6000);
    assert.deepEqual(splitPass("private", { private: 4000 }, "EUR", PASS_POLICY_DECK_V3), { ok: false, reason: "sale_below_pass" });

    let k = 0;
    const r = earnPassShares(
      {
        id: "pv1",
        status: "delivered",
        paymentStatus: "paid",
        isTest: false,
        isDuplicate: false,
        sourcePartnerId: "p1",
        sale: money(8000, "EUR"),
        pass: money(4750, "EUR"),
        passPolicyId: PASS_POLICY_DECK_V3.id,
      },
      "supplier-9",
      { now: "2026-12-01T00:00:00Z", newId: () => `pv${++k}` },
    );
    assert.ok(r.ok);
    assert.deepEqual(
      r.entries.map((e) => [e.party.kind, e.amount.amountMinor]),
      [
        ["carrier", 4750],
        ["partner", 3250],
      ],
    );
    assert.ok(!r.entries.some((e) => e.party.kind === "platform"), "no Alanya Group transaction commission");
  });

  it("partner month: deck private figures with the Owner shuttle rule (2-person booking 50 € → 10 €)", async () => {
    const { partnerMonth, breakEvenUnits } = await import("./index.ts");
    // Private: sunum slayt 8 (32,50 € katkı). Shuttle: Owner kararı, 2 kişilik rezervasyon 50 € × %20 = 10 €.
    const m = partnerMonth({
      privatePerDay: 1.5,
      privateContributionMinor: 3250,
      shuttleBookingsPerDay: 3,
      shuttleContributionMinor: 1000,
    });
    assert.equal(m.costsMinor, 140000); // 200 € abonelik + 40 € × 30 gün reklam
    assert.equal(m.grossContributionMinor, 146250 + 90000);
    assert.equal(m.afterCostsMinor, 236250 - 140000);
    assert.equal(breakEvenUnits(140000, 3250), 44, "slide 12: 44 private bookings");
    assert.equal(breakEvenUnits(140000, 1000), 140, "2-person shuttle bookings (replaces the obsolete 200-ticket figure)");
  });

  it("monthly break-even with the Owner rule: 2-person shuttle (10 €) needs 140 bookings for 1.400 €", async () => {
    const { breakEvenUnits } = await import("./index.ts");
    assert.equal(breakEvenUnits(140000, 1000), 140);
  });

  it("reproduces the centre projection on slides 13–15 (INTERNAL only — not for partner decks)", async () => {
    const { centreMonth, centreBreakEvenSites } = await import("./index.ts");
    assert.deepEqual(
      [10, 25, 50, 100].map((n) => [centreMonth(n).afterCostsMinor, centreMonth(n).annualisedMinor]),
      [
        [-40000, -480000],
        [200000, 2400000],
        [600000, 7200000],
        [1400000, 16800000],
      ],
    );
    assert.equal(centreBreakEvenSites(), 13);
  });
});

describe("K8 tariff rules", () => {
  const base = {
    id: "k8",
    approval: "proposed",
    publishedAt: "2026-11-03",
    currency: "EUR",
    routes: ["AYT-ALN", "ALN-AYT", "GZP-ALN", "ALN-GZP"],
    pilotRoutes: ["GZP-ALN", "ALN-GZP"],
    validFrom: "2026-11-03",
    maxPassengers: 10,
    totalsMinor: [3000, 5000, 6000, 7000],
  };
  it("accepts one code per direction and marks the GZP line as pilot", () => {
    const t = parseShuttleTariff(base);
    assert.deepEqual(t.pilotRoutes, ["GZP-ALN", "ALN-GZP"]);
  });
  it("never allows an AYT ↔ GZP shuttle line", () => {
    assert.throws(() => parseShuttleTariff({ ...base, routes: [...base.routes, "AYT-GZP"] }), /not allowed/);
    assert.throws(() => parseShuttleTariff({ ...base, routes: [...base.routes, "GZP-AYT"] }), /not allowed/);
  });
  it("ties the start date to the publication date and rejects bad codes", () => {
    assert.throws(() => parseShuttleTariff({ ...base, validFrom: "2026-11-01" }), /before publishedAt/);
    assert.throws(() => parseShuttleTariff({ ...base, routes: ["AYT-ALANYA"] }), /routes/);
    assert.throws(() => parseShuttleTariff({ ...base, routes: ["AYT-ALN", "AYT-ALN"] }), /duplicate/);
  });
});

describe("K15 payments and weekly closing", () => {
  const total = money(5000, "EUR");
  let n = 0;
  const ev = (kind: PaymentEvent["kind"], method: PaymentEvent["method"], amount: number, party: PaymentEvent["party"], at = "2026-11-04T10:00:00Z"): PaymentEvent => ({
    id: `pay${++n}`,
    bookingId: "b1",
    kind,
    method,
    amount: money(amount, "EUR"),
    party,
    at,
  });
  const central = { kind: "platform", id: "central" } as const;
  const supplier = { kind: "carrier", id: "sup-1" } as const;
  const bookingInfo: Parameters<typeof checkPaymentEvent>[0] = { total, allowedMethods: ["card_online", "cash_in_vehicle"], assignedCarrierId: "sup-1" };

  it("tracks total, deposit, remaining and refunds per booking", () => {
    const deposit = ev("collection", "card_online", 1500, central);
    let s = paymentSummary(total, [deposit]);
    assert.deepEqual([s.collected.amountMinor, s.remaining.amountMinor, s.status], [1500, 3500, "partially_paid"]);
    const rest = ev("collection", "cash_in_vehicle", 3500, supplier);
    s = paymentSummary(total, [deposit, rest]);
    assert.deepEqual([s.remaining.amountMinor, s.status], [0, "paid"]);
    s = paymentSummary(total, [deposit, rest, ev("refund", "card_online", 5000, central)]);
    assert.equal(s.status, "refunded");
  });

  it("enforces who may collect how much", () => {
    const deposit = ev("collection", "card_online", 1500, central);
    const chk = (e: PaymentEvent, prior: PaymentEvent[] = [], b = bookingInfo) => checkPaymentEvent(b, prior, e);
    assert.deepEqual(chk(ev("collection", "card_online", 1000, supplier)), { ok: false, reason: "online_payment_must_go_through_central" });
    assert.deepEqual(chk(ev("collection", "cash_in_vehicle", 1000, { kind: "carrier", id: "other" })), { ok: false, reason: "cash_only_by_assigned_supplier" });
    assert.deepEqual(chk(ev("collection", "cash_in_vehicle", 1000, supplier), [], { ...bookingInfo, allowedMethods: ["card_online"] }), {
      ok: false,
      reason: "method_not_allowed_for_booking",
    });
    assert.deepEqual(chk(ev("collection", "cash_in_vehicle", 3600, supplier), [deposit]), { ok: false, reason: "exceeds_remaining" });
    assert.deepEqual(chk(ev("refund", "card_online", 1600, central), [deposit]), { ok: false, reason: "refund_exceeds_collected" });
    assert.deepEqual(checkPaymentEvent({ ...bookingInfo, total: undefined }, [], ev("collection", "card_online", 100, central)), {
      ok: false,
      reason: "price_not_set",
    });
  });

  it("closes a week once: cash held by the supplier is netted, nothing is counted twice, money is conserved", () => {
    // 50 € shuttle, uydu site kaynaklı: 15 € online ön ödeme merkeze, 35 € araçta nakit tedarikçiye.
    const ledger: LedgerEntry[] = [
      { id: "l1", bookingId: "b1", party: supplier, amount: money(3500, "EUR"), kind: "shuttle_share", policyId: "shuttle-split-v1", createdAt: "2026-11-05T12:00:00Z" },
      { id: "l2", bookingId: "b1", party: { kind: "partner", id: "site-1" }, amount: money(1000, "EUR"), kind: "shuttle_share", policyId: "shuttle-split-v1", createdAt: "2026-11-05T12:00:00Z" },
      { id: "l3", bookingId: "b1", party: central, amount: money(500, "EUR"), kind: "shuttle_share", policyId: "shuttle-split-v1", createdAt: "2026-11-05T12:00:00Z" },
    ];
    const payments = [ev("collection", "card_online", 1500, central, "2026-11-03T09:00:00Z"), ev("collection", "cash_in_vehicle", 3500, supplier, "2026-11-05T11:00:00Z")];
    // Gelecek haftaya ait, bu kapanışa girmemeli:
    const later = ev("collection", "card_online", 3000, central, "2026-11-10T09:00:00Z");
    const c1 = closeWeek({ weekStart: "2026-11-02", ledger, payments: [...payments, later], closedEntryIds: new Set(), closedPaymentIds: new Set() });
    const net = Object.fromEntries(c1.statements.map((r) => [`${r.party.kind}:${r.party.id}`, r.netMinor]));
    assert.deepEqual(net, { "carrier:sup-1": 0, "partner:site-1": 1000, "platform:central": -1000 });
    // Merkez 15 € tuttu, 5 € payı var → 10 € siteye borçlu; tedarikçi 35 € nakit aldı, 35 € payı var → 0.
    const sumNet = c1.statements.reduce((a, r) => a + r.netMinor, 0);
    assert.equal(sumNet + (c1.unallocatedMinor.EUR ?? 0), 0, "conservation");
    assert.equal(c1.payoutExecution, "disabled_pending_legal_review");
    assert.ok(!c1.paymentIds.includes(later.id));

    const c2 = closeWeek({
      weekStart: "2026-11-09",
      ledger,
      payments: [...payments, later],
      closedEntryIds: new Set(c1.entryIds),
      closedPaymentIds: new Set(c1.paymentIds),
    });
    assert.deepEqual(c2.entryIds, [], "no ledger entry is closed twice");
    assert.deepEqual(c2.paymentIds, [later.id]);
    assert.equal(c2.unallocatedMinor.EUR, 3000, "a prepayment for an undelivered trip stays unallocated");
  });

  it("rejects a week start that is not a Monday", () => {
    assert.throws(() => closeWeek({ weekStart: "2026-11-03", ledger: [], payments: [], closedEntryIds: new Set(), closedPaymentIds: new Set() }), /Monday/);
  });
});

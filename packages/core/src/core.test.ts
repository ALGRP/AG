import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SHUTTLE_SPLIT_V1,
  assertTransition,
  canTransition,
  money,
  parseShuttleTariff,
  parseSiteRecord,
  placeInPool,
  priceShuttle,
  resolveSite,
  slotStartFor,
  splitShuttleRevenue,
  validateIntake,
  type ShuttleRun,
} from "./index.ts";


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

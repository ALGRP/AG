import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SHUTTLE_SPLIT_V1,
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
} from "./index.ts";

const tariff = parseShuttleTariff({
  id: "test-tariff",
  currency: "EUR",
  routes: ["AYT-ALANYA"],
  validFrom: "2026-11-01",
  validTo: "2027-03-31",
  maxPassengers: 10,
  totalsMinor: [3000, 5000, 6000],
  extraPerPassengerMinor: 1000,
});

describe("shuttle tariff", () => {
  it("prices group totals 30/50/60/70/80 and +10 per person", () => {
    const totals = [1, 2, 3, 4, 5, 10].map((p) => {
      const r = priceShuttle(tariff, "AYT-ALANYA", "2026-12-01", p);
      assert.ok(r.ok);
      return r.total.amountMinor;
    });
    assert.deepEqual(totals, [3000, 5000, 6000, 7000, 8000, 13000]);
  });

  it("refuses to invent a price outside the tariff", () => {
    assert.deepEqual(priceShuttle(tariff, "AYT-KEMER", "2026-12-01", 2), { ok: false, reason: "route_not_in_tariff" });
    assert.deepEqual(priceShuttle(tariff, "AYT-ALANYA", "2027-04-01", 2), { ok: false, reason: "date_out_of_range" });
    assert.deepEqual(priceShuttle(tariff, "AYT-ALANYA", "2026-12-01", 11), { ok: false, reason: "over_capacity" });
    assert.deepEqual(priceShuttle(tariff, "AYT-ALANYA", "2026-12-01", 0), { ok: false, reason: "invalid_passengers" });
  });
});

describe("commission split 70/20/10", () => {
  it("splits a partner-sourced booking exactly", () => {
    const s = splitShuttleRevenue(money(5000, "EUR"), SHUTTLE_SPLIT_V1, true);
    assert.equal(s.carrier.amountMinor, 3500);
    assert.equal(s.partner.amountMinor, 1000);
    assert.equal(s.platform.amountMinor, 500);
  });

  it("always sums to the base; rounding remainder goes to the platform", () => {
    for (const base of [1, 7, 333, 9999, 12345]) {
      const s = splitShuttleRevenue(money(base, "EUR"), SHUTTLE_SPLIT_V1, true);
      assert.equal(s.carrier.amountMinor + s.partner.amountMinor + s.platform.amountMinor, base);
    }
    const s = splitShuttleRevenue(money(333, "EUR"), SHUTTLE_SPLIT_V1, true);
    assert.deepEqual([s.carrier.amountMinor, s.partner.amountMinor, s.platform.amountMinor], [233, 66, 34]);
  });

  it("gives the partner share to the platform when the source is an Alanya Group site", () => {
    const s = splitShuttleRevenue(money(5000, "EUR"), SHUTTLE_SPLIT_V1, false);
    assert.deepEqual([s.carrier.amountMinor, s.partner.amountMinor, s.platform.amountMinor], [3500, 0, 1500]);
  });

  it("rejects a policy that does not sum to 100%", () => {
    assert.throws(() =>
      splitShuttleRevenue(money(100, "EUR"), { id: "bad", carrierBps: 7000, partnerBps: 2000, platformBps: 500 }, true),
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
    assert.deepEqual(earnShuttleShares({ ...booking, status: "confirmed" }, "c1", SHUTTLE_SPLIT_V1, ctx), {
      ok: false,
      reason: "not_delivered",
    });
    assert.deepEqual(earnShuttleShares({ ...booking, paymentStatus: "unpaid" }, "c1", SHUTTLE_SPLIT_V1, ctx), {
      ok: false,
      reason: "not_paid",
    });
    assert.deepEqual(earnShuttleShares({ ...booking, isTest: true }, "c1", SHUTTLE_SPLIT_V1, ctx), {
      ok: false,
      reason: "test_booking",
    });
    assert.deepEqual(earnShuttleShares({ ...booking, isDuplicate: true }, "c1", SHUTTLE_SPLIT_V1, ctx), {
      ok: false,
      reason: "duplicate_booking",
    });
  });

  it("reverses each share exactly once after a post-payment cancellation", () => {
    const earned = earnShuttleShares(booking, "c1", SHUTTLE_SPLIT_V1, ctx);
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
      const p = placeInPool(runs, { bookingId: id, passengers: pax, routeCode: "AYT-ALANYA", pickupAt: at }, opts);
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
    routeCode: "AYT-ALANYA",
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

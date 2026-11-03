import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { SHUTTLE_SPLIT_V1, parseShuttleTariff, parseSiteRecord, type SiteRecord } from "@ag/core";
import { createApiServer } from "./http.ts";
import { BookingService } from "./service.ts";
import { MemoryStore } from "./store.ts";

const partnerSite = parseSiteRecord({
  id: "partner-site",
  ownership: "partner",
  partnerId: "p-001",
  domains: ["www.partner.example"],
  ownerEmail: "owner@partner.example",
  status: "live",
});
const agSite = parseSiteRecord({
  id: "ag-brand-site",
  ownership: "ag_brand",
  domains: ["www.agbrand.example"],
  ownerEmail: "ops@agbrand.example",
  status: "live",
});
const sites = new Map<string, SiteRecord>([
  [partnerSite.id, partnerSite],
  [agSite.id, agSite],
]);

let seq = 0;
const store = new MemoryStore();
const service = new BookingService({
  store,
  sites,
  shuttleTariff: parseShuttleTariff({
    id: "t1",
    currency: "EUR",
    routes: ["AYT-ALANYA"],
    validFrom: "2026-01-01",
    maxPassengers: 10,
    totalsMinor: [3000, 5000, 6000],
    extraPerPassengerMinor: 1000,
  }),
  splitPolicy: SHUTTLE_SPLIT_V1,
  pool: { slotMinutes: 60, vehicleCapacity: 10 },
  devOrigins: [],
  clock: () => new Date("2026-11-03T10:00:00Z"),
  random: { id: () => `id-${++seq}`, index: (m) => seq++ % m, token: () => `tok-${++seq}` },
  verifyHuman: async () => true,
});
const server = createApiServer({ service, sites, devOrigins: [], adminToken: "admin-secret-for-tests" });
let base = "";

before(async () => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => new Promise<void>((r) => server.close(() => r())));

const shuttleBody = (over: Record<string, unknown> = {}) => ({
  siteId: "partner-site",
  product: "shuttle",
  routeCode: "AYT-ALANYA",
  pickup: "Antalya Airport (AYT)",
  dropoff: "Alanya, Mahmutlar",
  pickupAt: "2026-12-05T13:20",
  passengers: 2,
  customer: { name: "Test Guest", email: "guest@example.com", phone: "+49 151 0000000", locale: "de" },
  consent: true,
  ...over,
});

async function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  const r = await fetch(base + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: (await r.json()) as Record<string, any> };
}
const admin = { authorization: "Bearer admin-secret-for-tests" };
const fromPartner = { origin: "https://www.partner.example" };

describe("public intake", () => {
  it("rejects requests without an idempotency key", async () => {
    const r = await post("/v1/public/bookings", shuttleBody(), fromPartner);
    assert.equal(r.status, 400);
  });

  it("rejects an origin that is not registered for the site", async () => {
    const r = await post("/v1/public/bookings", shuttleBody(), {
      origin: "https://www.agbrand.example",
      "idempotency-key": "k-origin-mismatch-0001",
    });
    assert.equal(r.status, 403);
    assert.equal(r.body.error, "origin_not_allowed");
  });

  it("prices shuttle on the server, pools it, and is idempotent", async () => {
    const headers = { ...fromPartner, "idempotency-key": "k-shuttle-000000001" };
    const first = await post("/v1/public/bookings", shuttleBody({ price: 1 }), headers);
    assert.equal(first.status, 201);
    assert.deepEqual(first.body.price, { amountMinor: 5000, currency: "EUR" }, "client price is ignored");
    assert.equal(first.body.status, "request", "form submission is not a confirmed sale");

    const again = await post("/v1/public/bookings", shuttleBody({ price: 1 }), headers);
    assert.equal(again.status, 201);
    assert.equal(again.body.ref, first.body.ref, "same key returns the same booking");

    const conflict = await post("/v1/public/bookings", shuttleBody({ passengers: 3 }), headers);
    assert.equal(conflict.status, 409);
  });

  it("routes private requests to the site owner and the centre", async () => {
    const r = await post(
      "/v1/public/bookings",
      shuttleBody({ product: "vip", routeCode: undefined, passengers: 4, pickupAt: "2026-12-06T09:00" }),
      { ...fromPartner, "idempotency-key": "k-private-00000001" },
    );
    assert.equal(r.status, 201);
    assert.equal(r.body.next, "site_owner_will_send_quote");
    const outbox = await fetch(base + "/v1/admin/outbox", { headers: admin }).then((x) => x.json());
    const types = (outbox as Array<{ type: string }>).map((e) => e.type);
    assert.ok(types.includes("private.request_received.notify_site_owner"));
    assert.ok(types.includes("private.request_received.notify_central"));
    assert.ok(!JSON.stringify(outbox).includes("guest@example.com"), "outbox payload carries no PII");
  });

  it("lets the customer look up a booking only with its token", async () => {
    const created = await post("/v1/public/bookings", shuttleBody({ pickupAt: "2026-12-07T10:00" }), {
      ...fromPartner,
      "idempotency-key": "k-lookup-000000001",
    });
    const ok = await fetch(`${base}/v1/public/bookings/${created.body.ref}`, {
      headers: { "x-lookup-token": created.body.lookupToken },
    });
    assert.equal(ok.status, 200);
    const bad = await fetch(`${base}/v1/public/bookings/${created.body.ref}`, { headers: { "x-lookup-token": "nope" } });
    assert.equal(bad.status, 404);
  });
});

describe("shuttle pool → 70/20/10 ledger", () => {
  it("earns shares only for delivered and paid bookings", async () => {
    const mk = (key: string, body: Record<string, unknown>, origin = fromPartner) =>
      post("/v1/public/bookings", shuttleBody({ pickupAt: "2026-12-10T15:05", ...body }), {
        ...origin,
        "idempotency-key": key,
      });
    const a = await mk("k-pool-a-000000001", { passengers: 2 }); // partner kaynaklı, 50 €
    const b = await mk(
      "k-pool-b-000000001",
      { siteId: "ag-brand-site", passengers: 1, customer: { name: "B", email: "b@example.com", phone: "+90 532 000 0000", locale: "en" } },
      { origin: "https://www.agbrand.example" },
    ); // AG kaynaklı, 30 €
    const c = await mk("k-pool-c-000000001", {
      passengers: 3,
      customer: { name: "C", email: "c@example.com", phone: "+90 533 000 0000", locale: "en" },
    }); // tahsil edilmeyecek

    const bookings = (await fetch(base + "/v1/admin/bookings", { headers: admin }).then((x) => x.json())) as any[];
    const runIds = new Set(bookings.filter((x) => [a, b, c].some((y) => y.body.ref === x.ref)).map((x) => x.shuttleRunId));
    assert.equal(runIds.size, 1, "same route + slot → one run");
    const runId = [...runIds][0];

    for (const r of [a, b, c]) assert.equal((await post(`/v1/admin/bookings/${r.body.ref}/confirm`, {}, admin)).status, 200);
    assert.equal((await post(`/v1/admin/shuttle-runs/${runId}/assign`, { carrierPayeeId: "carrier-7" }, admin)).status, 200);
    const done = await post(`/v1/admin/shuttle-runs/${runId}/complete`, { paidRefs: [a.body.ref, b.body.ref] }, admin);
    assert.equal(done.status, 200);
    const results = Object.fromEntries((done.body.bookings as any[]).map((x) => [x.ref, x.result]));
    assert.equal(results[a.body.ref], "shares_earned");
    assert.equal(results[b.body.ref], "shares_earned");
    assert.equal(results[c.body.ref], "not_paid");

    const bal = (await fetch(base + "/v1/admin/ledger/balances", { headers: admin }).then((x) => x.json())) as any[];
    const get = (kind: string, id: string) => bal.find((r) => r.party.kind === kind && r.party.id === id)?.amountMinor;
    assert.equal(get("carrier", "carrier-7"), 3500 + 2100); // %70 × (50 + 30)
    assert.equal(get("partner", "p-001"), 1000); // %20 × 50 (yalnız partner kaynaklı)
    assert.equal(get("platform", "central"), 500 + 900); // %10 × 50 + (%10 + %20) × 30
  });

  it("keeps admin endpoints closed without the token", async () => {
    const r = await fetch(base + "/v1/admin/bookings");
    assert.equal(r.status, 401);
  });
});

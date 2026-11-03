import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { PASS_POLICY_DECK_V3, SHUTTLE_SPLIT_V1, parseShuttleTariff, parseSiteRecord, type SiteRecord } from "@ag/core";
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
  privateMode: "pass_to_network",
  salePrices: { private: 8000, vip: 12000 },
  saleCurrency: "EUR",
});
const selfOpSite = parseSiteRecord({
  id: "self-op-site",
  ownership: "partner",
  partnerId: "p-002",
  domains: ["www.selfop.example"],
  ownerEmail: "owner@selfop.example",
  status: "live",
  privateMode: "self_operate",
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
  [selfOpSite.id, selfOpSite],
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
    totalsMinor: [3000, 5000, 6000, 7000],
  }),
  splitPolicy: SHUTTLE_SPLIT_V1,
  passPolicy: PASS_POLICY_DECK_V3,
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

  it("self_operate: private request goes to the site owner, unpriced, and the centre is informed", async () => {
    const r = await post(
      "/v1/public/bookings",
      shuttleBody({ siteId: "self-op-site", product: "vip", routeCode: undefined, passengers: 4, pickupAt: "2026-12-06T09:00" }),
      { origin: "https://www.selfop.example", "idempotency-key": "k-private-00000001" },
    );
    assert.equal(r.status, 201);
    assert.equal(r.body.next, "site_owner_will_send_quote");
    assert.equal(r.body.price, undefined);
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

  it("pass model (deck V3): private 80 € → site 32,50 €; pass 47,50 € split between vehicle and centre", async () => {
    const created = await post(
      "/v1/public/bookings",
      shuttleBody({ product: "private", routeCode: undefined, pickupAt: "2026-12-11T09:00", customer: { name: "P", email: "p@example.com", phone: "+90 534 000 0000", locale: "en" } }),
      { ...fromPartner, "idempotency-key": "k-pass-private-0001" },
    );
    assert.equal(created.status, 201);
    assert.deepEqual(created.body.price, { amountMinor: 8000, currency: "EUR" });
    assert.equal(created.body.next, "central_operations_will_confirm");
    const ref = created.body.ref;

    assert.equal((await post(`/v1/admin/bookings/${ref}/complete`, { carrierPayeeId: "c-9", carrierPayoutMinor: 4000, paid: true }, admin)).status, 409, "must be confirmed first");
    assert.equal((await post(`/v1/admin/bookings/${ref}/confirm`, {}, admin)).status, 200);
    const tooMuch = await post(`/v1/admin/bookings/${ref}/complete`, { carrierPayeeId: "c-9", carrierPayoutMinor: 4800, paid: true }, admin);
    assert.equal(tooMuch.status, 422, "vehicle payout cannot exceed the pass");
    const done = await post(`/v1/admin/bookings/${ref}/complete`, { carrierPayeeId: "c-9", carrierPayoutMinor: 4000, paid: true }, admin);
    assert.equal(done.body.result, "shares_earned");

    const bal = (await fetch(base + "/v1/admin/ledger/balances", { headers: admin }).then((x) => x.json())) as any[];
    const get = (kind: string, id: string) => bal.find((r) => r.party.kind === kind && r.party.id === id)?.amountMinor;
    assert.equal(get("carrier", "c-9"), 4000);
    assert.equal(get("partner", "p-001"), 1000 + 3250, "shuttle %20 (earlier test) + private 32,50 €");
    assert.equal(get("platform", "central"), 1400 + 750);
  });

  it("Owner sample bookings 1–4 pax: price 30/50/60/70 and 70/20/10 shares recorded per party", async () => {
    const refs: string[] = [];
    for (const pax of [1, 2, 3, 4]) {
      const r = await post(
        "/v1/public/bookings",
        shuttleBody({
          pickupAt: "2026-12-12T11:10",
          routeCode: "AYT-ALANYA",
          passengers: pax,
          customer: { name: `S${pax}`, email: `s${pax}@example.com`, phone: `+90 535 000 000${pax}`, locale: "en" },
        }),
        { ...fromPartner, "idempotency-key": `k-owner-sample-${pax}-000` },
      );
      assert.equal(r.status, 201);
      assert.deepEqual(r.body.price, { amountMinor: [3000, 5000, 6000, 7000][pax - 1], currency: "EUR" });
      refs.push(r.body.ref);
    }
    const list = (await fetch(base + "/v1/admin/bookings", { headers: admin }).then((x) => x.json())) as any[];
    const runIds = [...new Set(list.filter((b) => refs.includes(b.ref)).map((b) => b.shuttleRunId))];
    assert.equal(runIds.length, 1, "1+2+3+4 = 10 seats fill exactly one vehicle (capacity 10)");

    for (const ref of refs) await post(`/v1/admin/bookings/${ref}/confirm`, {}, admin);
    const before = (await fetch(base + "/v1/admin/ledger/balances", { headers: admin }).then((x) => x.json())) as any[];
    const amount = (rows: any[], kind: string, id: string) => rows.find((r) => r.party.kind === kind && r.party.id === id)?.amountMinor ?? 0;
    for (const runId of runIds) {
      await post(`/v1/admin/shuttle-runs/${runId}/assign`, { carrierPayeeId: "supplier-owner-test" }, admin);
      await post(`/v1/admin/shuttle-runs/${runId}/complete`, { paidRefs: refs }, admin);
    }
    const after = (await fetch(base + "/v1/admin/ledger/balances", { headers: admin }).then((x) => x.json())) as any[];
    // Toplam satış 30 + 50 + 60 + 70 = 210 € → tedarikçi 147 €, site 42 €, merkez 21 €
    assert.equal(amount(after, "carrier", "supplier-owner-test"), 14700);
    assert.equal(amount(after, "partner", "p-001") - amount(before, "partner", "p-001"), 4200);
    assert.equal(amount(after, "platform", "central") - amount(before, "platform", "central"), 2100);
  });

  it("5+ passengers: no automatic price; manual approval, then the same 70/20/10 split", async () => {
    const quote = await fetch(`${base}/v1/public/shuttle-quote?route=AYT-ALANYA&date=2026-12-13&passengers=5`);
    assert.equal(quote.status, 200);
    assert.deepEqual(await quote.json(), { requiresApproval: true });

    const r = await post(
      "/v1/public/bookings",
      shuttleBody({ pickupAt: "2026-12-13T08:00", passengers: 5, customer: { name: "Big", email: "big@example.com", phone: "+90 536 000 0000", locale: "en" } }),
      { ...fromPartner, "idempotency-key": "k-five-pax-0000001" },
    );
    assert.equal(r.status, 201);
    assert.equal(r.body.price, undefined, "no automatic price for 5+");
    assert.equal(r.body.next, "price_requires_approval");
    const ref = r.body.ref;

    assert.equal((await post(`/v1/admin/bookings/${ref}/confirm`, {}, admin)).body.error, "price_requires_approval");
    assert.equal((await post(`/v1/admin/bookings/${ref}/approve-price`, { amountMinor: 8000, currency: "USD" }, admin)).status, 422);
    assert.equal((await post(`/v1/admin/bookings/${ref}/approve-price`, { amountMinor: 8000, currency: "EUR" }, admin)).status, 200);
    assert.equal((await post(`/v1/admin/bookings/${ref}/approve-price`, { amountMinor: 9000, currency: "EUR" }, admin)).body.error, "price_already_set");
    assert.equal((await post(`/v1/admin/bookings/${ref}/confirm`, {}, admin)).status, 200);

    const list = (await fetch(base + "/v1/admin/bookings", { headers: admin }).then((x) => x.json())) as any[];
    const row = list.find((b) => b.ref === ref);
    assert.equal(row.price.mode, "SHUTTLE_MANUAL_APPROVED");
    await post(`/v1/admin/shuttle-runs/${row.shuttleRunId}/assign`, { carrierPayeeId: "supplier-five" }, admin);
    const done = await post(`/v1/admin/shuttle-runs/${row.shuttleRunId}/complete`, { paidRefs: [ref] }, admin);
    assert.equal(done.body.bookings[0].result, "shares_earned");
    const bal = (await fetch(base + "/v1/admin/ledger/balances", { headers: admin }).then((x) => x.json())) as any[];
    assert.equal(bal.find((b) => b.party.id === "supplier-five").amountMinor, 5600); // %70 × 80 €
  });

  it("keeps admin endpoints closed without the token", async () => {
    const r = await fetch(base + "/v1/admin/bookings");
    assert.equal(r.status, 401);
  });
});

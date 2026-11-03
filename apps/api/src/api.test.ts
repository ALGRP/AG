import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import {
  PASS_POLICY_DECK_V3,
  SHUTTLE_DIRECT_SPLIT_PROPOSED,
  SHUTTLE_SPLIT_V1,
  parseShuttleTariff,
  parseSiteRecord,
  type SiteRecord,
} from "@ag/core";
import { createApiServer } from "./http.ts";
import { BookingService } from "./service.ts";
import { MemoryStore } from "./store.ts";

const BOTH = ["card_online", "cash_in_vehicle"];
const sites = new Map<string, SiteRecord>(
  [
    {
      id: "partner-site",
      ownership: "partner",
      partnerId: "p-001",
      domains: ["www.partner.example"],
      ownerEmail: "owner@partner.example",
      status: "live",
      privateMode: "network_pass",
      salePrices: { private: 8000, vip: 12000 },
      saleCurrency: "EUR",
      paymentMethods: BOTH,
    },
    {
      id: "self-op-site",
      ownership: "partner",
      partnerId: "p-002",
      domains: ["www.selfop.example"],
      ownerEmail: "owner@selfop.example",
      status: "live",
      privateMode: "self_operated",
      selfOperationVerifiedAt: "2026-11-01T00:00:00Z",
      paymentMethods: BOTH,
    },
    {
      id: "ag-brand-site",
      ownership: "ag_brand",
      domains: ["www.agbrand.example"],
      ownerEmail: "ops@agbrand.example",
      status: "live",
      paymentMethods: ["card_online"],
    },
  ].map((raw) => {
    const s = parseSiteRecord(raw);
    return [s.id, s];
  }),
);

const ORIGIN: Record<string, string> = {
  "partner-site": "https://www.partner.example",
  "self-op-site": "https://www.selfop.example",
  "ag-brand-site": "https://www.agbrand.example",
};
const admin = { authorization: "Bearer admin-secret-for-tests" };

/** Her senaryo kendi temiz sunucusu ve deposuyla çalışır; bakiyeler birbirine karışmaz. */
function harness() {
  let seq = 0;
  let now = new Date("2026-11-03T10:00:00Z");
  const service = new BookingService({
    store: new MemoryStore(),
    sites,
    shuttleTariff: parseShuttleTariff({
      id: "t1",
      approval: "approved",
      publishedAt: "2026-01-01",
      currency: "EUR",
      routes: ["AYT-ALN", "ALN-AYT"],
      validFrom: "2026-01-01",
      maxPassengers: 10,
      totalsMinor: [3000, 5000, 6000, 7000],
    }),
    splitPolicies: { partnerSourced: SHUTTLE_SPLIT_V1, direct: SHUTTLE_DIRECT_SPLIT_PROPOSED },
    passPolicy: PASS_POLICY_DECK_V3,
    pool: { slotMinutes: 60, vehicleCapacity: 10 },
    devOrigins: [],
    clock: () => now,
    random: { id: () => `id-${++seq}`, index: (m) => (seq++ * 7) % m, token: () => `tok-${++seq}` },
    verifyHuman: async () => true,
  });
  const server = createApiServer({ service, sites, devOrigins: [], adminToken: "admin-secret-for-tests", publicRateLimitPerMinute: 1000 });
  const h = {
    base: "",
    setNow(iso: string) {
      now = new Date(iso);
    },
    async post(path: string, body: unknown, headers: Record<string, string> = {}) {
      const r = await fetch(h.base + path, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
      });
      return { status: r.status, body: (await r.json()) as Record<string, any> };
    },
    async get(path: string) {
      return (await fetch(h.base + path, { headers: admin }).then((x) => x.json())) as any;
    },
    async book(over: Record<string, unknown>, key: string) {
      const body = {
        siteId: "partner-site",
        product: "shuttle",
        routeCode: "AYT-ALN",
        pickup: "Antalya Airport (AYT)",
        dropoff: "Alanya, Mahmutlar",
        pickupAt: "2026-12-05T13:20",
        passengers: 2,
        customer: { name: "Guest", email: `${key}@example.com`, phone: "+49 151 0000000", locale: "de" },
        consent: true,
        ...over,
      };
      return h.post("/v1/public/bookings", body, { origin: ORIGIN[body.siteId as string]!, "idempotency-key": key.padEnd(16, "0") });
    },
    adminPost: (path: string, body: unknown = {}) => h.post(path, body, admin),
    async balance(kind: string, id: string) {
      const rows = (await h.get("/v1/admin/ledger/balances")) as any[];
      return rows.find((r) => r.party.kind === kind && r.party.id === id)?.amountMinor ?? 0;
    },
    async runOf(ref: string) {
      return ((await h.get("/v1/admin/bookings")) as any[]).find((b) => b.ref === ref).shuttleRunId as string;
    },
    start: () =>
      new Promise<void>((r) =>
        server.listen(0, "127.0.0.1", () => {
          h.base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
          r();
        }),
      ),
    stop: () => new Promise<void>((r) => server.close(() => r())),
  };
  return h;
}

const central = { kind: "platform" };
const card = (amountMinor: number) => ({ kind: "collection", method: "card_online", amountMinor, party: central });
const cash = (amountMinor: number, supplier: string) => ({
  kind: "collection",
  method: "cash_in_vehicle",
  amountMinor,
  party: { kind: "carrier", id: supplier },
});

describe("public intake", () => {
  const h = harness();
  before(h.start);
  after(h.stop);

  it("rejects requests without an idempotency key or from an unregistered origin", async () => {
    assert.equal((await h.post("/v1/public/bookings", {}, { origin: ORIGIN["partner-site"]! })).status, 400);
    const valid = {
      siteId: "partner-site",
      product: "shuttle",
      routeCode: "AYT-ALN",
      pickup: "AYT",
      dropoff: "Alanya",
      pickupAt: "2026-12-05T13:20",
      passengers: 2,
      customer: { name: "G", email: "g@example.com", phone: "+49 151 0000000", locale: "de" },
      consent: true,
    };
    const r = await h.post("/v1/public/bookings", valid, { origin: "https://www.agbrand.example", "idempotency-key": "k-origin-mismatch-0001" });
    assert.equal(r.status, 403);
    assert.equal(r.body.error, "origin_not_allowed");
  });

  it("prices shuttle on the server, ignores client prices, and is idempotent", async () => {
    const first = await h.book({ price: 1 }, "k-idem");
    assert.equal(first.status, 201);
    assert.deepEqual(first.body.price, { amountMinor: 5000, currency: "EUR" });
    assert.equal(first.body.status, "request", "a form submission is not a confirmed sale");
    assert.equal((await h.book({ price: 1 }, "k-idem")).body.ref, first.body.ref);
    assert.equal((await h.book({ passengers: 3 }, "k-idem")).status, 409);
  });

  it("refuses a payment method the site does not allow", async () => {
    const r = await h.book({ siteId: "ag-brand-site", paymentMethod: "cash_in_vehicle" }, "k-paymeth");
    assert.equal(r.body.error, "payment_method_not_allowed_for_site");
  });

  it("lets the customer look up a booking only with its token", async () => {
    const created = await h.book({ pickupAt: "2026-12-07T10:00" }, "k-lookup");
    const ok = await fetch(`${h.base}/v1/public/bookings/${created.body.ref}`, { headers: { "x-lookup-token": created.body.lookupToken } });
    assert.equal(ok.status, 200);
    const bad = await fetch(`${h.base}/v1/public/bookings/${created.body.ref}`, { headers: { "x-lookup-token": "nope" } });
    assert.equal(bad.status, 404);
  });

  it("keeps admin endpoints closed without the token", async () => {
    assert.equal((await fetch(h.base + "/v1/admin/bookings")).status, 401);
  });
});

describe("shuttle — Owner decision (30/50/60/70, 70/20/10, 5+ manual)", () => {
  const h = harness();
  before(h.start);
  after(h.stop);

  it("sample bookings 1–4 pax: prices, one vehicle, separate shares after full payment", async () => {
    const refs: string[] = [];
    for (const pax of [1, 2, 3, 4]) {
      const r = await h.book({ passengers: pax, pickupAt: "2026-12-12T11:10" }, `k-sample-${pax}`);
      assert.deepEqual(r.body.price, { amountMinor: [3000, 5000, 6000, 7000][pax - 1], currency: "EUR" });
      refs.push(r.body.ref);
    }
    const runId = await h.runOf(refs[0]!);
    for (const ref of refs) assert.equal(await h.runOf(ref), runId, "1+2+3+4 = 10 seats fill one vehicle");
    for (const ref of refs) await h.adminPost(`/v1/admin/bookings/${ref}/confirm`);
    await h.adminPost(`/v1/admin/shuttle-runs/${runId}/assign`, { carrierPayeeId: "sup-A" });

    // Ödemesiz tamamlama: pay yazılmaz, tahsilat beklenir.
    const done = await h.adminPost(`/v1/admin/shuttle-runs/${runId}/complete`);
    assert.ok((done.body.bookings as any[]).every((b) => b.result === "awaiting_payment"));
    assert.equal(await h.balance("carrier", "sup-A"), 0);

    // Tahsilat: ilk ikisi online (merkez), son ikisi araçta nakit (tedarikçi). Son tahsilatla pay yazılır.
    for (const [i, ref] of refs.entries()) {
      const amount = [3000, 5000, 6000, 7000][i]!;
      const r = await h.adminPost(`/v1/admin/bookings/${ref}/payments`, i < 2 ? card(amount) : cash(amount, "sup-A"));
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.equal(r.body.finance, "shares_earned");
    }
    // Toplam satış 210 € → tedarikçi 147 €, site 42 €, Alanya Group 21 € — ayrı satırlar.
    assert.equal(await h.balance("carrier", "sup-A"), 14700);
    assert.equal(await h.balance("partner", "p-001"), 4200);
    assert.equal(await h.balance("platform", "central"), 2100);

    // Mükerrer koruma: aynı rezervasyon için ikinci tahsilat kalanı aşar.
    assert.equal((await h.adminPost(`/v1/admin/bookings/${refs[0]}/payments`, card(100))).body.error, "exceeds_remaining");
  });

  it("5+ passengers: no automatic price, no supplier share until a manual price is approved", async () => {
    const quote = await fetch(`${h.base}/v1/public/shuttle-quote?route=AYT-ALN&date=2026-12-13&passengers=5`);
    assert.deepEqual(await quote.json(), { requiresApproval: true });
    const r = await h.book({ passengers: 5, pickupAt: "2026-12-13T08:00" }, "k-five");
    assert.equal(r.body.price, undefined);
    assert.equal(r.body.next, "price_requires_approval");
    const ref = r.body.ref;
    assert.equal((await h.adminPost(`/v1/admin/bookings/${ref}/confirm`)).body.error, "price_requires_approval");
    assert.equal((await h.adminPost(`/v1/admin/bookings/${ref}/payments`, card(1000))).body.error, "price_not_set");
    assert.equal((await h.adminPost(`/v1/admin/bookings/${ref}/approve-price`, { amountMinor: 8000, currency: "EUR" })).status, 200);
    assert.equal((await h.adminPost(`/v1/admin/bookings/${ref}/approve-price`, { amountMinor: 9000, currency: "EUR" })).body.error, "price_already_set");
    await h.adminPost(`/v1/admin/bookings/${ref}/confirm`);
    const runId = await h.runOf(ref);
    await h.adminPost(`/v1/admin/shuttle-runs/${runId}/assign`, { carrierPayeeId: "sup-five" });
    await h.adminPost(`/v1/admin/bookings/${ref}/payments`, card(8000));
    await h.adminPost(`/v1/admin/shuttle-runs/${runId}/complete`);
    assert.equal(await h.balance("carrier", "sup-five"), 5600);
  });

  it("K4: a direct Alanya Group site booking writes NO automatic shares and goes to finance review", async () => {
    const r = await h.book({ siteId: "ag-brand-site", pickupAt: "2026-12-14T09:00" }, "k-direct");
    const ref = r.body.ref;
    await h.adminPost(`/v1/admin/bookings/${ref}/confirm`);
    const runId = await h.runOf(ref);
    await h.adminPost(`/v1/admin/shuttle-runs/${runId}/assign`, { carrierPayeeId: "sup-direct" });
    await h.adminPost(`/v1/admin/bookings/${ref}/payments`, card(5000));
    const done = await h.adminPost(`/v1/admin/shuttle-runs/${runId}/complete`);
    assert.equal(done.body.bookings[0].result, "split_policy_not_approved");
    assert.equal(await h.balance("carrier", "sup-direct"), 0);
    const outbox = (await h.get("/v1/admin/outbox")) as any[];
    assert.ok(outbox.some((e) => e.type === "finance.review_required" && e.payload.reason === "split_policy_not_approved"));
  });
});

describe("private / VIP — K12", () => {
  const h = harness();
  before(h.start);
  after(h.stop);

  it("Model B (NETWORK_PASS): 80 € → supplier 47,50 €, site 32,50 €, Alanya Group 0 €", async () => {
    const r = await h.book({ product: "private", routeCode: undefined, pickupAt: "2026-12-11T09:00" }, "k-pass");
    assert.deepEqual(r.body.price, { amountMinor: 8000, currency: "EUR" });
    const ref = r.body.ref;
    assert.equal((await h.adminPost(`/v1/admin/bookings/${ref}/complete`, { carrierPayeeId: "sup-P" })).status, 409, "confirm first");
    await h.adminPost(`/v1/admin/bookings/${ref}/confirm`);
    // Ön ödeme online, kalan araçta nakit.
    await h.adminPost(`/v1/admin/bookings/${ref}/payments`, card(2000));
    const done = await h.adminPost(`/v1/admin/bookings/${ref}/complete`, { carrierPayeeId: "sup-P" });
    assert.equal(done.body.result, "awaiting_payment");
    const rest = await h.adminPost(`/v1/admin/bookings/${ref}/payments`, cash(6000, "sup-P"));
    assert.equal(rest.body.finance, "shares_earned");
    assert.equal(await h.balance("carrier", "sup-P"), 4750);
    assert.equal(await h.balance("partner", "p-001"), 3250);
    assert.equal(await h.balance("platform", "central"), 0);
  });

  it("Model A (SELF_OPERATED): only with verified authority; no Alanya Group transaction commission", async () => {
    assert.throws(() =>
      parseSiteRecord({ id: "x-site", ownership: "partner", partnerId: "p", domains: ["x.example"], ownerEmail: "a@b.co", status: "live", privateMode: "self_operated" }),
    /selfOperationVerifiedAt/);
    const r = await h.book({ siteId: "self-op-site", product: "vip", routeCode: undefined, pickupAt: "2026-12-06T09:00" }, "k-self");
    assert.equal(r.body.next, "site_owner_will_send_quote");
    assert.equal(r.body.price, undefined);
    const outbox = (await h.get("/v1/admin/outbox")) as any[];
    assert.ok(outbox.some((e) => e.type === "private.request_received.notify_site_owner"));
    assert.ok(!JSON.stringify(outbox).includes("@example.com"), "outbox carries no PII");
  });
});

describe("K15 — payments, refunds and weekly closing", () => {
  const h = harness();
  before(h.start);
  after(h.stop);

  it("refund after shares reverses them once; cancellation flags the refund due", async () => {
    const r = await h.book({ pickupAt: "2026-11-05T10:00" }, "k-refund");
    const ref = r.body.ref;
    await h.adminPost(`/v1/admin/bookings/${ref}/confirm`);
    const runId = await h.runOf(ref);
    await h.adminPost(`/v1/admin/shuttle-runs/${runId}/assign`, { carrierPayeeId: "sup-R" });
    assert.equal((await h.adminPost(`/v1/admin/bookings/${ref}/payments`, cash(5000, "sup-OTHER"))).body.error, "cash_only_by_assigned_supplier");
    await h.adminPost(`/v1/admin/bookings/${ref}/payments`, card(5000));
    await h.adminPost(`/v1/admin/shuttle-runs/${runId}/complete`);
    assert.equal(await h.balance("carrier", "sup-R"), 3500);
    const refund = await h.adminPost(`/v1/admin/bookings/${ref}/payments`, { ...card(5000), kind: "refund" });
    assert.equal(refund.body.finance, "shares_reversed_review_required");
    assert.equal(await h.balance("carrier", "sup-R"), 0);
    assert.equal(await h.balance("partner", "p-001"), 0);

    const c = await h.book({ pickupAt: "2026-11-06T10:00" }, "k-cancel");
    await h.adminPost(`/v1/admin/bookings/${c.body.ref}/payments`, card(1500));
    const cancelled = await h.adminPost(`/v1/admin/bookings/${c.body.ref}/cancel`);
    assert.equal(cancelled.body.refundDueMinor, 1500);
  });

  it("closes a week only after it ends, only once, and never counts an item twice", async () => {
    const r = await h.book({ pickupAt: "2026-11-07T10:00", passengers: 1 }, "k-week");
    const ref = r.body.ref;
    await h.adminPost(`/v1/admin/bookings/${ref}/confirm`);
    const runId = await h.runOf(ref);
    await h.adminPost(`/v1/admin/shuttle-runs/${runId}/assign`, { carrierPayeeId: "sup-W" });
    await h.adminPost(`/v1/admin/bookings/${ref}/payments`, cash(3000, "sup-W"));
    await h.adminPost(`/v1/admin/shuttle-runs/${runId}/complete`);

    assert.equal((await h.adminPost("/v1/admin/settlements/close-week", { weekStart: "2026-11-02" })).body.error, "week_not_finished");
    h.setNow("2026-11-09T06:00:00Z");
    const closing = await h.adminPost("/v1/admin/settlements/close-week", { weekStart: "2026-11-02" });
    assert.equal(closing.status, 201);
    assert.equal(closing.body.payoutExecution, "disabled_pending_legal_review");
    const net = Object.fromEntries((closing.body.statements as any[]).map((s) => [`${s.party.kind}:${s.party.id}`, s.netMinor]));
    // 30 € nakit tedarikçide: payı 21 € → 9 € borçlu; site 6 €, Alanya Group 3 € alacaklı.
    assert.equal(net["carrier:sup-W"], -900);
    assert.equal(net["partner:p-001"], 600);
    const sum = (closing.body.statements as any[]).reduce((a, s) => a + s.netMinor, 0);
    assert.equal(sum + (closing.body.unallocatedMinor.EUR ?? 0), 0, "money is conserved");

    assert.equal((await h.adminPost("/v1/admin/settlements/close-week", { weekStart: "2026-11-02" })).body.error, "week_already_closed");
    h.setNow("2026-11-16T06:00:00Z");
    const next = await h.adminPost("/v1/admin/settlements/close-week", { weekStart: "2026-11-09" });
    assert.deepEqual(next.body.entryIds, [], "already closed ledger entries are not closed again");
    assert.deepEqual(next.body.paymentIds, []);
  });
});

describe("K8 — tariff versions", () => {
  it("a new tariff version does not change the price frozen on an existing booking", async () => {
    const store = new MemoryStore();
    const make = (totals: number[], id: string) =>
      new BookingService({
        store,
        sites,
        shuttleTariff: parseShuttleTariff({
          id,
          approval: "approved",
          publishedAt: "2026-01-01",
          currency: "EUR",
          routes: ["AYT-ALN"],
          validFrom: "2026-01-01",
          maxPassengers: 10,
          totalsMinor: totals,
        }),
        splitPolicies: { partnerSourced: SHUTTLE_SPLIT_V1, direct: SHUTTLE_DIRECT_SPLIT_PROPOSED },
        passPolicy: PASS_POLICY_DECK_V3,
        pool: { slotMinutes: 60, vehicleCapacity: 10 },
        devOrigins: [],
        clock: () => new Date("2026-11-03T10:00:00Z"),
        random: { id: () => `${id}-${Math.random()}`, index: (m) => Math.floor(Math.random() * m), token: () => `${id}-tok` },
        verifyHuman: async () => true,
      });
    const v1 = make([3000, 5000, 6000, 7000], "v1");
    const created = await v1.submit({
      raw: {
        siteId: "partner-site",
        product: "shuttle",
        routeCode: "AYT-ALN",
        pickup: "AYT",
        dropoff: "Alanya",
        pickupAt: "2026-12-20T10:00",
        passengers: 2,
        customer: { name: "V", email: "v@example.com", phone: "+90 538 000 0000", locale: "en" },
        consent: true,
      },
      origin: ORIGIN["partner-site"],
      ip: "127.0.0.1",
      idempotencyKey: "k-version-0000001",
    });
    assert.ok(created.ok);
    const ref = (created.body as any).ref as string;
    const v2 = make([3500, 5500, 6500, 7500], "v2");
    const listed = (await v2.listBookings()).body as any[];
    assert.deepEqual(listed.find((b) => b.ref === ref).price, { amountMinor: 5000, currency: "EUR", mode: "FIXED_SHUTTLE" });
  });
});

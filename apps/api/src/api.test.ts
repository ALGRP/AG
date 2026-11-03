import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { SHUTTLE_SPLIT_V1, parseShuttleTariff, parseSiteRecord, type SiteRecord } from "@ag/core";
import { createApiServer } from "./http.ts";
import { BookingService, type Actor } from "./service.ts";
import { localHumanToken, verifyLocalHuman } from "./human.ts";
import { MemoryStore } from "./store.ts";

const sites = new Map<string, SiteRecord>(
  [
    {
      id: "partner-site",
      ownership: "partner",
      partnerId: "p-001",
      domains: ["www.partner.example"],
      ownerEmail: "owner@partner.example",
      status: "live",
      salePrices: { private: 8000, vip: 12000 },
      saleCurrency: "EUR",
      collectionMethods: ["cash", "card_pos", "bank_transfer"],
    },
    {
      // Kendi aracıyla çalışan, yetkisi doğrulanmış site
      id: "self-op-site",
      ownership: "partner",
      partnerId: "p-002",
      domains: ["www.selfop.example"],
      ownerEmail: "owner@selfop.example",
      status: "live",
      selfOperationVerifiedAt: "2026-11-01T00:00:00Z",
      collectionMethods: ["cash"],
    },
    {
      // alanyagroup.com
      id: "alanyagroup-com",
      ownership: "ag_brand",
      domains: ["www.alanyagroup.example"],
      ownerEmail: "ops@alanyagroup.example",
      status: "live",
      collectionMethods: ["card_pos"],
    },
  ].map((raw) => {
    const s = parseSiteRecord(raw);
    return [s.id, s];
  }),
);
const ORIGIN: Record<string, string> = {
  "partner-site": "https://www.partner.example",
  "self-op-site": "https://www.selfop.example",
  "alanyagroup-com": "https://www.alanyagroup.example",
};
const admin = { authorization: "Bearer admin-secret-for-tests" };
const W45 = "2026-W45";
/** 2FA'lı yetkili — kimlik sağlayıcı (SEL-332) gelince HTTP'den gelecek kimliği temsil eder; testte servise doğrudan verilir. */
const MANAGER: Actor = { id: "test-finance-manager", role: "finance_manager", mfa: true };
let slip = 0;


function harness(startAt = "2026-11-02T08:00:00Z") {
  let seq = 0;
  let now = new Date(startAt);
  const service = new BookingService({
    store: new MemoryStore(),
    sites,
    shuttleTariff: parseShuttleTariff({
      id: "t1",
      approval: "approved",
      publishedAt: "2026-01-01",
      currency: "EUR",
      routes: ["AYT-ALN", "ALN-AYT"],
      routeInfo: { "AYT-ALN": { active: true, coverage: "AYT-ALN" }, "ALN-AYT": { active: true, coverage: "ALN-AYT" } },
      manualPriceBounds: { "AYT-ALN": { minMinor: 8000, maxMinor: 14000, status: "approved" } },
      validFrom: "2026-01-01",
      maxPassengers: 10,
      totalsMinor: [3000, 5000, 6000, 7000],
    }),
    shuttlePolicy: SHUTTLE_SPLIT_V1,
    pool: { slotMinutes: 60, vehicleCapacity: 10 },
    devOrigins: [],
    clock: () => now,
    random: { id: () => `id-${++seq}`, index: (m) => (seq++ * 7) % m, token: () => `tok-${++seq}` },
    verifyHuman: (token) => verifyLocalHuman(token),
  });
  const server = createApiServer({ service, sites, devOrigins: [], adminToken: "admin-secret-for-tests", publicRateLimitPerMinute: 1000 });
  const h = {
    base: "",
    service,
    setNow(iso: string) {
      now = new Date(iso);
    },
    async post(path: string, body: unknown, headers: Record<string, string> = {}) {
      const r = await fetch(h.base + path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
      return { status: r.status, body: (await r.json()) as Record<string, any> };
    },
    async get(path: string) {
      return (await fetch(h.base + path, { headers: admin }).then((x) => x.json())) as any;
    },
    adminPost: (path: string, body: unknown = {}) => {
      // Tahsilat kaydı kanıt referansı ister; testlerde verilmemişse tekil bir slip numarası eklenir.
      const b = path.endsWith("/collection") && typeof body === "object" && body !== null && !("reference" in body) ? { ...body, reference: `SLIP-${++slip}` } : body;
      return h.post(path, b, admin);
    },
    async book(over: Record<string, unknown>, key: string) {
      const body = {
        siteId: "partner-site",
        product: "shuttle",
        routeCode: "AYT-ALN",
        pickup: "Antalya Airport (AYT)",
        dropoff: "Alanya",
        pickupAt: "2026-11-04T13:20",
        passengers: 2,
        customer: { name: "Guest", email: `${key}@example.com`, phone: "+49 151 0000000", locale: "de" },
        consent: true,
        ...over,
        humanToken: over.humanToken ?? localHumanToken(
          new URL(ORIGIN[(over.siteId as string) ?? "partner-site"]!).hostname,
          `apiBooking${key.replace(/[^A-Za-z0-9_-]/g, "").padEnd(12, "_")}`,
        ),
      };
      return h.post("/v1/public/bookings", body, { origin: ORIGIN[body.siteId as string]!, "idempotency-key": key.padEnd(16, "0") });
    },
    async runOf(ref: string) {
      return ((await h.get("/v1/admin/bookings")) as any[]).find((b) => b.ref === ref).shuttleRunId as string;
    },
    /** Shuttle: onay → sefere tedarikçi → tahsilat → tamamlama. */
    async shuttleJob(over: Record<string, unknown>, key: string, supplierId: string, collect: { method: string; amountMinor?: number } | null) {
      const r = await h.book(over, key);
      assert.equal(r.status, 201, JSON.stringify(r.body));
      const ref = r.body.ref as string;
      assert.equal((await h.adminPost(`/v1/admin/bookings/${ref}/confirm`)).status, 200);
      const run = await h.runOf(ref);
      const a = await h.adminPost(`/v1/admin/shuttle-runs/${run}/assign`, { supplierId });
      assert.equal(a.status, 200, JSON.stringify(a.body));
      if (collect) {
        const c = await h.adminPost(`/v1/admin/bookings/${ref}/collection`, {
          method: collect.method,
          collector: "supplier",
          amountMinor: collect.amountMinor ?? r.body.price.amountMinor,
        });
        assert.equal(c.status, 200, JSON.stringify(c.body));
      }
      assert.equal((await h.adminPost(`/v1/admin/shuttle-runs/${run}/complete`)).status, 200);
      return ref;
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

describe("public intake", () => {
  const h = harness();
  before(h.start);
  after(h.stop);

  it("rejects a missing idempotency key and an unregistered origin", async () => {
    assert.equal((await h.post("/v1/public/bookings", {}, { origin: ORIGIN["partner-site"]! })).status, 400);
    const r = await h.post(
      "/v1/public/bookings",
      { siteId: "partner-site", product: "shuttle", routeCode: "AYT-ALN", pickup: "AYT", dropoff: "Alanya", pickupAt: "2026-12-05T13:20", passengers: 2, customer: { name: "G", email: "g@example.com", phone: "+49 151 0000000", locale: "de" }, consent: true },
      { origin: "https://www.alanyagroup.example", "idempotency-key": "k-origin-mismatch-0001" },
    );
    assert.deepEqual([r.status, r.body.error], [403, "origin_not_allowed"]);
  });

  it("prices shuttle on the server, ignores client prices, and is idempotent", async () => {
    const first = await h.book({ price: 1 }, "k-idem");
    assert.deepEqual(first.body.price, { amountMinor: 5000, currency: "EUR" });
    assert.equal(first.body.status, "request");
    assert.equal((await h.book({ price: 1 }, "k-idem")).body.ref, first.body.ref);
    assert.equal((await h.book({ passengers: 3 }, "k-idem")).status, 409);
  });

  it("refuses a payment method the site does not allow", async () => {
    const r = await h.book({ siteId: "alanyagroup-com", paymentMethod: "cash" }, "k-paymeth");
    assert.equal(r.body.error, "payment_method_not_allowed_for_site");
  });

  it("lets the customer look up a booking only with its token; admin needs the token", async () => {
    const created = await h.book({ pickupAt: "2026-12-07T10:00" }, "k-lookup");
    assert.equal((await fetch(`${h.base}/v1/public/bookings/${created.body.ref}`, { headers: { "x-lookup-token": created.body.lookupToken } })).status, 200);
    assert.equal((await fetch(`${h.base}/v1/public/bookings/${created.body.ref}`, { headers: { "x-lookup-token": "nope" } })).status, 404);
    assert.equal((await fetch(h.base + "/v1/admin/bookings")).status, 401);
  });
});

describe("K15 — supplier collection and the 20 / 10 / 70 split", () => {
  const h = harness();
  before(h.start);
  after(h.stop);

  it("Owner sample bookings: each booking carries its own site and AGOS receivables", async () => {
    const expected: Array<[number, number, number, number]> = [
      [1, 600, 300, 2100],
      [2, 1000, 500, 3500],
      [3, 1200, 600, 4200],
      [4, 1400, 700, 4900],
    ];
    for (const [pax, site, agos, supplier] of expected) {
      const ref = await h.shuttleJob({ passengers: pax, pickupAt: `2026-11-03T1${pax}:00` }, `k-owner-${pax}`, "sup-a", { method: "cash" });
      const s = ((await h.get("/v1/admin/bookings")) as any[]).find((b) => b.ref === ref).settlement;
      assert.deepEqual(
        [s.site_commission_amount, s.agos_fee_amount, s.supplier_entitlement, s.supplier_payment_to_site, s.supplier_payment_to_agos],
        [site, agos, supplier, site, agos],
      );
      assert.deepEqual([s.collector, s.collection_status, s.selling_party_id, s.supplier_id], ["supplier", "collected", "p-001", "sup-a"]);
    }
  });

  it("alanyagroup.com is a sales channel under the same rule", async () => {
    const ref = await h.shuttleJob({ siteId: "alanyagroup-com", pickupAt: "2026-11-04T09:00" }, "k-agcom", "sup-a", { method: "card_pos" });
    const s = ((await h.get("/v1/admin/bookings")) as any[]).find((b) => b.ref === ref).settlement;
    assert.deepEqual([s.selling_party_id, s.site_commission_amount, s.agos_fee_amount, s.supplier_entitlement], ["alanya-group", 1000, 500, 3500]);
  });

  it("a site using its own (verified) vehicle keeps 90 % and pays AGOS 10 %; unverified self-supply is refused", async () => {
    const ref = await h.shuttleJob({ siteId: "self-op-site", pickupAt: "2026-11-05T09:00" }, "k-self", "p-002", { method: "cash" });
    const s = ((await h.get("/v1/admin/bookings")) as any[]).find((b) => b.ref === ref).settlement;
    assert.deepEqual([s.self_supplied, s.site_commission_amount, s.agos_fee_amount, s.supplier_entitlement], [true, 0, 500, 4500]);

    const r = await h.book({ pickupAt: "2026-11-05T15:00" }, "k-unverified");
    await h.adminPost(`/v1/admin/bookings/${r.body.ref}/confirm`);
    const a = await h.adminPost(`/v1/admin/shuttle-runs/${await h.runOf(r.body.ref)}/assign`, { supplierId: "p-001" });
    assert.deepEqual([a.status, a.body.error], [409, "self_operation_not_verified"]);
  });

  it("collection rules: supplier only, allowed method only, each slip once; partial collections allowed", async () => {
    const r = await h.book({ siteId: "alanyagroup-com", pickupAt: "2026-11-06T09:00" }, "k-rules");
    const ref = r.body.ref;
    assert.equal((await h.adminPost(`/v1/admin/bookings/${ref}/collection`, { method: "card_pos", collector: "supplier", amountMinor: 5000 })).body.error, "supplier_not_assigned");
    await h.adminPost(`/v1/admin/bookings/${ref}/confirm`);
    await h.adminPost(`/v1/admin/shuttle-runs/${await h.runOf(ref)}/assign`, { supplierId: "sup-b" });
    const tries: Array<[Record<string, unknown>, string]> = [
      [{ method: "card_pos", collector: "site", amountMinor: 5000 }, "shuttle_collection_is_by_supplier"],
      [{ method: "cash", collector: "supplier", amountMinor: 5000 }, "method_not_allowed_for_booking"],
      [{ method: "card_pos", collector: "supplier", amountMinor: 3000 }, ""],
    ];
    for (const [body, err] of tries.slice(0, 2)) assert.equal((await h.adminPost(`/v1/admin/bookings/${ref}/collection`, body)).body.error, err);
    const first = await h.adminPost(`/v1/admin/bookings/${ref}/collection`, { method: "card_pos", collector: "supplier", amountMinor: 3000, reference: "POS-1" });
    assert.equal(first.body.settlement.collection_status, "short_collected");
    assert.equal(
      (await h.adminPost(`/v1/admin/bookings/${ref}/collection`, { method: "card_pos", collector: "supplier", amountMinor: 3000, reference: "POS-1" })).body.error,
      "reference_already_recorded",
      "the same slip is never recorded twice",
    );
    const second = await h.adminPost(`/v1/admin/bookings/${ref}/collection`, { method: "card_pos", collector: "supplier", amountMinor: 2000, reference: "POS-2" });
    assert.deepEqual([second.body.settlement.collection_status, second.body.settlement.collected_amount], ["collected", 5000]);
    assert.equal((await h.post(`/v1/admin/bookings/${ref}/collection`, { method: "card_pos", collector: "supplier", amountMinor: 3000 }, admin)).body.error, "reference_required");
  });

  it("K17: 5+ price needs 2FA, a reason and the route's approved bounds; the approver is recorded", async () => {
    const r = await h.book({ passengers: 5, pickupAt: "2026-11-06T12:00" }, "k-five");
    assert.equal(r.body.next, "price_requires_approval");
    const ref = r.body.ref;
    const row = ((await h.get("/v1/admin/bookings")) as any[]).find((b) => b.ref === ref);
    assert.equal(row.settlement, null, "no supplier entitlement before the price is fixed");
    assert.equal((await h.adminPost(`/v1/admin/bookings/${ref}/confirm`)).body.error, "price_requires_approval");
    // HTTP'deki geçici anahtar 2FA taşımaz → kapalı
    assert.equal((await h.adminPost(`/v1/admin/bookings/${ref}/approve-price`, { amountMinor: 9000, currency: "EUR", reason: "6 kişi Sprinter" })).body.error, "mfa_required");
    const noMfa = await h.service.approveShuttlePrice({ ...MANAGER, mfa: false }, ref, { amountMinor: 9000, currency: "EUR", reason: "6 kişi Sprinter" });
    assert.equal((noMfa.body as any).error, "mfa_required");
    const operator = await h.service.approveShuttlePrice({ id: "op", role: "operator", mfa: true }, ref, { amountMinor: 9000, currency: "EUR", reason: "6 kişi Sprinter" });
    assert.equal((operator.body as any).error, "role_not_allowed");
    for (const [amountMinor, err] of [[1, "below_min"], [14001, "above_max"]] as const) {
      assert.equal(((await h.service.approveShuttlePrice(MANAGER, ref, { amountMinor, currency: "EUR", reason: "deneme gerekçe" })).body as any).error, err);
    }
    assert.equal(((await h.service.approveShuttlePrice(MANAGER, ref, { amountMinor: 9000, currency: "EUR" })).body as any).error, "reason_required");
    const okR = await h.service.approveShuttlePrice(MANAGER, ref, { amountMinor: 9000, currency: "EUR", reason: "6 kişi, tek Sprinter" });
    assert.equal(okR.status, 200);
    const approved = ((await h.get("/v1/admin/bookings")) as any[]).find((b) => b.ref === ref).priceApproval;
    assert.deepEqual([approved.actorId, approved.actorRole, approved.oldPriceMinor, approved.newPriceMinor, approved.reason], [MANAGER.id, "finance_manager", null, 9000, "6 kişi, tek Sprinter"]);
    assert.equal((await h.adminPost(`/v1/admin/bookings/${ref}/confirm`)).status, 200);
  });

  it("K17: a route without approved bounds accepts no manual price", async () => {
    const r = await h.book({ passengers: 6, routeCode: "ALN-AYT", pickupAt: "2026-11-06T15:00" }, "k-nobounds");
    assert.equal(((await h.service.approveShuttlePrice(MANAGER, r.body.ref, { amountMinor: 9000, currency: "EUR", reason: "deneme gerekçe" })).body as any).error, "no_bounds_for_route");
  });
});

describe("Private / VIP — site sets the supplier entitlement, no AGOS fee", () => {
  const h = harness();
  before(h.start);
  after(h.stop);

  it("pass to a supplier: customer pays supplier, supplier passes the difference to the site", async () => {
    const r = await h.book({ product: "private", routeCode: undefined, pickupAt: "2026-11-04T09:00" }, "k-priv");
    const ref = r.body.ref;
    assert.deepEqual(r.body.price, { amountMinor: 8000, currency: "EUR" });
    assert.equal((await h.adminPost(`/v1/admin/bookings/${ref}/assign`, { mode: "pool" })).status, 501);
    assert.equal((await h.adminPost(`/v1/admin/bookings/${ref}/assign`, { mode: "pass", supplierId: "sup-p", supplierEntitlementMinor: 9000 })).body.error, "supplierEntitlementMinor_invalid");
    assert.equal((await h.adminPost(`/v1/admin/bookings/${ref}/assign`, { mode: "self" })).body.error, "self_operation_not_verified");
    assert.equal((await h.adminPost(`/v1/admin/bookings/${ref}/assign`, { mode: "pass", supplierId: "sup-p", supplierEntitlementMinor: 4750 })).status, 200);
    await h.adminPost(`/v1/admin/bookings/${ref}/confirm`);
    await h.adminPost(`/v1/admin/bookings/${ref}/collection`, { method: "cash", collector: "supplier", amountMinor: 8000 });
    const done = await h.adminPost(`/v1/admin/bookings/${ref}/complete`);
    assert.equal(done.status, 200, JSON.stringify(done.body));
    const s = done.body.settlement;
    assert.deepEqual(
      [s.site_commission_amount, s.agos_fee_amount, s.supplier_entitlement, s.supplier_payment_to_site, s.supplier_payment_to_agos],
      [3250, 0, 4750, 3250, 0],
    );
  });

  it("customer pays the site: the site owes the supplier its entitlement", async () => {
    const r = await h.book({ product: "vip", routeCode: undefined, pickupAt: "2026-11-04T11:00" }, "k-vip");
    const ref = r.body.ref;
    await h.adminPost(`/v1/admin/bookings/${ref}/assign`, { mode: "pass", supplierId: "sup-v", supplierEntitlementMinor: 6000 });
    await h.adminPost(`/v1/admin/bookings/${ref}/confirm`);
    const c = await h.adminPost(`/v1/admin/bookings/${ref}/collection`, { method: "bank_transfer", collector: "site", amountMinor: 12000 });
    assert.deepEqual([c.body.settlement.site_payment_to_supplier, c.body.settlement.supplier_payment_to_site], [6000, 0]);
  });
});

describe("K15 — weekly closing, receipts, exceptions and corrections", () => {
  const h = harness();
  before(h.start);
  after(h.stop);
  let paidRef = "";

  let shortRef = "";
  it("prepares a week with normal, partial, uncollected, overcollected, disputed and cancelled jobs", async () => {
    paidRef = await h.shuttleJob({ pickupAt: "2026-11-03T10:00" }, "k-w-paid", "sup-w", { method: "cash" }); // 50 €
    await h.shuttleJob({ siteId: "alanyagroup-com", passengers: 4, pickupAt: "2026-11-03T11:00" }, "k-w-ag", "sup-w", { method: "card_pos" }); // 70 €
    shortRef = await h.shuttleJob({ pickupAt: "2026-11-04T10:00" }, "k-w-short", "sup-w", { method: "cash", amountMinor: 3000 }); // 30 / 50 €
    await h.shuttleJob({ pickupAt: "2026-11-04T11:00" }, "k-w-none", "sup-w", null); // tahsilat yok
    await h.shuttleJob({ passengers: 1, pickupAt: "2026-11-04T15:00" }, "k-w-over", "sup-w", { method: "cash", amountMinor: 3500 }); // 35 / 30 €
    const disputed = await h.shuttleJob({ pickupAt: "2026-11-04T12:00" }, "k-w-dispute", "sup-w", { method: "cash" });
    assert.equal((await h.adminPost(`/v1/admin/bookings/${disputed}/dispute`, { reason: "customer no-show" })).status, 200);
    const cancelled = await h.book({ pickupAt: "2026-11-05T10:00" }, "k-w-cancel");
    await h.adminPost(`/v1/admin/bookings/${cancelled.body.ref}/cancel`);
  });

  it("refuses to close before Sunday 23:59 Istanbul; then closes once; commission only on collected money", async () => {
    h.setNow("2026-11-08T20:59:00Z");
    assert.equal((await h.adminPost(`/v1/admin/settlements/${W45}/close`)).body.error, "week_not_finished");
    h.setNow("2026-11-09T06:00:00Z");
    const c = await h.adminPost(`/v1/admin/settlements/${W45}/close`);
    assert.equal(c.status, 201, JSON.stringify(c.body));
    // 50 + 70 + 30 (kısmi) + 30 (fazla tahsilat sınırlı) = 180 € hesaplanır
    assert.equal((c.body.entries as any[]).reduce((s, e) => s + e.collected_delta, 0), 18000);
    assert.deepEqual((c.body.exceptions as any[]).map((e) => [e.reason, e.customer_refund_due]).sort(), [
      ["cancelled", 0],
      ["disputed", 0],
      ["overcollected", 500],
    ]);
    assert.deepEqual((c.body.customer_balances as any[]).map((b) => b.remaining).sort(), [2000, 5000], "20 € and 50 € still owed by customers");
    const st = (c.body.supplier_statements as any[]).find((s) => s.supplier_id === "sup-w");
    // site: 10 + 14 + 6 + 6 = 36 €, AGOS: 5 + 7 + 3 + 3 = 18 €
    assert.deepEqual([st.collected, st.owes_agos, st.total_owed], [18000, 1800, 5400]);
    assert.equal(c.body.payout_execution, "disabled_owner_go_required");
    assert.equal((await h.adminPost(`/v1/admin/settlements/${W45}/close`)).body.error, "week_already_closed");
  });

  it("matches bank receipts, rejects a duplicate receipt, and reports what is still owed after Tuesday 18:00", async () => {
    const receipt = (payeeId: string, amountMinor: number, bankReference: string) =>
      h.adminPost("/v1/admin/receipts", { weekId: W45, payerId: "sup-w", payeeId, amountMinor, currency: "EUR", bankReference, paidAt: "2026-11-10T08:00:00Z" });
    assert.equal((await receipt("p-001", 2200, "TR-0001")).status, 201);
    assert.equal((await receipt("agos", 1800, "TR-0002")).status, 201);
    assert.equal((await receipt("agos", 1800, "TR-0002")).body.error, "duplicate_bank_reference");
    h.setNow("2026-11-10T16:00:00Z"); // Salı 19:00 İstanbul
    const r = await h.get(`/v1/admin/settlements/${W45}`);
    assert.equal(r.closed, true);
    const ob = (c: string) => (r.obligations as any[]).find((o) => o.creditor_id === c);
    assert.deepEqual([ob("p-001").status, ob("agos").status, ob("alanya-group").status, ob("alanya-group").late], ["paid", "paid", "unpaid", true]);
    assert.ok((r.debts_and_disputes as any[]).some((d) => d.kind === "late_payment" && d.creditor_id === "alanya-group" && d.amount === 1400));
  });

  it("next week: the remaining 20 € earns +4 / +2 / +14; a refund recalculates the closed booking; W45 is unchanged", async () => {
    h.setNow("2026-11-11T09:00:00Z"); // W46
    await h.adminPost(`/v1/admin/bookings/${shortRef}/collection`, { method: "cash", collector: "supplier", amountMinor: 2000 });
    const refund = await h.adminPost(`/v1/admin/bookings/${paidRef}/refund`, { amountMinor: 5000, refundReference: "IADE-0001" });
    assert.equal(refund.status, 200, JSON.stringify(refund.body));
    assert.equal((await h.adminPost(`/v1/admin/bookings/${paidRef}/refund`, { amountMinor: 5000, refundReference: "IADE-0001" })).body.error, "refund_reference_already_used");
    const w46 = await h.get("/v1/admin/settlements/2026-W46");
    const byRef = (ref: string) => (w46.entries as any[]).find((e) => e.booking_ref === ref);
    assert.deepEqual([byRef(shortRef).collected_delta, byRef(shortRef).site_delta, byRef(shortRef).agos_delta, byRef(shortRef).supplier_delta], [2000, 400, 200, 1400]);
    assert.deepEqual([byRef(paidRef).kind, byRef(paidRef).site_delta, byRef(paidRef).agos_delta], ["refund_correction", -1000, -500]);
    const w45 = await h.get(`/v1/admin/settlements/${W45}`);
    assert.equal((w45.site_receivables as any[]).find((s) => s.site_party_id === "p-001").total, 2200, "old week unchanged");
  });

  it("T3: statement dispute with a record number; decision needs 2FA; accepted difference goes to the next open week", async () => {
    assert.equal((await h.adminPost(`/v1/admin/settlements/${W45}/statement-sent`, { partyId: "p-001" })).status, 201);
    h.setNow("2026-11-20T09:00:00Z"); // 9 gün sonra: süre dışı
    const raised = await h.adminPost(`/v1/admin/settlements/${W45}/disputes`, { raisedBy: "p-001", reason: "AG-tahsilat farkı hesap hatası iddiası", category: "calculation_error" });
    assert.equal(raised.status, 201);
    assert.match(raised.body.id, /^ITZ-2026-W45-\d{4}$/);
    const live = await h.get(`/v1/admin/settlements/${W45}`);
    const d = (live.statement_disputes as any[])[0];
    assert.deepEqual([d.timing.within_window, d.timing.reviewable], [false, true], "late but never auto-rejected (calculation error)");
    assert.equal((await h.adminPost(`/v1/admin/settlements/disputes/${raised.body.id}/decide`, { decision: "accepted", reason: "dekont karşılaştırıldı" })).body.error, "mfa_required");
    const decided = await h.service.decideStatementDispute(MANAGER, raised.body.id, {
      decision: "accepted",
      reason: "Dekont karşılaştırıldı; 1 € fark site lehine",
      adjustment: { debtorId: "sup-w", creditorId: "p-001", amountMinor: 100 },
    });
    assert.equal(decided.status, 200);
    assert.deepEqual([(decided.body as any).decided_by, (decided.body as any).status], [MANAGER.id, "accepted"]);
    const w46 = await h.get("/v1/admin/settlements/2026-W46");
    assert.ok((w46.adjustments as any[]).some((a) => a.kind === "dispute_decision" && a.amount === 100 && a.original_week_id === W45));
  });

  it("T1: an offset to a later week needs a written approval reference and 2FA", async () => {
    const body = { fromWeekId: W45, debtorId: "agos", creditorId: "sup-w", amountMinor: 100, reason: "fazla ödeme mahsubu" };
    assert.equal((await h.service.createOffset(MANAGER, body)).status, 422);
    assert.equal((await h.adminPost("/v1/admin/settlements/offsets", { ...body, writtenApprovalReference: "ONAY-1" })).body.error, "mfa_required");
    const off = await h.service.createOffset(MANAGER, { ...body, writtenApprovalReference: "ONAY-2026-11-20-01" });
    assert.equal(off.status, 201);
    assert.equal((off.body as any).written_approval_reference, "ONAY-2026-11-20-01");
  });
});

describe("QA regressions (API level)", () => {
  const h = harness();
  before(h.start);
  after(h.stop);

  it("QA 4: completing a run with a not-yet-priced 5+ booking keeps the run open for it", async () => {
    const small = await h.book({ pickupAt: "2026-11-03T10:00" }, "k-qa4-small");
    const big = await h.book({ passengers: 6, pickupAt: "2026-11-03T10:10" }, "k-qa4-big");
    await h.adminPost(`/v1/admin/bookings/${small.body.ref}/confirm`);
    const run = await h.runOf(small.body.ref);
    assert.equal(await h.runOf(big.body.ref), run);
    await h.adminPost(`/v1/admin/shuttle-runs/${run}/assign`, { supplierId: "sup-q" });
    const first = await h.adminPost(`/v1/admin/shuttle-runs/${run}/complete`);
    assert.equal(first.body.status, "assigned");
    assert.equal((await h.service.approveShuttlePrice(MANAGER, big.body.ref, { amountMinor: 9000, currency: "EUR", reason: "6 kişi Sprinter" })).status, 200);
    await h.adminPost(`/v1/admin/bookings/${big.body.ref}/confirm`);
    const second = await h.adminPost(`/v1/admin/shuttle-runs/${run}/complete`);
    assert.deepEqual([second.body.status, second.body.bookings.map((b: any) => b.result)], ["completed", ["completed"]]);
  });

  it("QA 1: a collection entered after the week closed is settled in the next week", async () => {
    const ref = await h.shuttleJob({ pickupAt: "2026-11-08T21:00" }, "k-qa1", "sup-q", null);
    h.setNow("2026-11-09T05:00:00Z");
    const w45 = await h.adminPost(`/v1/admin/settlements/${W45}/close`);
    assert.ok((w45.body.customer_balances as any[]).some((b) => b.booking_ref === ref && b.remaining === 5000));
    await h.adminPost(`/v1/admin/bookings/${ref}/collection`, { method: "cash", collector: "supplier", amountMinor: 5000 });
    h.setNow("2026-11-23T05:00:00Z");
    assert.equal((await h.adminPost("/v1/admin/settlements/2026-W47/close")).body.error, "close_weeks_in_order:2026-W46");
    const w46 = await h.adminPost("/v1/admin/settlements/2026-W46/close");
    assert.ok((w46.body.entries as any[]).some((l) => l.booking_ref === ref && l.collected_delta === 5000));
  });

  it("QA 2: a flagged duplicate that is real is visible, and settles once reviewed", async () => {
    const same = { pickupAt: "2026-11-24T09:00", customer: { name: "Same", email: "same@example.com", phone: "+49 151 1111111", locale: "de" } };
    const a = await h.book(same, "k-qa2-a");
    const b = await h.book(same, "k-qa2-b"); // aynı müşteri, aynı iş → mükerrer şüphesi
    await h.adminPost(`/v1/admin/bookings/${a.body.ref}/cancel`);
    h.setNow("2026-11-24T12:00:00Z");
    await h.adminPost(`/v1/admin/bookings/${b.body.ref}/confirm`);
    const run = await h.runOf(b.body.ref);
    await h.adminPost(`/v1/admin/shuttle-runs/${run}/assign`, { supplierId: "sup-q" });
    await h.adminPost(`/v1/admin/bookings/${b.body.ref}/collection`, { method: "cash", collector: "supplier", amountMinor: 5000 });
    await h.adminPost(`/v1/admin/shuttle-runs/${run}/complete`);
    const live = await h.get("/v1/admin/settlements/2026-W48");
    assert.ok((live.exceptions as any[]).some((e) => e.booking_ref === b.body.ref && e.reason === "suspected_duplicate"));
    // This previously expected 200 from the static admin token: that was the insecure behavior.
    assert.equal((await h.adminPost(`/v1/admin/bookings/${b.body.ref}/clear-duplicate`, { reason: "Cift kayit dogrulandi" })).status, 403);
    const managerReview = await h.service.clearDuplicate(MANAGER, b.body.ref, { reason: "Iki kayit ayri transferdir" });
    assert.equal(managerReview.status, 200);
    const managerAudit = (managerReview.body as { duplicateClearAudit: { actorId: string; actorRole: string; mfaVerified: boolean } }).duplicateClearAudit;
    assert.deepEqual([managerAudit.actorId, managerAudit.actorRole, managerAudit.mfaVerified],
      [MANAGER.id, MANAGER.role, true]);
    const after = await h.get("/v1/admin/settlements/2026-W48");
    assert.ok((after.entries as any[]).some((l) => l.booking_ref === b.body.ref));
  });

  it("QA 10 + data: upper-case supplier ids are refused; dispute notes drop e-mail and phone numbers", async () => {
    const r = await h.book({ pickupAt: "2026-11-25T09:00" }, "k-qaten");
    assert.equal(r.status, 201, JSON.stringify(r.body));
    await h.adminPost(`/v1/admin/bookings/${r.body.ref}/confirm`);
    assert.equal((await h.adminPost(`/v1/admin/shuttle-runs/${await h.runOf(r.body.ref)}/assign`, { supplierId: "P-001" })).body.error, "supplierId_invalid");
    const d = await h.adminPost(`/v1/admin/bookings/${r.body.ref}/dispute`, { reason: "Müşteri jane@example.com, +49 151 2345678 aradı" });
    assert.equal(d.body.settlement, null);
    const row = ((await h.get("/v1/admin/bookings")) as any[]).find((b) => b.ref === r.body.ref);
    assert.ok(row);
    const stored = JSON.stringify(await h.get("/v1/admin/settlements/2026-W48"));
    assert.ok(!stored.includes("jane@example.com") && !stored.includes("2345678"));
    // The static token must never resolve a booking dispute without verified MFA.
    assert.equal((await h.adminPost(`/v1/admin/bookings/${r.body.ref}/resolve-dispute`, { outcome: "rejected", reason: "Itiraz incelendi" })).status, 403);
    const reviewed = await h.service.resolveDispute(MANAGER, r.body.ref, { outcome: "rejected", reason: "Gerekceli incelemede itiraz reddedildi" });
    assert.equal(reviewed.status, 200);
    const disputeAudit = (reviewed.body as { disputeResolutionAudit: { actorId: string; actorRole: string; mfaVerified: boolean } }).disputeResolutionAudit;
    assert.deepEqual([disputeAudit.actorId, disputeAudit.actorRole, disputeAudit.mfaVerified],
      [MANAGER.id, MANAGER.role, true]);
  });
});

describe("K8 — tariff versions", () => {
  it("a new tariff version does not change the price frozen on an existing booking", async () => {
    const store = new MemoryStore();
    const make = (totals: number[], id: string) =>
      new BookingService({
        store,
        sites,
        shuttleTariff: parseShuttleTariff({ id, approval: "approved", publishedAt: "2026-01-01", currency: "EUR", routes: ["AYT-ALN"], routeInfo: { "AYT-ALN": { active: true, coverage: "AYT-ALN" } }, validFrom: "2026-01-01", maxPassengers: 10, totalsMinor: totals }),
        shuttlePolicy: SHUTTLE_SPLIT_V1,
        pool: { slotMinutes: 60, vehicleCapacity: 10 },
        devOrigins: [],
        clock: () => new Date("2026-11-03T10:00:00Z"),
        random: { id: () => `${id}-${Math.random()}`, index: (m) => Math.floor(Math.random() * m), token: () => `${id}-tok` },
        verifyHuman: (token) => verifyLocalHuman(token),
      });
    const created = await make([3000, 5000, 6000, 7000], "v1").submit({
      raw: { siteId: "partner-site", product: "shuttle", routeCode: "AYT-ALN", pickup: "AYT", dropoff: "Alanya", pickupAt: "2026-12-20T10:00", passengers: 2, customer: { name: "V", email: "v@example.com", phone: "+90 538 000 0000", locale: "en" }, consent: true, humanToken: localHumanToken("www.partner.example", "freezeCase0001") },
      origin: ORIGIN["partner-site"],
      ip: "127.0.0.1",
      idempotencyKey: "k-version-0000001",
    });
    assert.ok(created.ok);
    const ref = (created.body as any).ref as string;
    const listed = (await make([3500, 5500, 6500, 7500], "v2").listBookings()).body as any[];
    assert.deepEqual(listed.find((b) => b.ref === ref).price, { amountMinor: 5000, currency: "EUR", mode: "FIXED_SHUTTLE" });
  });
});

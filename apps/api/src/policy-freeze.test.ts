// AGOS Skills V2 devir §3 · D-F05 (servis tarafı): bölüşüm politikası fiyatla birlikte dondurulur.
// Politika sonradan değişse de rezervasyon kendi politikasıyla hesaplanır; bilinmeyen politika sessizce
// güncel olanla değiştirilmez.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SHUTTLE_SPLIT_V1, money, parseShuttleTariff, type SplitPolicy } from "@ag/core";
import { BookingService } from "./service.ts";
import { MemoryStore, type StoredBooking } from "./store.ts";

// Varsayımsal yeni politika: yalnız test için; Owner kararı değildir.
const V2: SplitPolicy = Object.freeze({ id: "shuttle-split-test-v2", status: "approved", carrierBps: 6500, partnerBps: 2500, platformBps: 1000 });

const tariff = parseShuttleTariff({
  id: "t1",
  approval: "approved",
  publishedAt: "2026-01-01",
  currency: "EUR",
  routes: ["AYT-ALN"],
  routeInfo: { "AYT-ALN": { active: true, coverage: "AYT-ALN" } },
  validFrom: "2026-01-01",
  maxPassengers: 10,
  totalsMinor: [3000, 5000, 6000, 7000],
});

const service = (shuttlePolicy: SplitPolicy, splitPolicies?: readonly SplitPolicy[]) =>
  new BookingService({
    store: new MemoryStore(),
    sites: new Map(),
    shuttleTariff: tariff,
    shuttlePolicy,
    ...(splitPolicies ? { splitPolicies } : {}),
    pool: { slotMinutes: 60, vehicleCapacity: 10 },
    devOrigins: [],
    clock: () => new Date("2026-11-04T09:00:00Z"),
    random: { id: () => "x", index: () => 0, token: () => "t" },
    verifyHuman: async () => true,
  });

const booking = (splitPolicyId?: string): StoredBooking => ({
  id: "b1",
  ref: "AG-TESTAA",
  siteId: "site-1-web",
  sellingPartyId: "site-1",
  product: "shuttle",
  status: "confirmed",
  request: {} as unknown as StoredBooking["request"],
  price: { mode: "FIXED_SHUTTLE", total: money(5000, "EUR"), sourceVersionId: "t1", frozenAt: "2026-11-01T09:00:00Z", ...(splitPolicyId ? { splitPolicyId } : {}) },
  lookupTokenHash: "h",
  fingerprint: "f",
  isDuplicate: false,
  isTest: false,
  allowedCollectionMethods: ["cash"],
  supplierId: "sup-1",
  moneyEvents: [],
  settlementStatus: "open",
  createdAt: "2026-11-01T09:00:00Z",
  version: 1,
});

describe("D-F05 — bölüşüm politikası fiyatla dondurulur (servis)", () => {
  it("v1 ile dondurulmuş rezervasyon, servis v2'ye geçince de v1 ile hesaplanır", () => {
    const l = service(V2, [SHUTTLE_SPLIT_V1]).toLine(booking(SHUTTLE_SPLIT_V1.id))!;
    assert.deepEqual([l.policy_id, l.site_commission_amount, l.agos_fee_amount, l.supplier_entitlement], [SHUTTLE_SPLIT_V1.id, 1000, 500, 3500]);
  });

  it("dondurulmuş politikası olmayan eski kayıt güncel politikayı kullanır", () => {
    const l = service(V2).toLine(booking())!;
    assert.deepEqual([l.policy_id, l.site_commission_amount], [V2.id, 1250]);
  });

  it("bilinmeyen dondurulmuş politika hata verir (fail-closed)", () => {
    assert.throws(() => service(V2).toLine(booking("shuttle-split-v0")), /unknown_split_policy:shuttle-split-v0/);
  });
});

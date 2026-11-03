// Independent QA harness (adversarial review of c0b3175). Not part of the product code.
// Builds a BookingService on a MemoryStore with a controllable clock, deterministic ids, and an
// optional local HTTP server (127.0.0.1, random port). No external hosts are contacted.
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import {
  SHUTTLE_SPLIT_V1,
  parseShuttleTariff,
  parseSiteRecord,
  type ShuttleTariffVersion,
  type SiteRecord,
} from "@ag/core";
import { createApiServer } from "../apps/api/src/http.ts";
import { BookingService, type Actor } from "../apps/api/src/service.ts";
import { MemoryStore } from "../apps/api/src/store.ts";

export const ADMIN_TOKEN = "qa-independent-admin-token-0001";
/**
 * QA-F3 (LOCAL_ONLY): site-scoped test credentials -> siteId. The API does not know them yet; once Paket-02 adds
 * site-scoped principals, these map to one site each. Not a production identity model (SEL-332).
 */
export const SITE_TOKENS: Readonly<Record<string, string>> = {
  "qa-site-token-partner-000000001": "partner-site",
  "qa-site-token-rival-0000000001": "rival-site",
};
export const SITE_TOKEN = { partner: "qa-site-token-partner-000000001", rival: "qa-site-token-rival-0000000001" } as const;
export const MANAGER: Actor = { id: "qa-fin-mgr", role: "finance_manager", mfa: true };
export const W45 = "2026-W45"; // Mon 2026-11-02 00:00 IST (2026-11-01T21:00Z) .. Mon 2026-11-09 00:00 IST
export const W46 = "2026-W46";
export const W47 = "2026-W47";

export const SITE_RAW: Record<string, unknown>[] = [
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
    id: "rival-site",
    ownership: "partner",
    partnerId: "p-003",
    domains: ["www.rival.example"],
    ownerEmail: "owner@rival.example",
    status: "live",
    salePrices: { private: 9999, vip: 15001 },
    saleCurrency: "EUR",
    collectionMethods: ["cash", "card_pos", "bank_transfer"],
  },
  {
    id: "self-op-site",
    ownership: "partner",
    partnerId: "p-002",
    domains: ["www.selfop.example"],
    ownerEmail: "owner@selfop.example",
    status: "live",
    selfOperationVerifiedAt: "2026-11-01T00:00:00Z",
    salePrices: { private: 10000 },
    saleCurrency: "EUR",
    collectionMethods: ["cash", "bank_transfer"],
  },
  {
    // "verified" only in the far future — must not count as verified today
    id: "future-verified",
    ownership: "partner",
    partnerId: "p-009",
    domains: ["www.future.example"],
    ownerEmail: "owner@future.example",
    status: "live",
    selfOperationVerifiedAt: "2099-01-01T00:00:00Z",
    collectionMethods: ["cash"],
  },
  {
    id: "alanyagroup-com",
    ownership: "ag_brand",
    domains: ["www.alanyagroup.example"],
    ownerEmail: "ops@alanyagroup.example",
    status: "live",
    collectionMethods: ["cash", "card_pos"],
  },
];

export function makeSites(raw: Record<string, unknown>[] = SITE_RAW): Map<string, SiteRecord> {
  return new Map(raw.map((r) => {
    const s = parseSiteRecord(r);
    return [s.id, s] as const;
  }));
}
export const sites = makeSites();
export const ORIGIN: Record<string, string> = Object.fromEntries([...sites.values()].map((s) => [s.id, `https://${s.domains[0]}`]));

export const TARIFF_RAW: Record<string, unknown> = {
  id: "qa-tariff-v1",
  approval: "approved",
  publishedAt: "2026-01-01",
  currency: "EUR",
  routes: ["AYT-ALN", "ALN-AYT", "AYT-SID", "AYT-KMR"],
  routeInfo: {
    "AYT-ALN": { active: true, coverage: "AYT -> Alanya" },
    "ALN-AYT": { active: true, coverage: "Alanya -> AYT" },
    "AYT-SID": { active: true, coverage: "AYT -> Side" },
    "AYT-KMR": { active: false, coverage: "AYT -> Kemer (inactive)" },
  },
  manualPriceBounds: {
    "AYT-ALN": { minMinor: 8000, maxMinor: 14000, status: "approved" },
    "AYT-SID": { minMinor: 8000, maxMinor: 14000, status: "proposed" },
    "AYT-KMR": { minMinor: 8000, maxMinor: 14000, status: "approved" },
  },
  validFrom: "2026-01-01",
  maxPassengers: 10,
  totalsMinor: [3000, 5000, 6000, 7000],
};

export function tariff(over: Record<string, unknown> = {}): ShuttleTariffVersion {
  return parseShuttleTariff({ ...TARIFF_RAW, ...over });
}

export type Res = { ok: boolean; status: number; body: any };
/** Same BookingService, with result bodies typed loosely for assertions. */
type Loose<T> = {
  [K in keyof T]: T[K] extends (...a: infer A) => Promise<unknown>
    ? (...a: A) => Promise<Res>
    : T[K] extends (...a: infer A) => { ok: boolean }
      ? (...a: A) => Res
      : T[K];
};

export interface HarnessOptions {
  startAt?: string;
  store?: MemoryStore;
  tariff?: ShuttleTariffVersion;
  sites?: Map<string, SiteRecord>;
  idPrefix?: string;
  devOrigins?: string[];
}

export function harness(opts: HarnessOptions = {}) {
  let now = new Date(opts.startAt ?? "2026-11-02T08:00:00Z");
  let seq = 0;
  let mailN = 0;
  let keyN = 0;
  let slipN = 0;
  let slotN = 0;
  /** Distinct pickup slot per booking (bookings only share a run when a test asks for it explicitly). */
  const uniqueSlot = () => {
    const n = slotN++;
    return `2026-12-${String(1 + Math.floor(n / 20)).padStart(2, "0")}T${String(2 + (n % 20)).padStart(2, "0")}:00`;
  };
  const prefix = opts.idPrefix ?? "qa";
  const store = opts.store ?? new MemoryStore();
  const siteMap = opts.sites ?? sites;
  const devOrigins = opts.devOrigins ?? [];
  const service = new BookingService({
    store,
    sites: siteMap,
    shuttleTariff: opts.tariff ?? tariff(),
    shuttlePolicy: SHUTTLE_SPLIT_V1,
    pool: { slotMinutes: 60, vehicleCapacity: 10 },
    devOrigins,
    clock: () => now,
    random: {
      id: () => `${prefix}-id-${++seq}`,
      index: (m) => (seq++ * 7 + 3) % m,
      token: () => `${prefix}-tok-${++seq}`,
    },
    verifyHuman: async () => true,
  });
  let server: Server | undefined;
  const h = {
    service: service as unknown as Loose<BookingService>,
    store,
    base: "",
    now: () => now.toISOString(),
    setNow(iso: string) {
      now = new Date(iso);
    },
    /** Service-level public booking (origin defaults to the claimed site's own https origin). */
    async book(over: Record<string, unknown> = {}, key?: string, origin?: string): Promise<Res> {
      const siteId = (over.siteId as string | undefined) ?? "partner-site";
      const raw = {
        siteId,
        product: "shuttle",
        routeCode: "AYT-ALN",
        pickup: "Antalya Airport (AYT)",
        dropoff: "Alanya",
        pickupAt: uniqueSlot(),
        passengers: 2,
        customer: { name: "QA Guest", email: `qa${++mailN}@example.com`, phone: "+49 151 0000000", locale: "de" },
        consent: true,
        ...over,
      };
      return (await service.submit({
        raw,
        origin: origin ?? ORIGIN[siteId],
        ip: "127.0.0.1",
        idempotencyKey: key ?? `qa-key-${String(++keyN).padStart(12, "0")}`,
      })) as Res;
    },
    async row(ref: string): Promise<any> {
      return ((await service.listBookings()).body as any[]).find((b) => b.ref === ref);
    },
    async runOf(ref: string): Promise<string> {
      return (await h.row(ref)).shuttleRunId as string;
    },
    async collect(ref: string, amountMinor: number, extra: Record<string, unknown> = {}): Promise<Res> {
      return (await service.recordCollection(ref, { method: "cash", collector: "supplier", amountMinor, reference: `QA-SLIP-${++slipN}`, ...extra })) as Res;
    },
    /** Shuttle: book -> confirm -> assign run -> optional collection -> complete run. Returns the ref. */
    async shuttleJob(over: Record<string, unknown>, supplierId: string, collectMinor: number | null, method = "cash"): Promise<string> {
      const b = await h.book(over);
      if (b.status !== 201) throw new Error(`book failed: ${b.status} ${JSON.stringify(b.body)}`);
      const ref = b.body.ref as string;
      const c = await service.confirm(ref);
      if (!c.ok) throw new Error(`confirm failed: ${JSON.stringify(c.body)}`);
      const run = await h.runOf(ref);
      const a = await service.assignRun(run, supplierId);
      if (!a.ok) throw new Error(`assign failed: ${JSON.stringify(a.body)}`);
      if (collectMinor !== null) {
        const col = await h.collect(ref, collectMinor, { method });
        if (!col.ok) throw new Error(`collect failed: ${JSON.stringify(col.body)}`);
      }
      const done = await service.completeRun(run);
      if (!done.ok) throw new Error(`complete failed: ${JSON.stringify(done.body)}`);
      return ref;
    },
    async close(weekId: string): Promise<Res> {
      return (await service.closeWeek(weekId)) as Res;
    },
    async report(weekId: string): Promise<any> {
      const r = await service.weekReport(weekId);
      if (!r.ok) throw new Error(`report failed: ${JSON.stringify(r.body)}`);
      return r.body;
    },
    // ---------------- HTTP (local only) ----------------
    async start(): Promise<void> {
      const siteScope = { siteTokens: SITE_TOKENS }; // ignored until the API supports site-scoped principals
      server = createApiServer({ service, sites: siteMap, devOrigins, adminToken: ADMIN_TOKEN, publicRateLimitPerMinute: 100000, ...siteScope });
      await new Promise<void>((r) => server!.listen(0, "127.0.0.1", () => r()));
      h.base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
    },
    async stop(): Promise<void> {
      if (server) await new Promise<void>((r) => server!.close(() => r()));
    },
    async httpPost(path: string, body: unknown, headers: Record<string, string> = {}): Promise<{ status: number; body: any }> {
      const r = await fetch(h.base + path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
      return { status: r.status, body: await r.json() };
    },
    async adminPost(path: string, body: unknown = {}, headers: Record<string, string> = {}): Promise<{ status: number; body: any }> {
      return h.httpPost(path, body, { authorization: `Bearer ${ADMIN_TOKEN}`, ...headers });
    },
    async adminGet(path: string, headers: Record<string, string> = {}): Promise<{ status: number; body: any }> {
      const r = await fetch(h.base + path, { headers: { authorization: `Bearer ${ADMIN_TOKEN}`, ...headers } });
      return { status: r.status, body: await r.json() };
    },
  };
  return h;
}

/** Sum of a numeric field over entries for one booking ref. */
export function sumFor(entries: any[], ref: string, field: string): number {
  return entries.filter((e) => e.booking_ref === ref).reduce((s, e) => s + (e[field] as number), 0);
}

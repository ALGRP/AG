import { isCurrency, type Currency } from "./money.ts";

// Uydu site kaydı (site registry). Site registry tenant güvenliği DEĞİLDİR (Linear kararı):
// yetki her zaman sunucudaki oturumdan gelir; bu kayıt yalnız talebin hangi siteden geldiğini
// ve kime bildirileceğini belirler.

export type SiteOwnership =
  /** Alanya Group'un kendi markası (ör. antalyaflughafen.com). Footer'da marka beyanı. */
  | "ag_brand"
  /** Ücret ödeyen site sahibi (partner). Kendi lisansını ve satıcı kimliğini gösterir. */
  | "partner";

export type SiteStatus = "preview" | "live" | "suspended";

/**
 * Özel/VIP talebin operasyonu:
 * - pass_to_network: site sahibi satar, işi pass bedeliyle Alanya Group ağına aktarır (Partner Sunumu V3).
 * - self_operate: site sahibi operasyonu kendisi yapar; merkez yalnız kaydı tutar (03.11 ilk talep).
 */
export type PrivateMode = "pass_to_network" | "self_operate";

export interface SiteRecord {
  readonly id: string;
  readonly ownership: SiteOwnership;
  /** ownership = "partner" ise zorunlu. */
  readonly partnerId?: string;
  /** Kabul edilen tarayıcı origin'leri için hostlar (ör. "www.ornek.com", "ornek.com"). */
  readonly domains: readonly string[];
  /** Özel/VIP taleplerin anında düşeceği e-posta (site sahibi). */
  readonly ownerEmail: string;
  readonly status: SiteStatus;
  readonly privateMode: PrivateMode;
  /** Site sahibinin kendi satış fiyatları (cent). Yoksa özel talep fiyatsız "request" olarak gelir. */
  readonly salePrices?: Readonly<Partial<Record<"private" | "vip", number>>>;
  readonly saleCurrency?: Currency;
}

export type SiteResolution =
  | { ok: true; site: SiteRecord }
  | { ok: false; reason: "unknown_site" | "origin_not_allowed" | "site_suspended" };

/**
 * Talebin site kaydını çözer. Origin başlığı tarayıcı dışı istemcilerce taklit edilebilir;
 * bu yüzden atıf yalnız "iddia"dır — komisyon ancak yolculuk tamamlanıp tahsil edilince ve
 * mükerrer parmak izi kontrolünden geçince kazanılır (bkz. ledger.ts).
 */
export function resolveSite(
  sites: ReadonlyMap<string, SiteRecord>,
  siteId: string,
  origin: string | undefined,
  extraAllowedOrigins: readonly string[] = [],
): SiteResolution {
  const site = sites.get(siteId);
  if (!site) return { ok: false, reason: "unknown_site" };
  if (site.status === "suspended") return { ok: false, reason: "site_suspended" };
  if (origin === undefined) return { ok: false, reason: "origin_not_allowed" };
  if (extraAllowedOrigins.includes(origin)) return { ok: true, site };
  let host: string;
  let protocol: string;
  try {
    const u = new URL(origin);
    host = u.hostname;
    protocol = u.protocol;
  } catch {
    return { ok: false, reason: "origin_not_allowed" };
  }
  if (protocol !== "https:" || !site.domains.includes(host)) {
    return { ok: false, reason: "origin_not_allowed" };
  }
  return { ok: true, site };
}

export function parseSiteRecord(raw: unknown): SiteRecord {
  const r = raw as Record<string, unknown>;
  const fail = (m: string): never => {
    throw new Error(`invalid site record: ${m}`);
  };
  if (typeof r !== "object" || r === null) fail("not an object");
  if (typeof r.id !== "string" || !/^[a-z0-9-]{3,64}$/.test(r.id)) fail("id");
  if (r.ownership !== "ag_brand" && r.ownership !== "partner") fail("ownership");
  if (r.ownership === "partner" && (typeof r.partnerId !== "string" || r.partnerId === "")) {
    fail("partnerId required for partner sites");
  }
  if (!Array.isArray(r.domains) || r.domains.length === 0 || r.domains.some((d) => typeof d !== "string")) {
    fail("domains");
  }
  if (typeof r.ownerEmail !== "string" || !r.ownerEmail.includes("@")) fail("ownerEmail");
  if (r.status !== "preview" && r.status !== "live" && r.status !== "suspended") fail("status");
  const privateMode = r.privateMode ?? "pass_to_network";
  if (privateMode !== "pass_to_network" && privateMode !== "self_operate") fail("privateMode");
  let salePrices: Partial<Record<"private" | "vip", number>> | undefined;
  if (r.salePrices !== undefined) {
    const sp = r.salePrices as Record<string, unknown>;
    salePrices = {};
    for (const k of Object.keys(sp)) {
      if (k !== "private" && k !== "vip") fail(`salePrices.${k}`);
      if (!Number.isSafeInteger(sp[k]) || (sp[k] as number) <= 0) fail(`salePrices.${k}`);
      salePrices[k as "private" | "vip"] = sp[k] as number;
    }
    if (!isCurrency(r.saleCurrency)) fail("saleCurrency required with salePrices");
  }
  return Object.freeze({
    id: r.id as string,
    ownership: r.ownership as SiteOwnership,
    domains: [...(r.domains as string[])],
    ownerEmail: r.ownerEmail as string,
    status: r.status as SiteStatus,
    privateMode: privateMode as PrivateMode,
    ...(r.ownership === "partner" ? { partnerId: r.partnerId as string } : {}),
    ...(salePrices !== undefined ? { salePrices, saleCurrency: r.saleCurrency as Currency } : {}),
  });
}

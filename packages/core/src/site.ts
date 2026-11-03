import { isCurrency, type Currency } from "./money.ts";
import { COLLECTION_METHODS, type CollectionMethod } from "./settlement.ts";

/** alanyagroup.com ve diğer AG markalı sitelerin sahibi (satış kanalı payının alacaklısı). */
export const ALANYA_GROUP_PARTY_ID = "alanya-group";

// Uydu site kaydı (site registry). Site registry tenant güvenliği DEĞİLDİR (Linear kararı):
// yetki her zaman sunucudaki oturumdan gelir; bu kayıt yalnız talebin hangi siteden geldiğini
// ve kime bildirileceğini belirler.

export type SiteOwnership =
  /** Alanya Group'un kendi markası (ör. antalyaflughafen.com). Footer'da marka beyanı. */
  | "ag_brand"
  /** Ücret ödeyen site sahibi (partner). Kendi lisansını ve satıcı kimliğini gösterir. */
  | "partner";

export type SiteStatus = "preview" | "live" | "suspended";

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
  /** Satış kanalı payının alacaklısı: partner sitede partnerId, AG markalı sitede "alanya-group". */
  readonly ownerPartyId: string;
  /**
   * Site işi kendi aracıyla yapabilir (shuttle %90/%10, private/VIP tamamı) — yalnız yasal taşıma yetkisi ve
   * belgeleri doğrulandıysa. Doğrulanma tarihi (ISO). Hukuki inceleme ayrıca gereklidir.
   */
  readonly selfOperationVerifiedAt?: string;
  /** Tedarikçinin (ya da private/VIP'de sitenin) müşteriden tahsilatta kullanabileceği yöntemler. */
  readonly collectionMethods: readonly CollectionMethod[];
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
  if (r.selfOperationVerifiedAt !== undefined && (typeof r.selfOperationVerifiedAt !== "string" || Number.isNaN(Date.parse(r.selfOperationVerifiedAt)))) {
    fail("selfOperationVerifiedAt");
  }
  const collectionMethods = r.collectionMethods ?? ["cash", "card_pos"];
  if (
    !Array.isArray(collectionMethods) ||
    collectionMethods.length === 0 ||
    collectionMethods.some((m) => !(COLLECTION_METHODS as readonly unknown[]).includes(m))
  ) {
    fail("collectionMethods");
  }
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
    ownerPartyId: r.ownership === "partner" ? (r.partnerId as string) : ALANYA_GROUP_PARTY_ID,
    collectionMethods: [...(collectionMethods as CollectionMethod[])],
    ...(typeof r.selfOperationVerifiedAt === "string" ? { selfOperationVerifiedAt: r.selfOperationVerifiedAt } : {}),
    ...(r.ownership === "partner" ? { partnerId: r.partnerId as string } : {}),
    ...(salePrices !== undefined ? { salePrices, saleCurrency: r.saleCurrency as Currency } : {}),
  });
}

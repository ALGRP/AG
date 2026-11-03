import type { SiteOwnership } from "@ag/core";

export interface SiteConfig {
  readonly id: string;
  readonly brand: string;
  /** Kanonik host, ör. "www.ornek.com". */
  readonly domain: string;
  readonly ownership: SiteOwnership;
  readonly defaultLocale: string;
  readonly locales: readonly string[];
  /** false iken: noindex + robots Disallow + sitemap yok (önizleme). Canlıya alma OWNER GO ister. */
  readonly indexable: boolean;
  readonly contact: { readonly whatsapp: string; readonly email: string; readonly phone?: string };
  readonly legal: {
    readonly companyName: string;
    /** Yalnız doğrulanmış resmi değer. Bilinmiyorsa alan boş bırakılır; tahmin yazılmaz. */
    readonly licenseText?: string;
  };
  readonly theme: { readonly accent: string; readonly accentText: string };
  /** Shuttle formundaki hat seçenekleri; kodlar merkezi tarifeyle eşleşmeli. */
  readonly shuttleRoutes: ReadonlyArray<{ readonly code: string; readonly label: Readonly<Record<string, string>> }>;
  readonly turnstileSiteKey?: string;
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const LOCALE = /^[a-z]{2}$/;

export function parseSiteConfig(raw: unknown): SiteConfig {
  const r = raw as Record<string, any>;
  const fail = (m: string): never => {
    throw new Error(`site.json: ${m}`);
  };
  if (typeof r !== "object" || r === null) fail("not an object");
  if (typeof r.id !== "string" || !/^[a-z0-9-]{3,64}$/.test(r.id)) fail("id");
  if (typeof r.brand !== "string" || r.brand === "") fail("brand");
  if (typeof r.domain !== "string" || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(r.domain)) fail("domain");
  if (r.ownership !== "ag_brand" && r.ownership !== "partner") fail("ownership");
  if (!Array.isArray(r.locales) || r.locales.length === 0 || r.locales.some((l: unknown) => typeof l !== "string" || !LOCALE.test(l))) {
    fail("locales");
  }
  if (!r.locales.includes(r.defaultLocale)) fail("defaultLocale must be in locales");
  if (typeof r.indexable !== "boolean") fail("indexable");
  if (typeof r.contact?.whatsapp !== "string" || !/^\+\d{8,15}$/.test(r.contact.whatsapp)) fail("contact.whatsapp (E.164)");
  if (typeof r.contact?.email !== "string" || !r.contact.email.includes("@")) fail("contact.email");
  if (typeof r.legal?.companyName !== "string" || r.legal.companyName === "") fail("legal.companyName");
  if (!HEX.test(r.theme?.accent ?? "") || !HEX.test(r.theme?.accentText ?? "")) fail("theme colors");
  if (!Array.isArray(r.shuttleRoutes)) fail("shuttleRoutes");
  return r as SiteConfig;
}

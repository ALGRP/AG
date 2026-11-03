import { isCurrency, money, type Currency, type Money } from "./money.ts";

// OWNER KARARI (03.11.2026) — Shuttle fiyatı:
//   1 kişi 30 €, 2 kişi 50 €, 3 kişi 60 €, 4 kişi 70 €.
//   Bunlar REZERVASYONUN TOPLAM fiyatıdır, kişi başı ücret değildir.
//   5 kişi ve üzeri: yeni karar verilene kadar otomatik fiyat YOK → ayrı onay (requires_approval).
//   35 € kişi başı varsayımı İPTAL. Tek fiyat kaynağı bu tarifedir; site metinlerine fiyat yazılmaz.
// Tarife sürümlüdür: rezervasyon, fiyatı hangi sürümden aldığını taşır; geçmiş rezervasyonun fiyatı değişmez.
//
// K8 (ÖNERİ, Owner onayı bekliyor) — Hatlar, her yön ayrı kod:
//   AYT-ALN/ALN-AYT · AYT-SID/SID-AYT · AYT-BLK/BLK-AYT · AYT-KMR/KMR-AYT · AYT-KNY/KNY-AYT
//   GZP-ALN/ALN-GZP (Alanya Merkez, pilot). AYT ↔ GZP shuttle hattı AÇILMAZ.
//   Geçerlilik başlangıcı, onaylanan sürümün yayın tarihine bağlıdır (validFrom ≥ publishedAt).
//   "proposed" durumundaki tarife yalnız yerel/test ortamında kullanılabilir; üretim açılışı reddeder.

/** Owner kararı: bu hatlar hiçbir tarife sürümünde yer alamaz. */
export const FORBIDDEN_SHUTTLE_ROUTES: readonly string[] = ["AYT-GZP", "GZP-AYT"];
const ROUTE_CODE = /^[A-Z]{3}-[A-Z]{3}$/;

export interface ShuttleTariffVersion {
  readonly id: string;
  /** Yalnız "approved" sürüm canlıda kullanılabilir. */
  readonly approval: "proposed" | "approved";
  /** Sürümün yayın tarihi (YYYY-MM-DD). validFrom bundan önce olamaz. */
  readonly publishedAt: string;
  /** Pilot hatlar (ör. GZP-ALN): satışta "pilot" olarak işaretlenir. */
  readonly pilotRoutes: readonly string[];
  readonly currency: Currency;
  /** Bu tarifenin geçerli olduğu hat kodları (ör. "AYT-ALANYA"). */
  readonly routes: readonly string[];
  /** Yerel tarih (Europe/Istanbul), dahil. */
  readonly validFrom: string;
  /** Yerel tarih, dahil. Yoksa açık uçlu. */
  readonly validTo?: string;
  /** Paylaşımlı shuttle'da tek rezervasyon grubu için üst sınır (araç kapasitesi; Owner: en fazla 10). */
  readonly maxPassengers: number;
  /**
   * totalsMinor[i] = (i+1) kişilik rezervasyonun TOPLAM fiyatı. Otomatik fiyat yalnız bu listenin
   * kapsadığı kişi sayıları için üretilir; üstü ayrı onaya gider. Ekstrapolasyon yoktur.
   */
  readonly totalsMinor: readonly number[];
  /**
   * K8 (taslak): her yön için güzergâh kapsamı ve aktif/pasif durumu. Pasif hatta fiyat üretilmez.
   * Hat listesi pilot adayıdır; canlı fiyat Owner'ın hat bazında ayrı onayı olmadan yayımlanmaz.
   */
  readonly routeInfo: Readonly<Record<string, RouteInfo>>;
  /**
   * K17 (taslak): 5+ kişi manuel fiyat için hat bazında alt/üst sınır. Sınırı Owner onaylı olmayan hatta
   * manuel fiyat KABUL EDİLMEZ. Sayısal sınırlar ayrı Owner fiyat tablosunda kesinleşir.
   */
  readonly manualPriceBounds: Readonly<Record<string, ManualPriceBounds>>;
}

export interface RouteInfo {
  readonly active: boolean;
  /** Güzergâh kapsamı, ör. "Antalya Havalimanı → Alanya merkez ve otelleri (Mahmutlar dahil)". */
  readonly coverage: string;
}

export interface ManualPriceBounds {
  readonly minMinor: number;
  readonly maxMinor: number;
  readonly status: "approved" | "proposed";
}

export type ManualPriceCheck =
  | { ok: true }
  | { ok: false; reason: "no_bounds_for_route" | "bounds_not_approved" | "below_min" | "above_max" | "invalid_amount" | "route_inactive" };

/** K17: manuel fiyat yalnız hattın Owner onaylı alt/üst sınırı içinde kabul edilir. */
export function checkManualPrice(tariff: ShuttleTariffVersion, routeCode: string, amountMinor: number): ManualPriceCheck {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) return { ok: false, reason: "invalid_amount" };
  if (!tariff.routeInfo[routeCode]?.active) return { ok: false, reason: "route_inactive" };
  const b = tariff.manualPriceBounds[routeCode];
  if (!b) return { ok: false, reason: "no_bounds_for_route" };
  if (b.status !== "approved") return { ok: false, reason: "bounds_not_approved" };
  if (amountMinor < b.minMinor) return { ok: false, reason: "below_min" };
  if (amountMinor > b.maxMinor) return { ok: false, reason: "above_max" };
  return { ok: true };
}

export type ShuttlePriceResult =
  | { ok: true; total: Money; tariffVersionId: string; passengers: number }
  | {
      ok: false;
      reason: "invalid_passengers" | "over_capacity" | "route_not_in_tariff" | "route_inactive" | "date_out_of_range" | "requires_approval";
    };

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Otomatik fiyatlanan en büyük grup (bugün 4). */
export function autoPricedUpTo(tariff: ShuttleTariffVersion): number {
  return tariff.totalsMinor.length;
}

export function priceShuttle(
  tariff: ShuttleTariffVersion,
  routeCode: string,
  localDate: string,
  passengers: number,
): ShuttlePriceResult {
  if (!Number.isInteger(passengers) || passengers < 1) return { ok: false, reason: "invalid_passengers" };
  if (passengers > tariff.maxPassengers) return { ok: false, reason: "over_capacity" };
  if (!tariff.routes.includes(routeCode)) return { ok: false, reason: "route_not_in_tariff" };
  if (!tariff.routeInfo[routeCode]?.active) return { ok: false, reason: "route_inactive" };
  if (!LOCAL_DATE.test(localDate)) return { ok: false, reason: "date_out_of_range" };
  if (localDate < tariff.validFrom) return { ok: false, reason: "date_out_of_range" };
  if (tariff.validTo !== undefined && localDate > tariff.validTo) {
    return { ok: false, reason: "date_out_of_range" };
  }
  if (passengers > autoPricedUpTo(tariff)) return { ok: false, reason: "requires_approval" };
  return {
    ok: true,
    total: money(tariff.totalsMinor[passengers - 1]!, tariff.currency),
    tariffVersionId: tariff.id,
    passengers,
  };
}

/** JSON'dan gelen tarifeyi doğrular; hatalıysa açıklayıcı hata fırlatır. */
export function parseShuttleTariff(raw: unknown): ShuttleTariffVersion {
  const t = raw as Record<string, unknown>;
  const fail = (msg: string): never => {
    throw new Error(`invalid shuttle tariff: ${msg}`);
  };
  if (typeof t !== "object" || t === null) fail("not an object");
  if (typeof t.id !== "string" || t.id === "") fail("id");
  if (!isCurrency(t.currency)) fail("currency");
  if (t.approval !== "proposed" && t.approval !== "approved") fail("approval");
  if (typeof t.publishedAt !== "string" || !LOCAL_DATE.test(t.publishedAt)) fail("publishedAt");
  if (!Array.isArray(t.routes) || t.routes.length === 0 || t.routes.some((r) => typeof r !== "string" || !ROUTE_CODE.test(r))) {
    fail("routes (each direction its own code, e.g. AYT-ALN)");
  }
  if (new Set(t.routes as string[]).size !== (t.routes as string[]).length) fail("duplicate route code");
  for (const r of t.routes as string[]) {
    if (FORBIDDEN_SHUTTLE_ROUTES.includes(r)) fail(`route ${r} is not allowed (Owner decision: no AYT-GZP shuttle)`);
  }
  const pilot = (t.pilotRoutes ?? []) as unknown;
  if (!Array.isArray(pilot) || pilot.some((r) => !(t.routes as string[]).includes(r))) fail("pilotRoutes must be listed routes");
  if (typeof t.validFrom !== "string" || !LOCAL_DATE.test(t.validFrom)) fail("validFrom");
  if ((t.validFrom as string) < (t.publishedAt as string)) fail("validFrom cannot be before publishedAt");
  if (t.validTo !== undefined && (typeof t.validTo !== "string" || !LOCAL_DATE.test(t.validTo))) {
    fail("validTo");
  }
  if (!Number.isInteger(t.maxPassengers) || (t.maxPassengers as number) < 1) fail("maxPassengers");
  if (
    !Array.isArray(t.totalsMinor) ||
    t.totalsMinor.length === 0 ||
    t.totalsMinor.some((n) => !Number.isSafeInteger(n) || (n as number) <= 0)
  ) {
    fail("totalsMinor");
  }
  if ((t.totalsMinor as number[]).length > (t.maxPassengers as number)) fail("totalsMinor longer than maxPassengers");
  // Eski "kişi başı ek ücret" alanı Owner kararıyla kaldırıldı; kalmış bir yapılandırma sessizce
  // fiyat üretmesin diye reddedilir.
  if ("extraPerPassengerMinor" in t) fail("extraPerPassengerMinor is no longer supported (Owner decision 03.11.2026)");
  const routes = t.routes as string[];
  const info = (t.routeInfo ?? {}) as Record<string, unknown>;
  const routeInfo: Record<string, RouteInfo> = {};
  for (const r of routes) {
    const x = info[r] as Record<string, unknown> | undefined;
    if (!x || typeof x.active !== "boolean" || typeof x.coverage !== "string" || x.coverage.trim() === "") {
      fail(`routeInfo for ${r} (active + coverage) is required`);
    }
    routeInfo[r] = { active: x!.active as boolean, coverage: (x!.coverage as string).trim() };
  }
  for (const k of Object.keys(info)) if (!routes.includes(k)) fail(`routeInfo for unknown route ${k}`);
  const boundsRaw = (t.manualPriceBounds ?? {}) as Record<string, unknown>;
  const manualPriceBounds: Record<string, ManualPriceBounds> = {};
  for (const [k, v] of Object.entries(boundsRaw)) {
    const b = v as Record<string, unknown>;
    if (!routes.includes(k)) fail(`manualPriceBounds for unknown route ${k}`);
    if (!Number.isSafeInteger(b.minMinor) || !Number.isSafeInteger(b.maxMinor) || (b.minMinor as number) <= 0 || (b.maxMinor as number) < (b.minMinor as number)) {
      fail(`manualPriceBounds for ${k}: 0 < min <= max required`);
    }
    if (b.status !== "approved" && b.status !== "proposed") fail(`manualPriceBounds for ${k}: status`);
    manualPriceBounds[k] = { minMinor: b.minMinor as number, maxMinor: b.maxMinor as number, status: b.status as "approved" | "proposed" };
  }
  const tariff: ShuttleTariffVersion = {
    id: t.id as string,
    approval: t.approval as "proposed" | "approved",
    publishedAt: t.publishedAt as string,
    pilotRoutes: [...(pilot as string[])],
    currency: t.currency as Currency,
    routes: [...(t.routes as string[])],
    validFrom: t.validFrom as string,
    maxPassengers: t.maxPassengers as number,
    totalsMinor: [...(t.totalsMinor as number[])],
    routeInfo,
    manualPriceBounds,
    ...(t.validTo !== undefined ? { validTo: t.validTo as string } : {}),
  };
  return Object.freeze(tariff);
}

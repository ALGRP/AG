import { isCurrency, money, type Currency, type Money } from "./money.ts";

// OWNER KARARI (03.11.2026) — Shuttle fiyatı:
//   1 kişi 30 €, 2 kişi 50 €, 3 kişi 60 €, 4 kişi 70 €.
//   Bunlar REZERVASYONUN TOPLAM fiyatıdır, kişi başı ücret değildir.
//   5 kişi ve üzeri: yeni karar verilene kadar otomatik fiyat YOK → ayrı onay (requires_approval).
//   35 € kişi başı varsayımı İPTAL. Tek fiyat kaynağı bu tarifedir; site metinlerine fiyat yazılmaz.
// Tarife sürümlüdür: rezervasyon, fiyatı hangi sürümden aldığını taşır.

export interface ShuttleTariffVersion {
  readonly id: string;
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
}

export type ShuttlePriceResult =
  | { ok: true; total: Money; tariffVersionId: string; passengers: number }
  | {
      ok: false;
      reason: "invalid_passengers" | "over_capacity" | "route_not_in_tariff" | "date_out_of_range" | "requires_approval";
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
  if (!Array.isArray(t.routes) || t.routes.some((r) => typeof r !== "string")) fail("routes");
  if (typeof t.validFrom !== "string" || !LOCAL_DATE.test(t.validFrom)) fail("validFrom");
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
  const tariff: ShuttleTariffVersion = {
    id: t.id as string,
    currency: t.currency as Currency,
    routes: [...(t.routes as string[])],
    validFrom: t.validFrom as string,
    maxPassengers: t.maxPassengers as number,
    totalsMinor: [...(t.totalsMinor as number[])],
    ...(t.validTo !== undefined ? { validTo: t.validTo as string } : {}),
  };
  return Object.freeze(tariff);
}

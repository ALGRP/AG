import { isCurrency, money, type Currency, type Money } from "./money.ts";

// Shuttle fiyatı yalnız onaylı, sürümlü tarifeden gelir (Linear: Sistem Tasarımı v2 §2,
// white-label SaaS v1 "FIXED_SHUTTLE"). Tarifesi olmayan hatta fiyat uydurulmaz.
// Kişi sayısına göre GRUP TOPLAMI: 1 → 30 €, 2 → 50 €, 3 → 60 €, sonraki her kişi +10 €.

export interface ShuttleTariffVersion {
  readonly id: string;
  readonly currency: Currency;
  /** Bu tarifenin geçerli olduğu hat kodları (ör. "AYT-ALANYA"). Her hatta aynı fiyat varsayılmaz. */
  readonly routes: readonly string[];
  /** Yerel tarih (Europe/Istanbul), dahil. */
  readonly validFrom: string;
  /** Yerel tarih, dahil. Yoksa açık uçlu. */
  readonly validTo?: string;
  /** Paylaşımlı shuttle'da tek rezervasyon grubu için üst sınır (Owner: en fazla 10). */
  readonly maxPassengers: number;
  /** totalsMinor[i] = (i+1) kişilik grup toplamı. */
  readonly totalsMinor: readonly number[];
  /** totalsMinor bittikten sonra kişi başı ek. */
  readonly extraPerPassengerMinor: number;
}

export type ShuttlePriceResult =
  | { ok: true; total: Money; tariffVersionId: string; passengers: number }
  | {
      ok: false;
      reason: "invalid_passengers" | "over_capacity" | "route_not_in_tariff" | "date_out_of_range";
    };

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

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

  const listed = tariff.totalsMinor.length;
  let totalMinor: number;
  if (passengers <= listed) {
    totalMinor = tariff.totalsMinor[passengers - 1]!;
  } else {
    totalMinor = tariff.totalsMinor[listed - 1]! + (passengers - listed) * tariff.extraPerPassengerMinor;
  }
  return {
    ok: true,
    total: money(totalMinor, tariff.currency),
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
  if (!Number.isSafeInteger(t.extraPerPassengerMinor) || (t.extraPerPassengerMinor as number) < 0) {
    fail("extraPerPassengerMinor");
  }
  const tariff: ShuttleTariffVersion = {
    id: t.id as string,
    currency: t.currency as Currency,
    routes: [...(t.routes as string[])],
    validFrom: t.validFrom as string,
    maxPassengers: t.maxPassengers as number,
    totalsMinor: [...(t.totalsMinor as number[])],
    extraPerPassengerMinor: t.extraPerPassengerMinor as number,
    ...(t.validTo !== undefined ? { validTo: t.validTo as string } : {}),
  };
  return Object.freeze(tariff);
}

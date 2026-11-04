import { PRODUCTS, type Product } from "./booking.ts";
import { COLLECTION_METHODS, type CollectionMethod } from "./settlement.ts";

// Uydu site formundan gelen ham verinin doğrulanması.
// İstemciden FİYAT KABUL EDİLMEZ: fiyat yalnız sunucuda tarifeden / teklif akışından gelir.

export interface IntakeRequest {
  readonly siteId: string;
  readonly product: Product;
  /** Shuttle için zorunlu: tarifedeki hat kodu. */
  readonly routeCode?: string;
  readonly pickup: string;
  readonly dropoff: string;
  /** Yerel saat (Europe/Istanbul), "YYYY-MM-DDTHH:mm". */
  readonly pickupAt: string;
  readonly passengers: number;
  readonly flightNo?: string;
  readonly notes?: string;
  readonly returnPickupAt?: string;
  readonly customer: {
    readonly name: string;
    readonly email: string;
    readonly phone: string;
    readonly locale: string;
  };
  /** Müşterinin tercih ettiği ödeme yöntemi (tedarikçiye); sitenin izin verdiği yöntemlerden biri olmalı. */
  readonly paymentMethod?: CollectionMethod;
  /** Turnstile / captcha jetonu; doğrulaması API katmanında yapılır. */
  readonly humanToken?: string;
}

export interface FieldError {
  readonly field: string;
  readonly code: string;
}

export type IntakeValidation = { ok: true; value: IntakeRequest } | { ok: false; errors: FieldError[] };

const LOCAL_DATETIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const PHONE = /^\+?[0-9 ()-]{7,20}$/;
const LOCALE = /^[a-z]{2}(-[A-Z]{2})?$/;
const FLIGHT = /^[A-Z0-9]{2}\s?\d{1,4}[A-Z]?$/i;

export const MAX_PASSENGERS_ANY = 16;

function str(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length > 0 && t.length <= max ? t : undefined;
}

export function isValidLocalDateTime(v: string): boolean {
  const m = LOCAL_DATETIME.exec(v);
  if (!m) return false;
  const [, y, mo, d, h, mi] = m.map(Number) as [number, number, number, number, number, number];
  const date = new Date(Date.UTC(y, mo - 1, d, h, mi));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === mo - 1 &&
    date.getUTCDate() === d &&
    h < 24 &&
    mi < 60
  );
}

export function validateIntake(raw: unknown): IntakeValidation {
  const errors: FieldError[] = [];
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const c = (typeof r.customer === "object" && r.customer !== null ? r.customer : {}) as Record<string, unknown>;

  // Bal küpü (honeypot): görünmez "website" alanı doluysa bot.
  if (r.website !== undefined && r.website !== "") errors.push({ field: "website", code: "bot_suspected" });

  const siteId = str(r.siteId, 64);
  if (!siteId) errors.push({ field: "siteId", code: "required" });

  const product = typeof r.product === "string" && (PRODUCTS as readonly string[]).includes(r.product)
    ? (r.product as Product)
    : undefined;
  if (!product) errors.push({ field: "product", code: "invalid" });

  const routeCode = str(r.routeCode, 40);
  if (product === "shuttle" && !routeCode) errors.push({ field: "routeCode", code: "required" });

  const pickup = str(r.pickup, 200);
  if (!pickup) errors.push({ field: "pickup", code: "required" });
  const dropoff = str(r.dropoff, 200);
  if (!dropoff) errors.push({ field: "dropoff", code: "required" });

  const pickupAt = typeof r.pickupAt === "string" && isValidLocalDateTime(r.pickupAt) ? r.pickupAt : undefined;
  if (!pickupAt) errors.push({ field: "pickupAt", code: "invalid" });

  let returnPickupAt: string | undefined;
  if (r.returnPickupAt !== undefined && r.returnPickupAt !== "") {
    if (typeof r.returnPickupAt === "string" && isValidLocalDateTime(r.returnPickupAt)) {
      returnPickupAt = r.returnPickupAt;
      if (pickupAt && returnPickupAt <= pickupAt) errors.push({ field: "returnPickupAt", code: "before_pickup" });
    } else {
      errors.push({ field: "returnPickupAt", code: "invalid" });
    }
  }

  const passengers = r.passengers;
  if (!Number.isInteger(passengers) || (passengers as number) < 1 || (passengers as number) > MAX_PASSENGERS_ANY) {
    errors.push({ field: "passengers", code: "invalid" });
  }

  let flightNo: string | undefined;
  if (r.flightNo !== undefined && r.flightNo !== "") {
    flightNo = str(r.flightNo, 10);
    if (!flightNo || !FLIGHT.test(flightNo)) errors.push({ field: "flightNo", code: "invalid" });
  }
  let notes: string | undefined;
  if (r.notes !== undefined && r.notes !== "") {
    notes = str(r.notes, 1000);
    if (!notes) errors.push({ field: "notes", code: "too_long" });
  }

  const name = str(c.name, 120);
  if (!name) errors.push({ field: "customer.name", code: "required" });
  const email = str(c.email, 254);
  if (!email || !EMAIL.test(email)) errors.push({ field: "customer.email", code: "invalid" });
  const phone = str(c.phone, 20);
  if (!phone || !PHONE.test(phone)) errors.push({ field: "customer.phone", code: "invalid" });
  const locale = typeof c.locale === "string" && LOCALE.test(c.locale) ? c.locale : "en";

  if (r.consent !== true) errors.push({ field: "consent", code: "required" });

  let paymentMethod: CollectionMethod | undefined;
  if (r.paymentMethod !== undefined && r.paymentMethod !== "") {
    if ((COLLECTION_METHODS as readonly unknown[]).includes(r.paymentMethod)) paymentMethod = r.paymentMethod as CollectionMethod;
    else errors.push({ field: "paymentMethod", code: "invalid" });
  }

  if (errors.length > 0) return { ok: false, errors };

  const value: IntakeRequest = {
    siteId: siteId!,
    product: product!,
    pickup: pickup!,
    dropoff: dropoff!,
    pickupAt: pickupAt!,
    passengers: passengers as number,
    customer: { name: name!, email: email!.toLowerCase(), phone: phone!, locale },
    ...(routeCode !== undefined ? { routeCode } : {}),
    ...(flightNo !== undefined ? { flightNo: flightNo.toUpperCase().replace(/\s/g, "") } : {}),
    ...(notes !== undefined ? { notes } : {}),
    ...(returnPickupAt !== undefined ? { returnPickupAt } : {}),
    ...(paymentMethod !== undefined ? { paymentMethod } : {}),
    ...(typeof r.humanToken === "string" ? { humanToken: r.humanToken } : {}),
  };
  return { ok: true, value };
}

/** Mükerrer rezervasyon parmak izi girdisi (komisyon doğmaz). Hash'leme çağıranda yapılır. */
export function duplicateFingerprintInput(req: IntakeRequest): string {
  const phoneDigits = req.customer.phone.replace(/\D/g, "");
  return [req.product, req.routeCode ?? "", req.pickupAt, req.customer.email, phoneDigits].join("|");
}

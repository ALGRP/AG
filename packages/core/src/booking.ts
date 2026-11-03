import type { Money } from "./money.ts";

// Rezervasyon gerçeği (Linear, Sistem Tasarımı v2): request ≠ quote ≠ confirmed ≠ paid ≠ delivered.
// Operasyon durumu ile ödeme durumu ayrı alanlardır: araçta nakit ödeme teslimden sonra "paid" olur.

export const PRODUCTS = ["private", "vip", "shuttle"] as const;
export type Product = (typeof PRODUCTS)[number];

export type BookingStatus = "request" | "quoted" | "confirmed" | "delivered" | "cancelled";
export type PaymentStatus = "unpaid" | "paid" | "refunded";
export type CollectionMode = "card" | "cash_in_vehicle";

const TRANSITIONS: Readonly<Record<BookingStatus, readonly BookingStatus[]>> = {
  request: ["quoted", "confirmed", "cancelled"],
  quoted: ["confirmed", "cancelled"],
  confirmed: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export class InvalidTransitionError extends Error {
  readonly from: BookingStatus;
  readonly to: BookingStatus;
  constructor(from: BookingStatus, to: BookingStatus) {
    super(`invalid booking transition ${from} → ${to}`);
    this.from = from;
    this.to = to;
  }
}

export function assertTransition(from: BookingStatus, to: BookingStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

/** Kim operasyonu yapar: özel/VIP'de talebi getiren site sahibi, shuttle'da merkez. */
export type OperationsOwner = { kind: "central" } | { kind: "partner"; partnerId: string };

export interface PriceSnapshot {
  readonly mode: "FIXED_SHUTTLE" | "PARTNER_PRICE_WITH_PASS" | "PARTNER_QUOTE";
  readonly total: Money;
  /** Yalnız PARTNER_PRICE_WITH_PASS: ağa aktarılan pass bedeli (rezervasyon anında dondurulur). */
  readonly pass?: Money;
  /** tariff_version_id veya teklif id'si — fiyat sonradan sessizce değişmez. */
  readonly sourceVersionId: string;
  readonly frozenAt: string;
}

/**
 * Rezervasyon kodu: kısa, okunması kolay; 0/O/1/I/L kullanılmaz (havuz iş kodu kuralıyla aynı alfabe).
 */
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export function bookingRef(randomIndex: (maxExclusive: number) => number, prefix = "AG"): string {
  let out = "";
  for (let i = 0; i < 6; i++) out += CODE_ALPHABET[randomIndex(CODE_ALPHABET.length)];
  return `${prefix}-${out}`;
}

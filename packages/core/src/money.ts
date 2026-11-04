// Para her zaman tam sayı "minor unit" (cent/kuruş) olarak tutulur; float yok.
// Para birimleri karıştırılmaz (AGOS kuralı: her tutar kendi para birimiyle).

export const CURRENCIES = ["EUR", "USD", "GBP", "TRY"] as const;
export type Currency = (typeof CURRENCIES)[number];

export interface Money {
  readonly amountMinor: number;
  readonly currency: Currency;
}

export function isCurrency(value: unknown): value is Currency {
  return typeof value === "string" && (CURRENCIES as readonly string[]).includes(value);
}

export function money(amountMinor: number, currency: Currency): Money {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new RangeError(`amountMinor must be a safe integer, got ${amountMinor}`);
  }
  return Object.freeze({ amountMinor, currency });
}

export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new Error(`currency mismatch: ${a.currency} vs ${b.currency}`);
  }
  return money(a.amountMinor + b.amountMinor, a.currency);
}

export function negate(m: Money): Money {
  return money(-m.amountMinor, m.currency);
}

export function formatMoney(m: Money, locale = "en"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: m.currency }).format(
    m.amountMinor / 100,
  );
}

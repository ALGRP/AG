import { money, type Currency, type Money } from "./money.ts";

// K12 (ÖNERİ, Owner onayı bekliyor) — Özel / VIP iki modelle desteklenir; varsayılan NETWORK_PASS:
//
//  Model A · SELF_OPERATED: site sahibi yasal şartları ve operasyon yetkisi DOĞRULANMIŞSA kendi aracıyla yapar.
//    Gelir ve masraf site sahibinindir. Alanya Group işlem komisyonu ALMAZ (yalnız aylık SaaS aboneliği).
//
//  Model B · NETWORK_PASS: site sahibi işi Alanya Group tedarikçi ağına aktarır.
//    Örnek: müşteri 80 € · tedarikçi iş aktarım (pass) bedeli 47,50 € · site 32,50 € · Alanya Group ek komisyonu 0 €.
//    Yani pass bedelinin TAMAMI tedarikçinindir.
//
// Tutarlar sabit tarife DEĞİLDİR (örnek); bu yüzden sürümlü ve "example" etiketli politika olarak tutulur.

export type PassProduct = "private" | "vip";

export interface PassPolicy {
  readonly id: string;
  readonly currency: Currency;
  readonly passMinor: Readonly<Record<PassProduct, number>>;
}

export const PASS_POLICY_DECK_V3: PassPolicy = Object.freeze({
  id: "pass-deck-v3-example",
  currency: "EUR",
  passMinor: Object.freeze({ private: 4750, vip: 6000 }),
});

/** Site sahibinin kendi satış fiyatları (ürün başına, tek araç / tek yön). */
export type SalePrices = Readonly<Partial<Record<PassProduct, number>>>;

export interface PassSplit {
  readonly policyId: string;
  readonly sale: Money;
  readonly pass: Money;
  /** Uydu sitede kalan satış katkısı. */
  readonly partner: Money;
}

export type PassSplitResult =
  | { ok: true; split: PassSplit }
  | { ok: false; reason: "no_sale_price" | "sale_below_pass" | "currency_mismatch" };

export function splitPass(
  product: PassProduct,
  salePrices: SalePrices,
  saleCurrency: Currency,
  policy: PassPolicy,
): PassSplitResult {
  const saleMinor = salePrices[product];
  if (saleMinor === undefined) return { ok: false, reason: "no_sale_price" };
  if (saleCurrency !== policy.currency) return { ok: false, reason: "currency_mismatch" };
  const passMinor = policy.passMinor[product];
  // Satış pass'ın altındaysa araç hak edişi karşılanamaz: sistem bu satışı kabul etmez.
  if (saleMinor < passMinor) return { ok: false, reason: "sale_below_pass" };
  return {
    ok: true,
    split: {
      policyId: policy.id,
      sale: money(saleMinor, saleCurrency),
      pass: money(passMinor, saleCurrency),
      partner: money(saleMinor - passMinor, saleCurrency),
    },
  };
}

import { money, type Currency, type Money } from "./money.ts";

// Özel / VIP "iş aktarım (pass)" modeli — Konsorsiyum Partner Sunumu V3 (03.11.2026), slayt 8–9:
//   Uydu site sahibi kendi satış fiyatıyla satar (örnek: private 80 €, VIP 120 €).
//   Sabit bir PASS bedeli işi yapacak ağa (Alanya Group + araç) aktarılır (örnek: 47,50 € / 60 €).
//   Satış − pass = uydu site satış katkısı (örnek: 32,50 € / 60 €).
//   Pass, AG'nin net kârı DEĞİLDİR: araç hak edişi ve operasyon gideri buradan karşılanır.
// Sunumdaki tutarlar "örnek varsayım"dır; bu yüzden sürümlü politika olarak tutulur.

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

/**
 * Pass bedelinin araç ve merkez arasında bölünmesi. Araç hak edişi sunuma göre
 * "rota / araç / sözleşmeye göre netleşir" (slayt 18): sabit oran yok, atamada belirlenir.
 */
export function splitPassToNetwork(
  pass: Money,
  carrierPayout: Money,
): { ok: true; carrier: Money; platform: Money } | { ok: false; reason: "payout_exceeds_pass" | "currency_mismatch" | "negative_payout" } {
  if (carrierPayout.currency !== pass.currency) return { ok: false, reason: "currency_mismatch" };
  if (carrierPayout.amountMinor < 0) return { ok: false, reason: "negative_payout" };
  if (carrierPayout.amountMinor > pass.amountMinor) return { ok: false, reason: "payout_exceeds_pass" };
  return {
    ok: true,
    carrier: carrierPayout,
    platform: money(pass.amountMinor - carrierPayout.amountMinor, pass.currency),
  };
}

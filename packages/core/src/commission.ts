import { money, type Money } from "./money.ts";

// OWNER KARARI (03.11.2026, KESİN) — Uydu siteden gelen shuttle rezervasyonu, SATIŞ TUTARI üzerinden:
//   %70 → transferi gerçekleştiren tedarikçi (hak ediş alıcısı: araç tedarikçiye aitse tedarikçi, değilse şoför)
//   %20 → rezervasyonu getiren uydu site
//   %10 → Alanya Group (sistem payı)
//   Örnekler: 30 € → 21 / 6 / 3 · 50 € → 35 / 10 / 5 · 60 € → 42 / 12 / 6 · 70 € → 49 / 14 / 7.
//
// K4 (ÖNERİ, Owner onayı bekliyor) — Alanya Group'un KENDİ sitesinden gelen shuttle:
//   bağımsız uydu site yok → %10 Alanya Group, %90 tedarikçi (50 € → AG 5 €, tedarikçi 45 €).
//   Onaylanana kadar bu rezervasyonlar için OTOMATİK PAY YAZILMAZ (eski "%20 merkeze" kuralı kaldırıldı);
//   kayıt finans incelemesine düşer.
// Oranlar sürümlü politikadır; her pay kaydı kullandığı politikanın id'sini taşır.

export interface SplitPolicy {
  readonly id: string;
  /** Yalnız "approved" politika otomatik pay yazar. */
  readonly status: "approved" | "proposed";
  /** Baz puan (10000 = %100). */
  readonly carrierBps: number;
  readonly partnerBps: number;
  readonly platformBps: number;
}

/** Uydu site kaynaklı shuttle — KESİN KARAR. */
export const SHUTTLE_SPLIT_V1: SplitPolicy = Object.freeze({
  id: "shuttle-split-v1",
  status: "approved",
  carrierBps: 7000,
  partnerBps: 2000,
  platformBps: 1000,
});

/** Alanya Group'un kendi sitesinden doğrudan shuttle — K4 ÖNERİSİ, onay bekliyor. */
export const SHUTTLE_DIRECT_SPLIT_PROPOSED: SplitPolicy = Object.freeze({
  id: "shuttle-direct-v1",
  status: "proposed",
  carrierBps: 9000,
  partnerBps: 0,
  platformBps: 1000,
});

export interface SplitResult {
  readonly policyId: string;
  readonly carrier: Money;
  readonly partner: Money;
  readonly platform: Money;
}

export function assertValidPolicy(p: SplitPolicy): void {
  for (const v of [p.carrierBps, p.partnerBps, p.platformBps]) {
    if (!Number.isInteger(v) || v < 0) throw new Error(`policy ${p.id}: bps must be non-negative integers`);
  }
  if (p.carrierBps + p.partnerBps + p.platformBps !== 10000) {
    throw new Error(`policy ${p.id}: shares must sum to 10000 bps`);
  }
}

/**
 * Satış tutarını politikaya göre üç paya böler. Paylar her zaman satış tutarına tam eşit toplanır:
 * tedarikçi ve site payı aşağı yuvarlanır, kuruş farkı Alanya Group'a kalır (deterministik).
 * Politikada olmayan bir pay başka tarafa AKTARILMAZ: hangi politikanın uygulanacağını çağıran seçer.
 */
export function splitShuttleRevenue(base: Money, policy: SplitPolicy): SplitResult {
  assertValidPolicy(policy);
  if (base.amountMinor < 0) throw new RangeError("base must be non-negative; use adjustments for reversals");
  const carrier = Math.floor((base.amountMinor * policy.carrierBps) / 10000);
  const partner = Math.floor((base.amountMinor * policy.partnerBps) / 10000);
  const platform = base.amountMinor - carrier - partner;
  return Object.freeze({
    policyId: policy.id,
    carrier: money(carrier, base.currency),
    partner: money(partner, base.currency),
    platform: money(platform, base.currency),
  });
}

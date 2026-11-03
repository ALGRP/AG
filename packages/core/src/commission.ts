import { money, type Money } from "./money.ts";

// Shuttle gelir paylaşımı (Owner talebi, 03.11.2026):
//   %70 → seferi yapan taşıyıcı araç (hak ediş alıcısı: araç tedarikçiye aitse tedarikçi, değilse şoför)
//   %20 → rezervasyonu getiren uydu site sahibi (partner)
//   %10 → merkez (Alanya Group / platform)
// Oranlar kodda sabit değil, sürümlü politika olarak tutulur; her rezervasyon kullandığı politikanın id'sini taşır.
// MATRAH (KDV, indirim, iade, ödeme komisyonu) AÇIK karardır — fonksiyon matrahı dışarıdan alır.

export interface SplitPolicy {
  readonly id: string;
  /** Baz puan (10000 = %100). */
  readonly carrierBps: number;
  readonly partnerBps: number;
  readonly platformBps: number;
}

export const SHUTTLE_SPLIT_V1: SplitPolicy = Object.freeze({
  id: "shuttle-split-v1",
  carrierBps: 7000,
  partnerBps: 2000,
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
 * Matrahı üç paya böler. Paylar her zaman matraha tam eşit toplanır:
 * taşıyıcı ve partner payı aşağı yuvarlanır, kuruş farkı merkeze kalır (belgelenmiş, deterministik).
 * Kaynak bir partner sitesi değilse (Alanya Group'un kendi sitesi) partner payı merkeze eklenir.
 */
export function splitShuttleRevenue(base: Money, policy: SplitPolicy, hasPartner: boolean): SplitResult {
  assertValidPolicy(policy);
  if (base.amountMinor < 0) throw new RangeError("base must be non-negative; use adjustments for reversals");
  const carrier = Math.floor((base.amountMinor * policy.carrierBps) / 10000);
  const partner = hasPartner ? Math.floor((base.amountMinor * policy.partnerBps) / 10000) : 0;
  const platform = base.amountMinor - carrier - partner;
  return Object.freeze({
    policyId: policy.id,
    carrier: money(carrier, base.currency),
    partner: money(partner, base.currency),
    platform: money(platform, base.currency),
  });
}

// Aylık ekonomi hesapları — Konsorsiyum Partner Sunumu V3 (03.11.2026), slayt 7 ve 10–15.
// DİKKAT: sunumun shuttle rakamları (slayt 9–12) iptal edilen 35 € kişi başı varsayımına dayanır;
// bu fonksiyonlar Owner'ın 03.11 shuttle kararıyla (rezervasyon toplamı × %20) çalışır.
// Amaç: panelde ve satış görüşmesinde aynı formülün kullanılması. Sonuçlar KAZANÇ GARANTİSİ
// veya NET KÂR değildir: vergi, KDV, iade, iptal ve araç maliyetleri dahil değildir.
// Tüm tutarlar cent (minor unit), tek para birimi (EUR).

export interface PartnerCostAssumptions {
  /** Alanya Group'a aylık SaaS aboneliği (sunum: 200 €). */
  readonly subscriptionMinor: number;
  /** Uydu sitenin günlük Google Ads bütçesi (sunum: 40 €/gün). Merkezin cirosu değildir. */
  readonly adsPerDayMinor: number;
  readonly daysInMonth: number;
}

export const DECK_V3_PARTNER_COSTS: PartnerCostAssumptions = Object.freeze({
  subscriptionMinor: 20000,
  adsPerDayMinor: 4000,
  daysInMonth: 30,
});

export interface PartnerScenario {
  /** Günlük ortalama private iş (kesirli olabilir: 1,5). */
  readonly privatePerDay: number;
  /** Günlük shuttle REZERVASYONU (kişi değil; fiyat rezervasyon toplamıdır). */
  readonly shuttleBookingsPerDay: number;
  /** Private iş başına uydu site katkısı = satış − pass (sunum: 32,50 €). */
  readonly privateContributionMinor: number;
  /**
   * Shuttle rezervasyonu başına uydu site payı = rezervasyon toplamı × %20 (Owner kararı 03.11.2026),
   * ör. 2 kişilik 50 € → 10 €. Sunumdaki "35 € bilet / 7 €" varsayımı İPTAL edildi.
   */
  readonly shuttleContributionMinor: number;
}

export interface PartnerMonth {
  readonly grossContributionMinor: number;
  readonly costsMinor: number;
  readonly afterCostsMinor: number;
}

export function partnerMonth(s: PartnerScenario, c: PartnerCostAssumptions = DECK_V3_PARTNER_COSTS): PartnerMonth {
  const gross = Math.round(
    (s.privatePerDay * s.privateContributionMinor + s.shuttleBookingsPerDay * s.shuttleContributionMinor) * c.daysInMonth,
  );
  const costs = c.subscriptionMinor + c.adsPerDayMinor * c.daysInMonth;
  return { grossContributionMinor: gross, costsMinor: costs, afterCostsMinor: gross - costs };
}

/** Aylık site + reklam giderini tek başına kapatan iş sayısı (yukarı yuvarlanır). */
export function breakEvenUnits(monthlyCostMinor: number, contributionPerUnitMinor: number): number {
  if (contributionPerUnitMinor <= 0) throw new RangeError("contribution must be positive");
  return Math.ceil(monthlyCostMinor / contributionPerUnitMinor);
}

export interface CentreAssumptions {
  readonly subscriptionMinor: number;
  /** Site başı değişken maliyet: hosting + yazılım + destek (sunum: 40 €). */
  readonly siteCostMinor: number;
  /** Merkez sabit genel gideri (sunum varsayımı: 2.000 €/ay). */
  readonly fixedCostMinor: number;
}

export const DECK_V3_CENTRE: CentreAssumptions = Object.freeze({
  subscriptionMinor: 20000,
  siteCostMinor: 4000,
  fixedCostMinor: 200000,
});

export interface CentreMonth {
  readonly sites: number;
  readonly revenueMinor: number;
  readonly siteCostsMinor: number;
  readonly totalCostsMinor: number;
  readonly afterCostsMinor: number;
  readonly annualisedMinor: number;
}

/** Yalnız SaaS abonelik ekonomisi; transfer operasyon gelirleri bilerek dahil değildir. */
export function centreMonth(sites: number, a: CentreAssumptions = DECK_V3_CENTRE): CentreMonth {
  if (!Number.isInteger(sites) || sites < 0) throw new RangeError("sites must be a non-negative integer");
  const revenue = sites * a.subscriptionMinor;
  const siteCosts = sites * a.siteCostMinor;
  const total = siteCosts + a.fixedCostMinor;
  return {
    sites,
    revenueMinor: revenue,
    siteCostsMinor: siteCosts,
    totalCostsMinor: total,
    afterCostsMinor: revenue - total,
    annualisedMinor: (revenue - total) * 12,
  };
}

/** Merkezin sabit giderini karşılayan en az ücretli site sayısı. */
export function centreBreakEvenSites(a: CentreAssumptions = DECK_V3_CENTRE): number {
  return breakEvenUnits(a.fixedCostMinor, a.subscriptionMinor - a.siteCostMinor);
}

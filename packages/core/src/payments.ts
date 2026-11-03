import type { PaymentMethod, PaymentStatus } from "./booking.ts";
import type { LedgerEntry, PartyRef } from "./ledger.ts";
import { money, type Currency, type Money } from "./money.ts";

// K15 (ÖNERİ, Owner onayı bekliyor) — Merkezi ve kayıtlı tahsilat, haftalık hesap kapanışı.
//
// Her rezervasyon için ayrı tutulur: müşterinin ödeyeceği toplam, alınan ön ödeme, kalan, tahsilatı
// yapan taraf, iade/iptal tutarları. Paylar (site / tedarikçi / Alanya Group) ledger.ts'de ayrı satırdır.
//
// Kurallar:
//  * Online kartla tahsilat yalnız MERKEZDEN (Alanya Group) geçer.
//  * Araçta nakit yalnız rezervasyonun izin verdiği bir yöntemse ve yalnız işi yapan tedarikçi tarafından alınır.
//  * Tahsilat kalan tutarı, iade tahsil edilmiş net tutarı aşamaz. Kayıtlar silinmez (yalnız eklenir).
//  * Haftalık kapanış her kayıt ve her tahsilatı TEK KEZ içerir; mükerrer komisyon/ödeme oluşmaz.
//  * Kapanış yalnız EKSTRE üretir. Canlı otomatik ödeme dağıtımı; tahsilatın hukuki muhatabı, faturalama
//    sorumluluğu ve ödeme kuruluşu sözleşmesi doğrulanmadan AÇILMAZ (bu modülde ödeme gönderen kod yok).

export interface PaymentEvent {
  readonly id: string;
  readonly bookingId: string;
  readonly kind: "collection" | "refund";
  readonly method: PaymentMethod;
  readonly amount: Money;
  /** Parayı fiilen alan (tahsilat) ya da geri ödeyen (iade) taraf. */
  readonly party: PartyRef;
  readonly at: string;
}

export interface PaymentSummary {
  readonly total: Money;
  readonly collected: Money;
  readonly refunded: Money;
  /** Net tahsil = tahsilat − iade. */
  readonly net: Money;
  readonly remaining: Money;
  readonly status: PaymentStatus;
}

export function paymentSummary(total: Money, events: readonly PaymentEvent[]): PaymentSummary {
  let collected = 0;
  let refunded = 0;
  for (const e of events) {
    if (e.amount.currency !== total.currency) throw new Error("payment currency mismatch");
    if (e.kind === "collection") collected += e.amount.amountMinor;
    else refunded += e.amount.amountMinor;
  }
  const net = collected - refunded;
  const status: PaymentStatus =
    net >= total.amountMinor && total.amountMinor > 0
      ? "paid"
      : net > 0
        ? "partially_paid"
        : refunded > 0
          ? "refunded"
          : "unpaid";
  return {
    total,
    collected: money(collected, total.currency),
    refunded: money(refunded, total.currency),
    net: money(net, total.currency),
    remaining: money(Math.max(0, total.amountMinor - net), total.currency),
    status,
  };
}

export type PaymentCheck =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "price_not_set"
        | "currency_mismatch"
        | "non_positive_amount"
        | "method_not_allowed_for_booking"
        | "online_payment_must_go_through_central"
        | "cash_only_by_assigned_supplier"
        | "exceeds_remaining"
        | "refund_exceeds_collected";
    };

export function checkPaymentEvent(
  booking: {
    readonly total: Money | undefined;
    readonly allowedMethods: readonly PaymentMethod[];
    readonly assignedCarrierId: string | undefined;
  },
  prior: readonly PaymentEvent[],
  e: Pick<PaymentEvent, "kind" | "method" | "amount" | "party">,
): PaymentCheck {
  if (!booking.total) return { ok: false, reason: "price_not_set" };
  if (e.amount.currency !== booking.total.currency) return { ok: false, reason: "currency_mismatch" };
  if (e.amount.amountMinor <= 0) return { ok: false, reason: "non_positive_amount" };
  if (!booking.allowedMethods.includes(e.method)) return { ok: false, reason: "method_not_allowed_for_booking" };
  if (e.method === "card_online" && e.party.kind !== "platform") {
    return { ok: false, reason: "online_payment_must_go_through_central" };
  }
  if (e.method === "cash_in_vehicle" && (e.party.kind !== "carrier" || e.party.id !== booking.assignedCarrierId)) {
    return { ok: false, reason: "cash_only_by_assigned_supplier" };
  }
  const s = paymentSummary(booking.total, prior);
  if (e.kind === "collection" && e.amount.amountMinor > s.remaining.amountMinor) {
    return { ok: false, reason: "exceeds_remaining" };
  }
  if (e.kind === "refund" && e.amount.amountMinor > s.net.amountMinor) {
    return { ok: false, reason: "refund_exceeds_collected" };
  }
  return { ok: true };
}

// ---- Haftalık hesap kapanışı ----

export interface Statement {
  readonly party: PartyRef;
  readonly currency: Currency;
  /** Bu kapanışa giren pay kayıtları (ters kayıtlar dahil). */
  readonly earnedMinor: number;
  /** Tarafın elinde kalan müşteri parası: aldığı tahsilat − yaptığı iade. */
  readonly heldMinor: number;
  /** earned − held. Pozitif: tarafa ödenecek. Negatif: taraf havuza ödeyecek. */
  readonly netMinor: number;
}

export interface WeeklyClosing {
  /** Pazartesi, yerel (Europe/Istanbul) tarih. */
  readonly weekStart: string;
  readonly periodEndUtc: string;
  readonly statements: readonly Statement[];
  /**
   * Para birimi başına: tahsil edilmiş ama henüz paya dönüşmemiş tutar (ör. teslim edilmemiş işin ön ödemesi).
   * Korunum: Σ net + unallocated = 0.
   */
  readonly unallocatedMinor: Readonly<Partial<Record<Currency, number>>>;
  readonly entryIds: readonly string[];
  readonly paymentIds: readonly string[];
  /** Kapanış yalnız ekstredir; ödeme gönderimi kapalıdır (K15). */
  readonly payoutExecution: "disabled_pending_legal_review";
}

const ISTANBUL_OFFSET = "+03:00"; // Türkiye 2016'dan beri yaz saati uygulamıyor.

export function weekEndUtc(weekStart: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) throw new RangeError("weekStart must be YYYY-MM-DD");
  const start = new Date(`${weekStart}T00:00:00${ISTANBUL_OFFSET}`);
  if (Number.isNaN(start.getTime())) throw new RangeError("invalid weekStart");
  // Pazartesi kontrolü yerel tarihe göre (UTC+3'te 00:00 → UTC'de önceki gün 21:00).
  const localDay = new Date(start.getTime() + 3 * 3600_000).getUTCDay();
  if (localDay !== 1) throw new RangeError("weekStart must be a Monday (Europe/Istanbul)");
  return new Date(start.getTime() + 7 * 24 * 3600_000).toISOString();
}

/**
 * Hafta sonuna kadar oluşmuş ve henüz hiçbir kapanışa girmemiş TÜM kayıtları kapatır (önceki haftadan
 * devredenler dahil). Daha önce kapanmış kayıt/tahsilat tekrar girmez.
 */
export function closeWeek(input: {
  readonly weekStart: string;
  readonly ledger: readonly LedgerEntry[];
  readonly payments: readonly PaymentEvent[];
  readonly closedEntryIds: ReadonlySet<string>;
  readonly closedPaymentIds: ReadonlySet<string>;
}): WeeklyClosing {
  const end = weekEndUtc(input.weekStart);
  const entries = input.ledger.filter((e) => e.createdAt < end && !input.closedEntryIds.has(e.id));
  const pays = input.payments.filter((p) => p.at < end && !input.closedPaymentIds.has(p.id));

  const rows = new Map<string, { party: PartyRef; currency: Currency; earned: number; held: number }>();
  const row = (party: PartyRef, currency: Currency) => {
    const key = `${party.kind}:${party.id}:${currency}`;
    let r = rows.get(key);
    if (!r) rows.set(key, (r = { party, currency, earned: 0, held: 0 }));
    return r;
  };
  const unallocated: Partial<Record<Currency, number>> = {};
  for (const e of entries) {
    row(e.party, e.amount.currency).earned += e.amount.amountMinor;
    unallocated[e.amount.currency] = (unallocated[e.amount.currency] ?? 0) - e.amount.amountMinor;
  }
  for (const p of pays) {
    const signed = p.kind === "collection" ? p.amount.amountMinor : -p.amount.amountMinor;
    row(p.party, p.amount.currency).held += signed;
    unallocated[p.amount.currency] = (unallocated[p.amount.currency] ?? 0) + signed;
  }
  const statements = [...rows.values()]
    .map((r) => ({ party: r.party, currency: r.currency, earnedMinor: r.earned, heldMinor: r.held, netMinor: r.earned - r.held }))
    .sort((a, b) => `${a.party.kind}:${a.party.id}:${a.currency}`.localeCompare(`${b.party.kind}:${b.party.id}:${b.currency}`));
  return {
    weekStart: input.weekStart,
    periodEndUtc: end,
    statements,
    unallocatedMinor: unallocated,
    entryIds: entries.map((e) => e.id),
    paymentIds: pays.map((p) => p.id),
    payoutExecution: "disabled_pending_legal_review",
  };
}

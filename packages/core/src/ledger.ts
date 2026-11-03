import type { BookingStatus, PaymentStatus } from "./booking.ts";
import { splitShuttleRevenue, type SplitPolicy } from "./commission.ts";
import { money, negate, type Money } from "./money.ts";
import { splitPassToNetwork } from "./pass.ts";

// Defter (ledger) kuralları — AGOS değişmezleri:
// * Finans kaydı değişmez ve silinmez; düzeltme ayrı (ters) kayıtla yapılır.
// * Komisyon/pay ancak yolculuk TAMAMLANMIŞ (delivered) ve TAHSİL EDİLMİŞ (paid) ise kazanılır.
// * Test ve mükerrer rezervasyon pay doğurmaz.
// * Para birimleri karışmaz; bakiye para birimi başına ayrıdır.

export type PartyRef =
  | { readonly kind: "carrier"; readonly id: string }
  | { readonly kind: "partner"; readonly id: string }
  | { readonly kind: "platform"; readonly id: "central" };

export interface LedgerEntry {
  readonly id: string;
  readonly bookingId: string;
  readonly party: PartyRef;
  readonly amount: Money;
  readonly kind: "shuttle_share" | "pass_share" | "reversal";
  readonly policyId: string;
  readonly createdAt: string;
  readonly reversesEntryId?: string;
}

export interface EarnableShuttleBooking {
  readonly id: string;
  readonly status: BookingStatus;
  readonly paymentStatus: PaymentStatus;
  readonly isTest: boolean;
  readonly isDuplicate: boolean;
  /** Kaynak site bir partner sitesiyse partner id; Alanya Group'un kendi sitesiyse yok. */
  readonly sourcePartnerId?: string;
  /** Pay matrahı. AÇIK KARAR: KDV/indirim/iade sonrası tutar — çağıran belirler. */
  readonly shareBase: Money;
}

export type EarnResult =
  | { ok: true; entries: LedgerEntry[] }
  | { ok: false; reason: "not_delivered" | "not_paid" | "test_booking" | "duplicate_booking" | "no_carrier" };

export function earnShuttleShares(
  booking: EarnableShuttleBooking,
  carrierPayeeId: string | undefined,
  policy: SplitPolicy,
  ctx: { now: string; newId: () => string },
): EarnResult {
  if (booking.isTest) return { ok: false, reason: "test_booking" };
  if (booking.isDuplicate) return { ok: false, reason: "duplicate_booking" };
  if (booking.status !== "delivered") return { ok: false, reason: "not_delivered" };
  if (booking.paymentStatus !== "paid") return { ok: false, reason: "not_paid" };
  if (!carrierPayeeId) return { ok: false, reason: "no_carrier" };

  const split = splitShuttleRevenue(booking.shareBase, policy, booking.sourcePartnerId !== undefined);
  const mk = (party: PartyRef, amount: Money): LedgerEntry => ({
    id: ctx.newId(),
    bookingId: booking.id,
    party,
    amount,
    kind: "shuttle_share",
    policyId: split.policyId,
    createdAt: ctx.now,
  });
  const entries = [mk({ kind: "carrier", id: carrierPayeeId }, split.carrier)];
  if (booking.sourcePartnerId !== undefined) {
    entries.push(mk({ kind: "partner", id: booking.sourcePartnerId }, split.partner));
  }
  entries.push(mk({ kind: "platform", id: "central" }, split.platform));
  return { ok: true, entries };
}

export interface EarnablePassBooking {
  readonly id: string;
  readonly status: BookingStatus;
  readonly paymentStatus: PaymentStatus;
  readonly isTest: boolean;
  readonly isDuplicate: boolean;
  readonly sourcePartnerId?: string;
  /** Rezervasyonda dondurulmuş satış fiyatı ve pass bedeli. */
  readonly sale: Money;
  readonly pass: Money;
  readonly passPolicyId: string;
}

export type EarnPassResult =
  | { ok: true; entries: LedgerEntry[] }
  | {
      ok: false;
      reason:
        | "not_delivered"
        | "not_paid"
        | "test_booking"
        | "duplicate_booking"
        | "payout_exceeds_pass"
        | "currency_mismatch"
        | "negative_payout";
    };

/**
 * Özel/VIP pass modeli: site sahibi = satış − pass; araç = atamada belirlenen hak ediş (≤ pass);
 * merkez = pass − araç hak edişi. Kaynak AG'nin kendi sitesiyse site katkısı merkeze yazılır.
 */
export function earnPassShares(
  booking: EarnablePassBooking,
  carrierPayeeId: string,
  carrierPayout: Money,
  ctx: { now: string; newId: () => string },
): EarnPassResult {
  if (booking.isTest) return { ok: false, reason: "test_booking" };
  if (booking.isDuplicate) return { ok: false, reason: "duplicate_booking" };
  if (booking.status !== "delivered") return { ok: false, reason: "not_delivered" };
  if (booking.paymentStatus !== "paid") return { ok: false, reason: "not_paid" };
  const net = splitPassToNetwork(booking.pass, carrierPayout);
  if (!net.ok) return net;
  const partnerPart = money(booking.sale.amountMinor - booking.pass.amountMinor, booking.sale.currency);
  const mk = (party: PartyRef, amount: Money): LedgerEntry => ({
    id: ctx.newId(),
    bookingId: booking.id,
    party,
    amount,
    kind: "pass_share",
    policyId: booking.passPolicyId,
    createdAt: ctx.now,
  });
  const entries = [mk({ kind: "carrier", id: carrierPayeeId }, net.carrier)];
  if (booking.sourcePartnerId !== undefined) {
    entries.push(mk({ kind: "partner", id: booking.sourcePartnerId }, partnerPart));
    entries.push(mk({ kind: "platform", id: "central" }, net.platform));
  } else {
    entries.push(mk({ kind: "platform", id: "central" }, money(net.platform.amountMinor + partnerPart.amountMinor, net.platform.currency)));
  }
  return { ok: true, entries };
}

/** Ödeme sonrası iptal / iade / chargeback: her satır için tek ters kayıt. Zaten ters çevrilmiş satır atlanır. */
export function reverseEntries(
  all: readonly LedgerEntry[],
  bookingId: string,
  ctx: { now: string; newId: () => string },
): LedgerEntry[] {
  const reversed = new Set(all.filter((e) => e.kind === "reversal").map((e) => e.reversesEntryId));
  return all
    .filter((e) => e.bookingId === bookingId && e.kind !== "reversal" && !reversed.has(e.id))
    .map((e) => ({
      id: ctx.newId(),
      bookingId,
      party: e.party,
      amount: negate(e.amount),
      kind: "reversal" as const,
      policyId: e.policyId,
      createdAt: ctx.now,
      reversesEntryId: e.id,
    }));
}

export interface BalanceRow {
  readonly party: PartyRef;
  readonly currency: Money["currency"];
  readonly amountMinor: number;
}

export function balances(entries: readonly LedgerEntry[]): BalanceRow[] {
  const map = new Map<string, BalanceRow>();
  for (const e of entries) {
    const key = `${e.party.kind}:${e.party.id}:${e.amount.currency}`;
    const prev = map.get(key);
    map.set(key, {
      party: e.party,
      currency: e.amount.currency,
      amountMinor: (prev?.amountMinor ?? 0) + e.amount.amountMinor,
    });
  }
  return [...map.values()].sort((a, b) =>
    `${a.party.kind}:${a.party.id}:${a.currency}`.localeCompare(`${b.party.kind}:${b.party.id}:${b.currency}`),
  );
}

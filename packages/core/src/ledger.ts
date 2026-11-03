import type { BookingStatus, PaymentStatus } from "./booking.ts";
import { splitShuttleRevenue, type SplitPolicy } from "./commission.ts";
import { money, negate, type Money } from "./money.ts";

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
  /** Pay matrahı = rezervasyonun dondurulmuş satış tutarı (Owner kararı 03.11.2026). */
  readonly shareBase: Money;
}

export interface ShuttleSplitPolicies {
  /** Uydu site kaynaklı (70/20/10, KESİN). */
  readonly partnerSourced: SplitPolicy;
  /** Alanya Group'un kendi sitesinden (K4 önerisi 90/0/10; onaylanana kadar otomatik pay yok). */
  readonly direct: SplitPolicy;
}

export type EarnResult =
  | { ok: true; entries: LedgerEntry[] }
  | {
      ok: false;
      reason:
        | "not_delivered"
        | "not_paid"
        | "test_booking"
        | "duplicate_booking"
        | "no_carrier"
        | "split_policy_not_approved";
    };

export function earnShuttleShares(
  booking: EarnableShuttleBooking,
  carrierPayeeId: string | undefined,
  policies: ShuttleSplitPolicies,
  ctx: { now: string; newId: () => string },
): EarnResult {
  if (booking.isTest) return { ok: false, reason: "test_booking" };
  if (booking.isDuplicate) return { ok: false, reason: "duplicate_booking" };
  if (booking.status !== "delivered") return { ok: false, reason: "not_delivered" };
  if (booking.paymentStatus !== "paid") return { ok: false, reason: "not_paid" };
  if (!carrierPayeeId) return { ok: false, reason: "no_carrier" };

  const policy = booking.sourcePartnerId !== undefined ? policies.partnerSourced : policies.direct;
  if (policy.status !== "approved") return { ok: false, reason: "split_policy_not_approved" };
  if (booking.sourcePartnerId === undefined && policy.partnerBps !== 0) {
    throw new Error(`policy ${policy.id} has a site share but the booking has no source site`);
  }
  const split = splitShuttleRevenue(booking.shareBase, policy);
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
  | { ok: false; reason: "not_delivered" | "not_paid" | "test_booking" | "duplicate_booking" | "no_carrier" };

/**
 * K12 Model B (NETWORK_PASS): tedarikçi = pass bedelinin TAMAMI; uydu site = satış − pass;
 * Alanya Group ek işlem komisyonu = 0 € (satır yazılmaz).
 * Kaynak Alanya Group'un kendi sitesiyse satıcı Alanya Group'tur; satış − pass satıcı marjı olarak
 * Alanya Group satırına yazılır (komisyon değildir — bkz. KARARLAR K19).
 */
export function earnPassShares(
  booking: EarnablePassBooking,
  carrierPayeeId: string | undefined,
  ctx: { now: string; newId: () => string },
): EarnPassResult {
  if (booking.isTest) return { ok: false, reason: "test_booking" };
  if (booking.isDuplicate) return { ok: false, reason: "duplicate_booking" };
  if (booking.status !== "delivered") return { ok: false, reason: "not_delivered" };
  if (booking.paymentStatus !== "paid") return { ok: false, reason: "not_paid" };
  if (!carrierPayeeId) return { ok: false, reason: "no_carrier" };
  const sellerPart = money(booking.sale.amountMinor - booking.pass.amountMinor, booking.sale.currency);
  const mk = (party: PartyRef, amount: Money): LedgerEntry => ({
    id: ctx.newId(),
    bookingId: booking.id,
    party,
    amount,
    kind: "pass_share",
    policyId: booking.passPolicyId,
    createdAt: ctx.now,
  });
  return {
    ok: true,
    entries: [
      mk({ kind: "carrier", id: carrierPayeeId }, booking.pass),
      booking.sourcePartnerId !== undefined
        ? mk({ kind: "partner", id: booking.sourcePartnerId }, sellerPart)
        : mk({ kind: "platform", id: "central" }, sellerPart),
    ],
  };
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

import { SHUTTLE_SPLIT_V1, splitShuttleRevenue, type SplitPolicy } from "./commission.ts";
import { money, type Currency } from "./money.ts";

// =====================================================================================================
// K15 — OWNER KARARI (KESİN TİCARİ KARAR): SUPPLIER COLLECTION + WEEKLY SETTLEMENT
// =====================================================================================================
// Shuttle: müşteri ödemesini doğrudan hizmeti gerçekleştiren TEDARİKÇİ tahsil eder.
//   Satış kanalı (site) %20 · AGOS sistem ve yönetim %10 · Tedarikçi %70 — tek kaynak: SHUTTLE_SPLIT_V1.
//   alanyagroup.com ve bütün uydu siteler aynı kurala tabidir.
//   Site işi kendi aracıyla yaparsa: %90 kendisinde, %10 AGOS'a; kendi kendine satış komisyonu oluşmaz.
// Private / VIP: sabit komisyon YOK. Tedarikçi hak edişini siteyi getiren site belirler.
//   Müşteri tedarikçiye öderse tedarikçi (satış − hak ediş) farkını siteye aktarır. AGOS ek komisyon almaz.
// Hesap dönemi: Pazartesi 00:00 – Pazar 23:59, Europe/Istanbul. Önerilen ödeme son tarihi: Salı 18:00.
//
// Bu modül yalnız HESAPLAR ve RAPORLAR. Para göndermez, borç tahsil etmez (canlı işlem Owner GO ister).
// Tüm tutarlar tam sayı cent (minor unit).
// =====================================================================================================

export const AGOS_PARTY_ID = "agos";
export type ServiceType = "shuttle" | "private" | "vip";
/** Tahsilatı tedarikçi (ya da private/VIP'de site) yapar; merkezden online tahsilat yok. */
export type CollectionMethod = "cash" | "card_pos" | "bank_transfer";
export const COLLECTION_METHODS: readonly CollectionMethod[] = ["cash", "card_pos", "bank_transfer"];
export type Collector = "supplier" | "site";
export type CollectionStatus = "pending" | "collected" | "short_collected" | "not_collected" | "refunded";
export type SettlementStatus = "open" | "included" | "exception" | "adjusted";

/** Owner'ın istediği rezervasyon alanları (snake_case, rapor ve DB ile birebir). */
export interface SettlementLine {
  readonly booking_id: string;
  readonly booking_ref: string;
  readonly selling_site_id: string;
  /** Site sahibinin taraf kimliği (komisyon alacaklısı). */
  readonly selling_party_id: string;
  readonly supplier_id: string;
  readonly service_type: ServiceType;
  readonly final_booking_price: number;
  readonly currency: Currency;
  readonly collection_method: CollectionMethod | null;
  readonly collector: Collector;
  readonly collection_status: CollectionStatus;
  readonly collected_amount: number;
  readonly completed_at: string | null;
  readonly cancelled: boolean;
  readonly cancelled_at: string | null;
  readonly disputed: boolean;
  readonly disputed_at: string | null;
  readonly dispute_reason: string | null;
  readonly self_supplied: boolean;
  readonly site_commission_amount: number;
  readonly agos_fee_amount: number;
  readonly supplier_entitlement: number;
  readonly supplier_payment_to_site: number;
  readonly supplier_payment_to_agos: number;
  /** Private/VIP'de müşteri siteye ödediyse: site → tedarikçi hak edişi. Shuttle'da her zaman 0. */
  readonly site_payment_to_supplier: number;
  readonly policy_id: string;
  readonly settlement_week_id: string | null;
  readonly settlement_status: SettlementStatus;
  readonly payment_reference: string | null;
  readonly invoice_reference: string | null;
  readonly adjustment_reference: string | null;
}

export interface SplitAmounts {
  readonly self_supplied: boolean;
  readonly site_commission_amount: number;
  readonly agos_fee_amount: number;
  readonly supplier_entitlement: number;
  readonly policy_id: string;
}

/** Shuttle payı. Tek oran kaynağı SHUTTLE_SPLIT_V1 (2000 / 1000 / 7000 baz puan). */
export function shuttleSplit(
  finalMinor: number,
  currency: Currency,
  sellingPartyId: string,
  supplierId: string,
  policy: SplitPolicy = SHUTTLE_SPLIT_V1,
): SplitAmounts {
  const s = splitShuttleRevenue(money(finalMinor, currency), policy);
  const self = sellingPartyId === supplierId;
  return self
    ? {
        // Kendi aracıyla: %90 sitede kalır, %10 AGOS'a; kendine komisyon satırı oluşmaz.
        self_supplied: true,
        site_commission_amount: 0,
        agos_fee_amount: s.platform.amountMinor,
        supplier_entitlement: s.carrier.amountMinor + s.partner.amountMinor,
        policy_id: policy.id,
      }
    : {
        self_supplied: false,
        site_commission_amount: s.partner.amountMinor,
        agos_fee_amount: s.platform.amountMinor,
        supplier_entitlement: s.carrier.amountMinor,
        policy_id: policy.id,
      };
}

/** Private/VIP: hak edişi site belirler; AGOS ücreti 0; kendi aracıyla ise hak ediş = satış. */
export function privateSplit(
  finalMinor: number,
  supplierEntitlementMinor: number,
  sellingPartyId: string,
  supplierId: string,
): SplitAmounts {
  const self = sellingPartyId === supplierId;
  if (!self && (!Number.isSafeInteger(supplierEntitlementMinor) || supplierEntitlementMinor < 0 || supplierEntitlementMinor > finalMinor)) {
    throw new RangeError("supplier entitlement must be between 0 and the final booking price");
  }
  const entitlement = self ? finalMinor : supplierEntitlementMinor;
  return {
    self_supplied: self,
    site_commission_amount: finalMinor - entitlement,
    agos_fee_amount: 0,
    supplier_entitlement: entitlement,
    policy_id: self ? "private-self-supplied" : "private-site-set-entitlement",
  };
}

/** Kim kime ne öder (tahsil edenin elinde kalan para dağıtımı). */
export function transfers(
  split: SplitAmounts,
  finalMinor: number,
  collector: Collector,
): Pick<SettlementLine, "supplier_payment_to_site" | "supplier_payment_to_agos" | "site_payment_to_supplier"> {
  if (collector === "supplier") {
    return {
      supplier_payment_to_site: split.site_commission_amount,
      supplier_payment_to_agos: split.agos_fee_amount,
      site_payment_to_supplier: 0,
    };
  }
  // Yalnız private/VIP'de site tahsil edebilir; shuttle'da tahsilatı tedarikçi yapar (çağıran engeller).
  if (split.agos_fee_amount !== 0) throw new Error("site collection is only allowed for private/VIP (no AGOS fee)");
  return { supplier_payment_to_site: 0, supplier_payment_to_agos: 0, site_payment_to_supplier: finalMinor - split.site_commission_amount };
}

// ---- Hafta ----

const IST_OFFSET_MS = 3 * 3600_000; // Europe/Istanbul: UTC+3, yaz saati yok (2016'dan beri).

function istanbulDate(iso: string): Date {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) throw new RangeError(`invalid instant ${iso}`);
  return new Date(t + IST_OFFSET_MS); // UTC alanları = İstanbul yerel saati
}

/** ISO hafta kimliği (İstanbul yerel saatine göre), ör. "2026-W45". Hafta Pazartesi başlar. */
export function settlementWeekId(iso: string): string {
  const d = istanbulDate(iso);
  const day = (d.getUTCDay() + 6) % 7; // Pazartesi = 0
  const thursday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day + 3));
  const year = thursday.getUTCFullYear();
  const week = 1 + Math.floor((thursday.getTime() - Date.UTC(year, 0, 1)) / (7 * 86400_000));
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export interface WeekBounds {
  readonly week_id: string;
  /** Pazartesi 00:00 İstanbul (UTC olarak). */
  readonly start_utc: string;
  /** Sonraki Pazartesi 00:00 İstanbul (hariç) = Pazar 23:59:59 dahil. */
  readonly end_utc: string;
  /** Önerilen ödeme son tarihi: kapanışı izleyen Salı 18:00 İstanbul. */
  readonly payment_due_utc: string;
}

export function weekBounds(weekId: string): WeekBounds {
  const m = /^(\d{4})-W(\d{2})$/.exec(weekId);
  if (!m) throw new RangeError("week id must look like 2026-W45");
  const year = Number(m[1]);
  const week = Number(m[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const mondayW1 = Date.UTC(year, 0, 4 - ((jan4.getUTCDay() + 6) % 7));
  const startLocal = mondayW1 + (week - 1) * 7 * 86400_000;
  const start = startLocal - IST_OFFSET_MS;
  const end = start + 7 * 86400_000;
  const due = end + 86400_000 + 18 * 3600_000; // Salı 18:00
  if (settlementWeekId(new Date(start).toISOString()) !== weekId) throw new RangeError(`week ${weekId} does not exist`);
  return {
    week_id: weekId,
    start_utc: new Date(start).toISOString(),
    end_utc: new Date(end).toISOString(),
    payment_due_utc: new Date(due).toISOString(),
  };
}

// ---- Haftalık kapanış ----

export interface BankReceipt {
  readonly id: string;
  /** Hangi haftanın borcu için (dekont açıklamasındaki hesap haftası). */
  readonly week_id: string;
  readonly payer_id: string;
  readonly payee_id: string;
  readonly amount: number;
  readonly currency: Currency;
  /** Banka dekont numarası / referansı. */
  readonly bank_reference: string;
  readonly paid_at: string;
}

/** Eski haftaya dokunmadan, iade/düzeltme için açılan hareket (ör. iade sonrası komisyon iadesi). */
export interface Adjustment {
  readonly id: string;
  readonly booking_id: string;
  /** Düzeltmenin yazıldığı (yeni) hafta. */
  readonly week_id: string;
  /** Düzeltilen orijinal hafta. */
  readonly original_week_id: string;
  readonly debtor_id: string;
  readonly creditor_id: string;
  /** Negatif: borç azalır (alacaklı geri öder / mahsup). */
  readonly amount: number;
  readonly currency: Currency;
  readonly reason: string;
  readonly adjustment_reference: string;
}

export type ExceptionReason =
  | "cancelled"
  | "cancelled_after_collection"
  | "refunded"
  | "short_collected"
  | "not_collected"
  | "disputed"
  | "completed_without_collection_record";

export interface ExceptionItem {
  readonly booking_id: string;
  readonly booking_ref: string;
  readonly supplier_id: string;
  readonly selling_site_id: string;
  readonly reason: ExceptionReason;
  readonly final_booking_price: number;
  readonly collected_amount: number;
  readonly currency: Currency;
  readonly note: string | null;
}

export interface Obligation {
  readonly week_id: string;
  readonly debtor_id: string;
  readonly creditor_id: string;
  readonly kind: "site_commission" | "agos_fee" | "supplier_entitlement";
  readonly currency: Currency;
  readonly amount: number;
  readonly paid: number;
  readonly outstanding: number;
  readonly status: "paid" | "partially_paid" | "unpaid" | "overpaid" | "nothing_due";
  readonly late: boolean;
  readonly receipt_ids: readonly string[];
  /** Eşleşen dekontların banka referansları. */
  readonly receipt_refs: readonly string[];
  readonly booking_ids: readonly string[];
  readonly adjustment_ids: readonly string[];
}

export interface WeeklyReport {
  readonly week: WeekBounds;
  readonly generated_at: string;
  /** Bu kapanışta hesaplanan satırlar (tamamlanmış + tam tahsil edilmiş). */
  readonly included: readonly SettlementLine[];
  readonly exceptions: readonly ExceptionItem[];
  readonly adjustments: readonly Adjustment[];
  readonly obligations: readonly Obligation[];
  readonly unmatched_receipts: readonly BankReceipt[];
  readonly supplier_statements: readonly SupplierStatement[];
  readonly site_receivables: readonly SiteReceivable[];
  readonly agos_fees: AgosFeeReport;
  readonly debts_and_disputes: readonly DebtOrDispute[];
  readonly payout_execution: "disabled_owner_go_required";
}

export interface SupplierStatement {
  readonly supplier_id: string;
  readonly currency: Currency;
  readonly jobs: number;
  readonly collected: number;
  readonly entitlement: number;
  readonly owes_sites: ReadonlyArray<{ readonly site_party_id: string; readonly amount: number; readonly paid: number }>;
  readonly owes_agos: number;
  readonly paid_agos: number;
  readonly adjustments: number;
  readonly total_owed: number;
  readonly total_paid: number;
  readonly outstanding: number;
  readonly status: "settled" | "open" | "late";
}

export interface SiteReceivable {
  readonly site_party_id: string;
  readonly currency: Currency;
  readonly by_supplier: ReadonlyArray<{ readonly supplier_id: string; readonly amount: number; readonly paid: number }>;
  readonly total: number;
  readonly received: number;
  readonly outstanding: number;
}

export interface AgosFeeReport {
  readonly by_supplier: ReadonlyArray<{ readonly supplier_id: string; readonly currency: Currency; readonly amount: number; readonly paid: number }>;
  readonly total_by_currency: Readonly<Partial<Record<Currency, number>>>;
  readonly received_by_currency: Readonly<Partial<Record<Currency, number>>>;
}

export interface DebtOrDispute {
  /** Borç kalemlerinde hangi tür borç olduğu (site komisyonu / AGOS payı / hak ediş). */
  readonly obligation_kind: Obligation["kind"] | null;
  readonly late: boolean;
  readonly kind: "late_payment" | "missing_payment" | "partial_payment" | "overpayment" | "unmatched_receipt" | "booking_dispute";
  readonly debtor_id: string | null;
  readonly creditor_id: string | null;
  readonly amount: number;
  readonly currency: Currency;
  readonly detail: string;
}

/** Çözülene kadar her haftanın raporunda kalan istisnalar. */
export const OPEN_EXCEPTION_REASONS: readonly ExceptionReason[] = [
  "cancelled_after_collection",
  "short_collected",
  "not_collected",
  "completed_without_collection_record",
  "disputed",
];

/** Bir rezervasyon için istisna nedeni (yoksa null → hesaplanabilir). */
export function exceptionReason(l: SettlementLine): ExceptionReason | null {
  if (l.disputed) return "disputed";
  if (l.cancelled) return l.collected_amount > 0 ? "cancelled_after_collection" : "cancelled";
  if (l.collection_status === "refunded") return "refunded";
  if (l.completed_at === null) return null; // henüz tamamlanmadı: kapsam dışı, istisna değil
  if (l.collection_status === "pending") return "completed_without_collection_record";
  if (l.collection_status === "not_collected") return "not_collected";
  if (l.collection_status === "short_collected" || l.collected_amount < l.final_booking_price) return "short_collected";
  return null;
}

function inWeek(iso: string | null, w: WeekBounds): boolean {
  return iso !== null && iso >= w.start_utc && iso < w.end_utc;
}

/**
 * Haftalık kapanış. Kurallar:
 *  - Hesaplanan: bu haftada tamamlanmış (completed_at) VE tam tahsil edilmiş, istisnası olmayan, daha önce hiçbir
 *    haftaya girmemiş satırlar. Bir satır yalnız bir haftaya girer (settlement_week_id bir kez yazılır).
 *  - İstisna listesi: iptal, iade, eksik/yok tahsilat, itiraz — otomatik hesaplanmaz.
 *  - Düzeltmeler bu haftaya yazılır; eski hafta değişmez.
 *  - Dekontlar (receipts) aynı hafta + ödeyen + alacaklı + para birimiyle eşleşir; eşleşmeyen dekont listelenir.
 *  - Ödeme son tarihi (Salı 18:00) geçtiyse ödenmemiş borç "late".
 */
export function weeklyReport(input: {
  readonly weekId: string;
  readonly now: string;
  readonly lines: readonly SettlementLine[];
  readonly adjustments: readonly Adjustment[];
  readonly receipts: readonly BankReceipt[];
  /**
   * Kapanmış hafta: hesaplanan satırlar ve istisnalar kapanış anındaki haliyle kullanılır (kural 8);
   * dekont eşleşmesi, gecikme ve düzeltmeler güncel verilerle hesaplanır.
   */
  readonly frozen?: { readonly included: readonly SettlementLine[]; readonly exceptions: readonly ExceptionItem[] };
}): WeeklyReport {
  const week = weekBounds(input.weekId);
  const late = input.now >= week.payment_due_utc;

  const included: SettlementLine[] = input.frozen ? [...input.frozen.included] : [];
  const exceptions: ExceptionItem[] = input.frozen ? [...input.frozen.exceptions] : [];
  for (const l of input.frozen ? [] : input.lines) {
    const reason = exceptionReason(l);
    const eventAt = l.disputed_at ?? l.cancelled_at ?? l.completed_at;
    const settledElsewhere = l.settlement_week_id !== null && l.settlement_week_id !== week.week_id;
    if (reason !== null) {
      // Çözülene kadar her hafta listede kalan açık istisnalar; para hareketi olmayan iptal ve
      // tamamlanmış iade yalnız olduğu hafta listelenir. Daha önce hesaplanmış işe sonradan gelen
      // itiraz da (düzeltme gerekebilir) itiraz haftasında listelenir.
      const carried = OPEN_EXCEPTION_REASONS.includes(reason) && !settledElsewhere;
      const happenedThisWeek = inWeek(eventAt, week);
      if (happenedThisWeek || (carried && eventAt !== null && eventAt < week.end_utc)) {
        exceptions.push({
          booking_id: l.booking_id,
          booking_ref: l.booking_ref,
          supplier_id: l.supplier_id,
          selling_site_id: l.selling_site_id,
          reason,
          final_booking_price: l.final_booking_price,
          collected_amount: l.collected_amount,
          currency: l.currency,
          note: l.dispute_reason,
        });
      }
      continue;
    }
    if (settledElsewhere) continue; // başka haftada hesaplandı: ikinci kez hesaplanmaz
    if (l.completed_at !== null && (inWeek(l.completed_at, week) || l.settlement_week_id === week.week_id)) {
      included.push({ ...l, settlement_week_id: week.week_id, settlement_status: "included" });
    }
  }
  const adjustments = input.adjustments.filter((a) => a.week_id === week.week_id);

  // Borçlar: debtor → creditor, tür bazında.
  type Acc = { debtor: string; creditor: string; kind: Obligation["kind"]; currency: Currency; amount: number; bookings: Set<string>; adj: Set<string> };
  const acc = new Map<string, Acc>();
  const add = (debtor: string, creditor: string, kind: Obligation["kind"], currency: Currency, amount: number, booking?: string, adj?: string) => {
    if (amount === 0 && !adj) return;
    const key = `${debtor}|${creditor}|${kind}|${currency}`;
    let a = acc.get(key);
    if (!a) acc.set(key, (a = { debtor, creditor, kind, currency, amount: 0, bookings: new Set(), adj: new Set() }));
    a.amount += amount;
    if (booking) a.bookings.add(booking);
    if (adj) a.adj.add(adj);
  };
  for (const l of included) {
    add(l.supplier_id, l.selling_party_id, "site_commission", l.currency, l.supplier_payment_to_site, l.booking_id);
    add(l.supplier_id, AGOS_PARTY_ID, "agos_fee", l.currency, l.supplier_payment_to_agos, l.booking_id);
    add(l.selling_party_id, l.supplier_id, "supplier_entitlement", l.currency, l.site_payment_to_supplier, l.booking_id);
  }
  for (const a of adjustments) {
    const kind: Obligation["kind"] = a.creditor_id === AGOS_PARTY_ID ? "agos_fee" : "site_commission";
    add(a.debtor_id, a.creditor_id, kind, a.currency, a.amount, undefined, a.id);
  }

  // Dekont eşleştirme: aynı hafta + ödeyen + alacaklı + para birimi; bir alacaklıya birden çok tür borç varsa
  // önce site komisyonu, sonra AGOS ücreti (alacaklı farklı olduğundan pratikte çakışmaz).
  const weekReceipts = input.receipts.filter((r) => r.week_id === week.week_id);
  const usedReceipts = new Set<string>();
  const obligations: Obligation[] = [...acc.values()]
    .sort((x, y) => `${x.debtor}|${x.creditor}|${x.kind}`.localeCompare(`${y.debtor}|${y.creditor}|${y.kind}`))
    .map((a) => {
      const rs = weekReceipts.filter(
        (r) => r.payer_id === a.debtor && r.payee_id === a.creditor && r.currency === a.currency && !usedReceipts.has(r.id),
      );
      rs.forEach((r) => usedReceipts.add(r.id));
      const paid = rs.reduce((s, r) => s + r.amount, 0);
      const outstanding = a.amount - paid;
      const status: Obligation["status"] =
        a.amount <= 0 && paid === 0 ? "nothing_due" : outstanding === 0 ? "paid" : outstanding < 0 ? "overpaid" : paid > 0 ? "partially_paid" : "unpaid";
      return {
        week_id: week.week_id,
        debtor_id: a.debtor,
        creditor_id: a.creditor,
        kind: a.kind,
        currency: a.currency,
        amount: a.amount,
        paid,
        outstanding,
        status,
        late: late && outstanding > 0,
        receipt_ids: rs.map((r) => r.id),
        receipt_refs: rs.map((r) => r.bank_reference),
        booking_ids: [...a.bookings],
        adjustment_ids: [...a.adj],
      };
    });
  const unmatched = weekReceipts.filter((r) => !usedReceipts.has(r.id));

  // payment_reference: bu satırın tedarikçisinin, satırın alacaklılarına (site / AGOS) yaptığı ödemelerin dekontları.
  for (let i = 0; i < included.length; i++) {
    const l = included[i]!;
    const refs = obligations
      .filter((o) => o.debtor_id === l.supplier_id && (o.creditor_id === l.selling_party_id || o.creditor_id === AGOS_PARTY_ID) && o.booking_ids.includes(l.booking_id))
      .flatMap((o) => o.receipt_refs);
    included[i] = { ...l, payment_reference: refs.length ? refs.join(",") : null };
  }

  // Tedarikçi ekstreleri
  const suppliers = new Map<string, SettlementLine[]>();
  for (const l of included) {
    const k = `${l.supplier_id}|${l.currency}`;
    suppliers.set(k, [...(suppliers.get(k) ?? []), l]);
  }
  for (const o of obligations) {
    const k = `${o.debtor_id}|${o.currency}`;
    if (o.kind !== "supplier_entitlement" && !suppliers.has(k)) suppliers.set(k, []);
  }
  const supplier_statements: SupplierStatement[] = [...suppliers.entries()]
    .map(([k, ls]) => {
      const [supplier_id, currency] = k.split("|") as [string, Currency];
      const mine = obligations.filter((o) => o.debtor_id === supplier_id && o.currency === currency && o.kind !== "supplier_entitlement");
      const owesSites = mine.filter((o) => o.kind === "site_commission");
      const agos = mine.filter((o) => o.kind === "agos_fee");
      const adjTotal = adjustments.filter((a) => a.debtor_id === supplier_id && a.currency === currency).reduce((s, a) => s + a.amount, 0);
      const total_owed = mine.reduce((s, o) => s + o.amount, 0);
      const total_paid = mine.reduce((s, o) => s + o.paid, 0);
      const outstanding = total_owed - total_paid;
      return {
        supplier_id,
        currency,
        jobs: ls.length,
        collected: ls.reduce((s, l) => s + l.collected_amount, 0),
        entitlement: ls.reduce((s, l) => s + l.supplier_entitlement, 0),
        owes_sites: owesSites.map((o) => ({ site_party_id: o.creditor_id, amount: o.amount, paid: o.paid })),
        owes_agos: agos.reduce((s, o) => s + o.amount, 0),
        paid_agos: agos.reduce((s, o) => s + o.paid, 0),
        adjustments: adjTotal,
        total_owed,
        total_paid,
        outstanding,
        status: outstanding <= 0 ? ("settled" as const) : late ? ("late" as const) : ("open" as const),
      };
    })
    .sort((a, b) => a.supplier_id.localeCompare(b.supplier_id));

  // Site komisyon alacakları
  const siteMap = new Map<string, Obligation[]>();
  for (const o of obligations.filter((o) => o.kind === "site_commission")) {
    const k = `${o.creditor_id}|${o.currency}`;
    siteMap.set(k, [...(siteMap.get(k) ?? []), o]);
  }
  const site_receivables: SiteReceivable[] = [...siteMap.entries()]
    .map(([k, os]) => {
      const [site_party_id, currency] = k.split("|") as [string, Currency];
      const total = os.reduce((s, o) => s + o.amount, 0);
      const received = os.reduce((s, o) => s + o.paid, 0);
      return {
        site_party_id,
        currency,
        by_supplier: os.map((o) => ({ supplier_id: o.debtor_id, amount: o.amount, paid: o.paid })),
        total,
        received,
        outstanding: total - received,
      };
    })
    .sort((a, b) => a.site_party_id.localeCompare(b.site_party_id));

  // AGOS sistem payları
  const agosOs = obligations.filter((o) => o.kind === "agos_fee");
  const total_by_currency: Partial<Record<Currency, number>> = {};
  const received_by_currency: Partial<Record<Currency, number>> = {};
  for (const o of agosOs) {
    total_by_currency[o.currency] = (total_by_currency[o.currency] ?? 0) + o.amount;
    received_by_currency[o.currency] = (received_by_currency[o.currency] ?? 0) + o.paid;
  }

  // Borç ve ihtilaf listesi
  const debts: DebtOrDispute[] = [];
  for (const o of obligations) {
    if (o.status === "overpaid") {
      debts.push({ kind: "overpayment", obligation_kind: o.kind, late: false, debtor_id: o.debtor_id, creditor_id: o.creditor_id, amount: -o.outstanding, currency: o.currency, detail: "fazla ödeme — iade veya sonraki haftaya mahsup kararı gerekir" });
    } else if (o.outstanding > 0) {
      const kind = o.late ? (o.paid > 0 ? "partial_payment" : "late_payment") : o.paid > 0 ? "partial_payment" : "missing_payment";
      debts.push({
        kind,
        obligation_kind: o.kind,
        late: o.late,
        debtor_id: o.debtor_id,
        creditor_id: o.creditor_id,
        amount: o.outstanding,
        currency: o.currency,
        detail: o.late ? "son tarih (Salı 18:00) geçti" : "son tarih bekleniyor",
      });
    }
  }
  for (const r of unmatched) {
    debts.push({ kind: "unmatched_receipt", obligation_kind: null, late: false, debtor_id: r.payer_id, creditor_id: r.payee_id, amount: r.amount, currency: r.currency, detail: `dekont ${r.bank_reference} hiçbir borçla eşleşmedi` });
  }
  for (const e of exceptions.filter((e) => e.reason === "disputed")) {
    debts.push({ kind: "booking_dispute", obligation_kind: null, late: false, debtor_id: e.supplier_id, creditor_id: null, amount: e.final_booking_price, currency: e.currency, detail: `${e.booking_ref}: ${e.note ?? "itiraz"}` });
  }

  return {
    week,
    generated_at: input.now,
    included,
    exceptions,
    adjustments,
    obligations,
    unmatched_receipts: unmatched,
    supplier_statements,
    site_receivables,
    agos_fees: {
      by_supplier: agosOs.map((o) => ({ supplier_id: o.debtor_id, currency: o.currency, amount: o.amount, paid: o.paid })),
      total_by_currency,
      received_by_currency,
    },
    debts_and_disputes: debts,
    payout_execution: "disabled_owner_go_required",
  };
}

/**
 * Hesaplanmış (eski haftaya girmiş) bir shuttle işinin iadesi: eski satır DEĞİŞMEZ; yeni haftaya
 * ters düzeltme hareketleri yazılır. İade tutarı aynı 20/10/70 politikasıyla bölünür (tek kaynak).
 * Private/VIP iadesi otomatik bölünmez (hak edişi site belirlediği için) → istisna olarak kalır.
 */
export function refundAdjustments(
  line: SettlementLine,
  refundMinor: number,
  currentWeekId: string,
  newId: () => string,
): Adjustment[] {
  if (line.settlement_week_id === null) throw new Error("line not yet settled: handle as an exception, not an adjustment");
  if (line.service_type !== "shuttle") throw new Error("private/VIP refunds need a manual adjustment");
  if (!Number.isSafeInteger(refundMinor) || refundMinor <= 0 || refundMinor > line.collected_amount) {
    throw new RangeError("refund must be positive and not exceed the collected amount");
  }
  const s = shuttleSplit(refundMinor, line.currency, line.selling_party_id, line.supplier_id);
  const out: Adjustment[] = [];
  const ref = `ADJ-${line.booking_ref}-${currentWeekId}`;
  if (s.site_commission_amount > 0) {
    out.push({
      id: newId(),
      booking_id: line.booking_id,
      week_id: currentWeekId,
      original_week_id: line.settlement_week_id,
      debtor_id: line.supplier_id,
      creditor_id: line.selling_party_id,
      amount: -s.site_commission_amount,
      currency: line.currency,
      reason: `refund ${refundMinor}`,
      adjustment_reference: ref,
    });
  }
  out.push({
    id: newId(),
    booking_id: line.booking_id,
    week_id: currentWeekId,
    original_week_id: line.settlement_week_id,
    debtor_id: line.supplier_id,
    creditor_id: AGOS_PARTY_ID,
    amount: -s.agos_fee_amount,
    currency: line.currency,
    reason: `refund ${refundMinor}`,
    adjustment_reference: ref,
  });
  return out;
}

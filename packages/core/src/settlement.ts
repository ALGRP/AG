import { SHUTTLE_SPLIT_V1, splitShuttleRevenue, type SplitPolicy } from "./commission.ts";
import { money, type Currency } from "./money.ts";

// =====================================================================================================
// K15 — OWNER KARARI (KESİN): SUPPLIER COLLECTION + WEEKLY SETTLEMENT
//   Shuttle: müşteri ödemesini hizmeti gerçekleştiren TEDARİKÇİ tahsil eder.
//   Satış kanalı (site) %20 · AGOS %10 · Tedarikçi %70 — tek kaynak SHUTTLE_SPLIT_V1; alanyagroup.com dahil.
//   Site kendi aracıyla: %90 site, %10 AGOS; kendine komisyon yok.
//   Private/VIP: sabit komisyon yok; tedarikçi hak edişini site belirler; AGOS ek komisyon 0.
//   Hesap dönemi Pzt 00:00 – Paz 23:59 Europe/Istanbul; önerilen son tarih Salı 18:00.
//
// OWNER KARAR TASLAĞI 03.11.2026 (Owner kabulü tamamlanmadı — yalnız YEREL ADAY):
//   T1 Fazla tahsilat müşteriye, fazla komisyon ödeyene iade edilir; iade olursa paylar yeniden hesaplanır;
//      sonraki haftaya mahsup yalnız yazılı onayla; her iade/düzeltme ayrı kayıt + ödeme kanıtı.
//   T2 Komisyon yalnız GERÇEKLEŞEN TAHSİLAT üzerinden; satış fiyatı değişmez. Kalan tahsil edilince ilave pay
//      oluşur. Pay ödenebilir olması için transferin tamamlanmış olması gerekir.
//   T3 Kapanmış haftaya itiraz: ekstre iletiminden itibaren 7 gün; kayıt no, taraf, gerekçe, gerekçeli karar;
//      kabul edilen fark sonraki açık döneme. Yasal hak, sahtecilik şüphesi ve maddi hesap hatası süre
//      nedeniyle otomatik reddedilmez.
//
// MODEL: Her hafta, her rezervasyon için yalnız FARK yazılır:
//   pay(hafta sonuna kadarki net tahsilat) − pay(önceki kapanışlarda hesaplanmış tutar).
//   Böylece kısmi tahsilat, sonradan gelen kalan, iade ve geç girilen kayıtlar aynı formülle ve bir kez
//   hesaplanır; eski haftalar değişmez.
//
// Bu modül yalnız HESAPLAR ve RAPORLAR; para göndermez, borç tahsil etmez. Tutarlar tam sayı cent.
// =====================================================================================================

export const AGOS_PARTY_ID = "agos";
export type ServiceType = "shuttle" | "private" | "vip";
/** Tahsilatı tedarikçi (private/VIP'de site de olabilir) yapar; merkezden online tahsilat yok. */
export type CollectionMethod = "cash" | "card_pos" | "bank_transfer";
export const COLLECTION_METHODS: readonly CollectionMethod[] = ["cash", "card_pos", "bank_transfer"];
export type Collector = "supplier" | "site";
export type CollectionStatus = "pending" | "short_collected" | "collected" | "overcollected" | "refunded";
export type SettlementStatus = "open" | "included" | "exception" | "adjusted";

/** Müşteri para hareketi (tahsilat ya da müşteriye iade). Her biri ayrı kayıt + kanıt referansı. */
export interface MoneyEvent {
  readonly id: string;
  readonly kind: "collection" | "refund";
  readonly amount: number;
  readonly at: string;
  readonly method: CollectionMethod;
  readonly collector: Collector;
  /** Dekont / POS slip / makbuz numarası (rezervasyon içinde tekil). */
  readonly reference: string;
}

/** Owner'ın istediği rezervasyon alanları (snake_case, rapor ve DB ile birebir) + hesap için hareketler. */
export interface SettlementLine {
  readonly booking_id: string;
  readonly booking_ref: string;
  readonly selling_site_id: string;
  readonly selling_party_id: string;
  readonly supplier_id: string;
  readonly service_type: ServiceType;
  /** Rezervasyonun orijinal satış fiyatı — tahsilat eksik olsa da DEĞİŞMEZ (T2). */
  readonly final_booking_price: number;
  readonly currency: Currency;
  readonly collection_method: CollectionMethod | null;
  readonly collector: Collector;
  readonly collection_status: CollectionStatus;
  /** Net tahsilat (tahsilatlar − müşteriye iadeler), tüm zamanlar. */
  readonly collected_amount: number;
  readonly refunded_amount: number;
  readonly collected_at: string | null;
  readonly completed_at: string | null;
  readonly cancelled: boolean;
  readonly cancelled_at: string | null;
  readonly disputed: boolean;
  readonly disputed_at: string | null;
  readonly dispute_reason: string | null;
  readonly suspected_duplicate: boolean;
  readonly self_supplied: boolean;
  /** Tam satış fiyatı üzerinden pay (bilgi amaçlı; ödenebilir tutar tahsilata göre hesaplanır). */
  readonly site_commission_amount: number;
  readonly agos_fee_amount: number;
  readonly supplier_entitlement: number;
  readonly supplier_payment_to_site: number;
  readonly supplier_payment_to_agos: number;
  readonly site_payment_to_supplier: number;
  readonly policy_id: string;
  readonly settlement_week_id: string | null;
  readonly settlement_status: SettlementStatus;
  readonly payment_reference: string | null;
  readonly invoice_reference: string | null;
  readonly adjustment_reference: string | null;
  readonly money_events: readonly MoneyEvent[];
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
  amountMinor: number,
  currency: Currency,
  sellingPartyId: string,
  supplierId: string,
  policy: SplitPolicy = SHUTTLE_SPLIT_V1,
): SplitAmounts {
  const s = splitShuttleRevenue(money(amountMinor, currency), policy);
  return sellingPartyId === supplierId
    ? {
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

/** Private/VIP: hak edişi site belirler; AGOS 0; kendi aracıyla ise tamamı sitede. */
export function privateSplit(finalMinor: number, supplierEntitlementMinor: number, sellingPartyId: string, supplierId: string): SplitAmounts {
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

/**
 * Tahsil edilen tutar üzerinden pay (T2). Shuttle: aynı 20/10/70 politikası tahsilata uygulanır.
 * Private/VIP (ADAY kural, Owner teyidi gerekir): satış farkı tahsilat oranında, aşağı yuvarlanarak; tam
 * tahsilatta tam olarak site belirlediği tutarlara eşit olur.
 */
export function splitOnCollected(line: Pick<SettlementLine, "service_type" | "final_booking_price" | "currency" | "selling_party_id" | "supplier_id" | "site_commission_amount">, collectedMinor: number, policy: SplitPolicy = SHUTTLE_SPLIT_V1): SplitAmounts {
  const c = Math.max(0, Math.min(collectedMinor, line.final_booking_price));
  if (line.service_type === "shuttle") return shuttleSplit(c, line.currency, line.selling_party_id, line.supplier_id, policy);
  const site = line.final_booking_price === 0 ? 0 : Math.floor((c * line.site_commission_amount) / line.final_booking_price);
  return {
    self_supplied: line.selling_party_id === line.supplier_id,
    site_commission_amount: site,
    agos_fee_amount: 0,
    supplier_entitlement: c - site,
    policy_id: "private-pro-rata-on-collection",
  };
}

/** Kim kime ne öder (tam satış üzerinden bilgi alanları). */
export function transfers(
  split: SplitAmounts,
  amountMinor: number,
  collector: Collector,
): Pick<SettlementLine, "supplier_payment_to_site" | "supplier_payment_to_agos" | "site_payment_to_supplier"> {
  if (collector === "supplier") {
    return { supplier_payment_to_site: split.site_commission_amount, supplier_payment_to_agos: split.agos_fee_amount, site_payment_to_supplier: 0 };
  }
  if (split.agos_fee_amount !== 0) throw new Error("site collection is only allowed for private/VIP (no AGOS fee)");
  return { supplier_payment_to_site: 0, supplier_payment_to_agos: 0, site_payment_to_supplier: amountMinor - split.site_commission_amount };
}

/** Net tahsilat ve durum. */
export function collectionSummary(events: readonly MoneyEvent[], price: number, until?: string): { net: number; collected: number; refunded: number; status: CollectionStatus; firstAt: string | null } {
  let collected = 0;
  let refunded = 0;
  let firstAt: string | null = null;
  for (const e of events) {
    if (until !== undefined && ts(e.at) >= ts(until)) continue;
    if (e.kind === "collection") {
      collected += e.amount;
      if (firstAt === null || ts(e.at) < ts(firstAt)) firstAt = e.at;
    } else refunded += e.amount;
  }
  const net = collected - refunded;
  const status: CollectionStatus =
    net > price ? "overcollected" : net === price && price > 0 ? "collected" : net > 0 ? "short_collected" : refunded > 0 ? "refunded" : "pending";
  return { net, collected, refunded, status, firstAt };
}

// ---- Zaman karşılaştırması: ISO metinleri biçim farkı (".000Z" / "Z") yüzünden metin olarak karşılaştırılmaz.
const ts = (iso: string): number => {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) throw new RangeError(`invalid instant ${iso}`);
  return t;
};

// ---- Hafta ----

const IST_OFFSET_MS = 3 * 3600_000; // Europe/Istanbul: UTC+3, yaz saati yok (2016'dan beri).

/** ISO hafta kimliği (İstanbul yerel saatine göre), ör. "2026-W45". */
export function settlementWeekId(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) throw new RangeError(`invalid instant ${iso}`);
  const d = new Date(t + IST_OFFSET_MS);
  const day = (d.getUTCDay() + 6) % 7;
  const thursday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day + 3));
  const year = thursday.getUTCFullYear();
  const week = 1 + Math.floor((thursday.getTime() - Date.UTC(year, 0, 1)) / (7 * 86400_000));
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export interface WeekBounds {
  readonly week_id: string;
  readonly start_utc: string;
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
  const start = mondayW1 + (week - 1) * 7 * 86400_000 - IST_OFFSET_MS;
  const end = start + 7 * 86400_000;
  const due = end + 86400_000 + 18 * 3600_000;
  if (settlementWeekId(new Date(start).toISOString()) !== weekId) throw new RangeError(`week ${weekId} does not exist`);
  return { week_id: weekId, start_utc: new Date(start).toISOString(), end_utc: new Date(end).toISOString(), payment_due_utc: new Date(due).toISOString() };
}

export function nextWeekId(weekId: string): string {
  return settlementWeekId(weekBounds(weekId).end_utc);
}

// ---- Kayıtlar ----

export interface BankReceipt {
  readonly id: string;
  /** Hangi haftanın borcu için. */
  readonly week_id: string;
  readonly payer_id: string;
  readonly payee_id: string;
  readonly amount: number;
  readonly currency: Currency;
  readonly bank_reference: string;
  readonly paid_at: string;
  /**
   * settlement: komisyon ödemesi · subscription: SaaS (eşleştirilmez, kural 10) ·
   * overpayment_refund: alacaklının fazla ödemeyi ödeyene iadesi (T1).
   */
  readonly purpose: "settlement" | "subscription" | "overpayment_refund";
}

/** Elle düzeltme: itiraz kararı ya da yazılı onaylı mahsup. Eski hafta değişmez; açık haftaya yazılır. */
export interface Adjustment {
  readonly id: string;
  readonly week_id: string;
  readonly original_week_id: string;
  readonly debtor_id: string;
  readonly creditor_id: string;
  /** Pozitif: borçlu alacaklıya öder. Negatif: alacaklı borçluya öder. */
  readonly amount: number;
  readonly currency: Currency;
  readonly kind: "dispute_decision" | "offset";
  readonly reason: string;
  readonly adjustment_reference: string;
  /** Mahsup için zorunlu: ilgili tarafların yazılı onayının belge referansı (T1). */
  readonly written_approval_reference: string | null;
  readonly booking_id: string | null;
  readonly dispute_id: string | null;
}

/** Bir haftada bir rezervasyon için hesaplanan fark (yalnız eklenir; kapanışla dondurulur). */
export interface SettlementEntry {
  readonly entry_id: string;
  readonly week_id: string;
  readonly booking_id: string;
  readonly booking_ref: string;
  readonly service_type: ServiceType;
  readonly selling_party_id: string;
  readonly selling_site_id: string;
  readonly supplier_id: string;
  readonly collector: Collector;
  readonly currency: Currency;
  readonly policy_id: string;
  readonly kind: "collection" | "refund_correction" | "cancellation_reversal";
  readonly base_before: number;
  readonly base_after: number;
  readonly collected_delta: number;
  readonly site_delta: number;
  readonly agos_delta: number;
  readonly supplier_delta: number;
  readonly self_supplied: boolean;
  readonly payment_reference: string | null;
}

export type ExceptionReason =
  | "cancelled"
  | "cancelled_after_collection"
  | "overcollected"
  | "disputed"
  | "suspected_duplicate"
  | "share_mismatch";

export interface ExceptionItem {
  readonly booking_id: string;
  readonly booking_ref: string;
  readonly supplier_id: string;
  readonly selling_site_id: string;
  readonly reason: ExceptionReason;
  readonly final_booking_price: number;
  readonly collected_amount: number;
  /** Müşteriye iade edilmesi gereken tutar (fazla tahsilat / iptal). */
  readonly customer_refund_due: number;
  readonly currency: Currency;
  readonly note: string | null;
}

export interface CustomerBalance {
  readonly booking_id: string;
  readonly booking_ref: string;
  readonly supplier_id: string;
  readonly final_booking_price: number;
  readonly collected_amount: number;
  readonly remaining: number;
  readonly currency: Currency;
}

/** Kapanmış haftaya itiraz kaydı (T3). */
export interface StatementDispute {
  readonly id: string;
  readonly week_id: string;
  readonly raised_by: string;
  readonly reason: string;
  readonly category: "calculation_error" | "legal_right" | "fraud_suspicion" | "other";
  readonly raised_at: string;
  /** Ekstrenin bu tarafa iletildiği an (yoksa süre başlamamıştır). */
  readonly statement_sent_at: string | null;
  readonly status: "open" | "accepted" | "rejected";
  readonly decided_by: string | null;
  readonly decided_role: string | null;
  readonly decision_reason: string | null;
  readonly decided_at: string | null;
  readonly adjustment_ids: readonly string[];
}

export const DISPUTE_WINDOW_DAYS = 7;

/** İtiraz süresi. Süre dışı itiraz otomatik REDDEDİLMEZ; yasal hak/sahtecilik/hesap hatası her zaman incelenir. */
export function disputeTiming(d: Pick<StatementDispute, "raised_at" | "statement_sent_at" | "category">): {
  deadline: string | null;
  within_window: boolean;
  reviewable: true;
  note: string;
} {
  if (d.statement_sent_at === null) return { deadline: null, within_window: true, reviewable: true, note: "ekstre iletim tarihi kayıtlı değil; süre başlamadı" };
  const deadline = new Date(Date.parse(d.statement_sent_at) + DISPUTE_WINDOW_DAYS * 86400_000).toISOString();
  const within = ts(d.raised_at) <= ts(deadline);
  const always = d.category !== "other";
  return {
    deadline,
    within_window: within,
    reviewable: true,
    note: within ? "süresinde" : always ? "süre dışı ama otomatik reddedilmez (yasal hak / sahtecilik / hesap hatası)" : "süre dışı — yetkili yönetici gerekçeli karar verir",
  };
}

export interface Obligation {
  readonly week_id: string;
  readonly debtor_id: string;
  readonly creditor_id: string;
  /** site_commission (shuttle %20) · site_sale_share (private/VIP) · agos_fee · supplier_entitlement (site tahsil ettiyse) · manual. */
  readonly kind: "site_commission" | "site_sale_share" | "agos_fee" | "supplier_entitlement" | "manual";
  readonly currency: Currency;
  readonly amount: number;
  /** Ödenen (borçlu → alacaklı) − alacaklının geri iadesi. */
  readonly paid: number;
  readonly outstanding: number;
  readonly status: "paid" | "partially_paid" | "unpaid" | "overpaid" | "nothing_due" | "credit_due";
  readonly late: boolean;
  readonly paid_late: boolean;
  readonly receipt_ids: readonly string[];
  readonly receipt_refs: readonly string[];
  readonly booking_ids: readonly string[];
  readonly adjustment_ids: readonly string[];
}

export interface SupplierStatement {
  readonly supplier_id: string;
  readonly currency: Currency;
  readonly jobs: number;
  /** Bu haftanın hesaplanan net tahsilat farkı. */
  readonly collected: number;
  readonly entitlement: number;
  readonly owes_sites: ReadonlyArray<{ readonly site_party_id: string; readonly amount: number; readonly paid: number }>;
  readonly owes_agos: number;
  readonly paid_agos: number;
  readonly total_owed: number;
  readonly total_paid: number;
  readonly outstanding: number;
  readonly overpaid: number;
  readonly credits: number;
  readonly status: "settled" | "open" | "late" | "credit";
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
  readonly kind:
    | "late_payment"
    | "missing_payment"
    | "partial_payment"
    | "paid_late"
    | "overpayment"
    | "credit_due"
    | "unmatched_receipt"
    | "booking_dispute"
    | "statement_dispute";
  readonly obligation_kind: Obligation["kind"] | null;
  readonly late: boolean;
  readonly debtor_id: string | null;
  readonly creditor_id: string | null;
  readonly amount: number;
  readonly currency: Currency;
  readonly detail: string;
}

export interface WeeklyReport {
  readonly week: WeekBounds;
  readonly generated_at: string;
  readonly entries: readonly SettlementEntry[];
  readonly exceptions: readonly ExceptionItem[];
  readonly customer_balances: readonly CustomerBalance[];
  readonly adjustments: readonly Adjustment[];
  readonly obligations: readonly Obligation[];
  readonly unmatched_receipts: readonly BankReceipt[];
  readonly subscription_receipts: readonly BankReceipt[];
  readonly supplier_statements: readonly SupplierStatement[];
  readonly site_receivables: readonly SiteReceivable[];
  readonly agos_fees: AgosFeeReport;
  readonly statement_disputes: readonly (StatementDispute & { readonly timing: ReturnType<typeof disputeTiming> })[];
  readonly debts_and_disputes: readonly DebtOrDispute[];
  readonly payout_execution: "disabled_owner_go_required";
}

/** Çözülene kadar her hafta listede kalan istisnalar. */
export const OPEN_EXCEPTION_REASONS: readonly ExceptionReason[] = ["cancelled_after_collection", "overcollected", "disputed", "suspected_duplicate"];

/** Satırın bu hafta için istisna nedenleri (birden çok olabilir). */
export function exceptionReasons(l: SettlementLine, until: string): ExceptionReason[] {
  const out: ExceptionReason[] = [];
  const net = collectionSummary(l.money_events, l.final_booking_price, until).net;
  if (l.cancelled) out.push(net > 0 ? "cancelled_after_collection" : "cancelled");
  if (l.disputed && (l.disputed_at === null || ts(l.disputed_at) < ts(until))) out.push("disputed");
  if (l.suspected_duplicate && (l.completed_at !== null || net !== 0)) out.push("suspected_duplicate");
  if (!l.cancelled && net > l.final_booking_price) out.push("overcollected");
  return out;
}

/** Hesaplamayı durduran istisnalar (fazla tahsilat durdurmaz: pay satış fiyatına kadar hesaplanır). */
const BLOCKING: readonly ExceptionReason[] = ["cancelled", "cancelled_after_collection", "disputed", "suspected_duplicate"];

/** Bir rezervasyonun kayıtlı kümülatif payları (gerçek fark kayıtlarının toplamı). */
type Shares = { readonly base: number; readonly site: number; readonly agos: number; readonly supplier: number };
const NO_SHARES: Shares = Object.freeze({ base: 0, site: 0, agos: 0, supplier: 0 });

function inWeek(iso: string | null, w: WeekBounds): boolean {
  return iso !== null && ts(iso) >= ts(w.start_utc) && ts(iso) < ts(w.end_utc);
}

/**
 * Haftalık rapor / kapanış.
 *  - Her rezervasyon: hafta sonuna kadar tamamlanmış (T2: transfer tamamlanmış) ve hesaplamayı durduran istisnası
 *    yoksa, fark = pay(hafta sonuna kadarki net tahsilat, satış fiyatıyla sınırlı) − pay(önceki kapanışlar).
 *  - priorEntries: bu haftadan önce kapanmış haftaların farkları (tek kaynak; iki kez sayım imkânsız).
 *  - Fazla ödeme: ödeyene iade edilir (overpayment_refund dekontu); mahsup yalnız yazılı onaylı Adjustment ile.
 */
export function weeklyReport(input: {
  readonly weekId: string;
  readonly now: string;
  readonly lines: readonly SettlementLine[];
  readonly priorEntries: readonly SettlementEntry[];
  readonly adjustments: readonly Adjustment[];
  readonly receipts: readonly BankReceipt[];
  readonly disputes?: readonly StatementDispute[];
  readonly policy?: SplitPolicy;
  /** D-F05: rezervasyonlarda dondurulmuş eski bölüşüm politikaları. `policy` ve SHUTTLE_SPLIT_V1 her zaman tanınır. */
  readonly policies?: readonly SplitPolicy[];
  readonly newId?: () => string;
  /** Kapanmış hafta: farklar ve istisnalar kapanış anındaki haliyle (kural 8). */
  readonly frozen?: { readonly entries: readonly SettlementEntry[]; readonly exceptions: readonly ExceptionItem[]; readonly customer_balances: readonly CustomerBalance[] };
}): WeeklyReport {
  const week = weekBounds(input.weekId);
  const late = ts(input.now) >= ts(week.payment_due_utc);
  const policy = input.policy ?? SHUTTLE_SPLIT_V1;
  // D-F05: her shuttle rezervasyonu kendi dondurulmuş politikasıyla hesaplanır; tanınmayan politika güncel olanla
  // sessizce değiştirilmez (fail-closed).
  const registry = new Map<string, SplitPolicy>();
  for (const p of [SHUTTLE_SPLIT_V1, ...(input.policies ?? []), policy]) registry.set(p.id, p);
  const policyFor = (l: SettlementLine): SplitPolicy => {
    if (l.service_type !== "shuttle") return policy;
    const p = registry.get(l.policy_id);
    if (!p) throw new RangeError(`unknown split policy ${l.policy_id} (booking ${l.booking_ref})`);
    return p;
  };
  let seq = 0;
  const newId = input.newId ?? (() => `${week.week_id}-E${++seq}`);

  const entries: SettlementEntry[] = input.frozen ? [...input.frozen.entries] : [];
  const exceptions: ExceptionItem[] = input.frozen ? [...input.frozen.exceptions] : [];
  const balances: CustomerBalance[] = input.frozen ? [...input.frozen.customer_balances] : [];

  if (!input.frozen) {
    // D-F05: önceki paylar gerçek kayıtlardan (kapanmış haftaların farkları) alınır; güncel politikayla yeniden hesaplanmaz.
    const prior = new Map<string, Shares>();
    for (const e of input.priorEntries) {
      if (e.week_id >= week.week_id) continue;
      const p = prior.get(e.booking_id) ?? NO_SHARES;
      prior.set(e.booking_id, { base: p.base + e.collected_delta, site: p.site + e.site_delta, agos: p.agos + e.agos_delta, supplier: p.supplier + e.supplier_delta });
    }
    const pushEntry = (l: SettlementLine, kind: SettlementEntry["kind"], before: Shares, after: Shares, policyId: string, selfSupplied: boolean) =>
      entries.push({
        entry_id: newId(),
        week_id: week.week_id,
        booking_id: l.booking_id,
        booking_ref: l.booking_ref,
        service_type: l.service_type,
        selling_party_id: l.selling_party_id,
        selling_site_id: l.selling_site_id,
        supplier_id: l.supplier_id,
        collector: l.collector,
        currency: l.currency,
        policy_id: policyId,
        kind,
        base_before: before.base,
        base_after: after.base,
        collected_delta: after.base - before.base,
        site_delta: after.site - before.site,
        agos_delta: after.agos - before.agos,
        supplier_delta: after.supplier - before.supplier,
        self_supplied: selfSupplied,
        payment_reference: null,
      });
    for (const l of input.lines) {
      const sum = collectionSummary(l.money_events, l.final_booking_price, week.end_utc);
      const reasons = exceptionReasons(l, week.end_utc);
      for (const reason of reasons) {
        const eventAt = reason === "disputed" ? l.disputed_at : reason.startsWith("cancelled") ? l.cancelled_at : (l.completed_at ?? sum.firstAt);
        const carried = OPEN_EXCEPTION_REASONS.includes(reason);
        if (inWeek(eventAt, week) || (carried && eventAt !== null && ts(eventAt) < ts(week.end_utc))) {
          exceptions.push({
            booking_id: l.booking_id,
            booking_ref: l.booking_ref,
            supplier_id: l.supplier_id,
            selling_site_id: l.selling_site_id,
            reason,
            final_booking_price: l.final_booking_price,
            collected_amount: sum.net,
            customer_refund_due: reason === "overcollected" ? sum.net - l.final_booking_price : reason === "cancelled_after_collection" ? sum.net : 0,
            currency: l.currency,
            note: reason === "disputed" ? l.dispute_reason : null,
          });
        }
      }
      const before = prior.get(l.booking_id) ?? NO_SHARES;
      if (reasons.some((r) => BLOCKING.includes(r))) {
        // D-F06: iptal, önceden kaydedilmiş payı silmez; iptalin olduğu hafta tam ters hareket yazılır (bir kez).
        const cancelledByWeekEnd = l.cancelled && l.cancelled_at !== null && ts(l.cancelled_at) < ts(week.end_utc);
        if (cancelledByWeekEnd && before.base > 0) pushEntry(l, "cancellation_reversal", before, NO_SHARES, l.policy_id, l.self_supplied);
        continue;
      }
      if (l.completed_at === null || ts(l.completed_at) >= ts(week.end_utc)) continue; // T2: transfer tamamlanmadan pay yok

      const base = Math.max(0, Math.min(sum.net, l.final_booking_price));
      // D-F04: müşteri borcu brüt tahsilata göre; müşteriye yapılan iade (onaylı iyi niyet iadesi dahil) borcu yeniden yaratmaz.
      const paidByCustomer = Math.min(sum.collected, l.final_booking_price);
      if (paidByCustomer < l.final_booking_price) {
        balances.push({
          booking_id: l.booking_id,
          booking_ref: l.booking_ref,
          supplier_id: l.supplier_id,
          final_booking_price: l.final_booking_price,
          collected_amount: paidByCustomer,
          remaining: l.final_booking_price - paidByCustomer,
          currency: l.currency,
        });
      }
      const frozenPolicy = policyFor(l);
      const expectedBefore = splitOnCollected(l, before.base, frozenPolicy);
      const mismatch = prior.has(l.booking_id) &&
        (before.site !== expectedBefore.site_commission_amount ||
         before.agos !== expectedBefore.agos_fee_amount ||
         before.supplier !== expectedBefore.supplier_entitlement);
      if (mismatch) {
        // H-24: flag the discrepancy; do not silently repair old recorded shares.
        exceptions.push({
          booking_id: l.booking_id,
          booking_ref: l.booking_ref,
          supplier_id: l.supplier_id,
          selling_site_id: l.selling_site_id,
          reason: "share_mismatch",
          final_booking_price: l.final_booking_price,
          collected_amount: sum.net,
          customer_refund_due: 0,
          currency: l.currency,
          note: `prior recorded site/agos/supplier=${before.site}/${before.agos}/${before.supplier}; expected=${expectedBefore.site_commission_amount}/${expectedBefore.agos_fee_amount}/${expectedBefore.supplier_entitlement} (${frozenPolicy.id}); human reconciliation required`,
        });
      }
      if (base === before.base) continue;
      const b = splitOnCollected(l, base, frozenPolicy);
      // Continue booking for new cash/refund, without automatically curing the prior mismatch.
      const accountingBefore: Shares = mismatch
        ? { base: before.base, site: expectedBefore.site_commission_amount, agos: expectedBefore.agos_fee_amount, supplier: expectedBefore.supplier_entitlement }
        : before;
      pushEntry(
        l,
        base > before.base ? "collection" : "refund_correction",
        accountingBefore,
        { base, site: b.site_commission_amount, agos: b.agos_fee_amount, supplier: b.supplier_entitlement },
        b.policy_id,
        b.self_supplied,
      );
    }
  }
  const adjustments = input.adjustments.filter((a) => a.week_id === week.week_id);

  // ---- Borçlar
  // D-F03: borç yönüne göre ayrı kalem. Yeni komisyon (borçlu → alacaklı) ile iade düzeltmesi (alacaklı → borçlu)
  // aynı tutarda netleşmez; netleştirme yalnız yazılı onaylı mahsupla (Adjustment "offset").
  type Acc = { debtor: string; creditor: string; kind: Obligation["kind"]; currency: Currency; credit: boolean; amount: number; bookings: Set<string>; adj: Set<string> };
  const acc = new Map<string, Acc>();
  const add = (debtor: string, creditor: string, kind: Obligation["kind"], currency: Currency, amount: number, booking?: string, adj?: string) => {
    if (amount === 0 && !adj) return;
    const credit = amount < 0;
    const key = `${debtor}|${creditor}|${kind}|${currency}|${credit ? "C" : "D"}`;
    let x = acc.get(key);
    if (!x) acc.set(key, (x = { debtor, creditor, kind, currency, credit, amount: 0, bookings: new Set(), adj: new Set() }));
    x.amount += amount;
    if (booking) x.bookings.add(booking);
    if (adj) x.adj.add(adj);
  };
  for (const e of entries) {
    if (e.collector === "supplier") {
      add(e.supplier_id, e.selling_party_id, e.service_type === "shuttle" ? "site_commission" : "site_sale_share", e.currency, e.site_delta, e.booking_id);
      add(e.supplier_id, AGOS_PARTY_ID, "agos_fee", e.currency, e.agos_delta, e.booking_id);
    } else {
      add(e.selling_party_id, e.supplier_id, "supplier_entitlement", e.currency, e.supplier_delta, e.booking_id);
    }
  }
  for (const a of adjustments) add(a.debtor_id, a.creditor_id, "manual", a.currency, a.amount, a.booking_id ?? undefined, a.id);

  const weekReceipts = input.receipts.filter((r) => r.week_id === week.week_id);
  const used = new Set<string>();
  const obligations: Obligation[] = [...acc.values()]
    .sort((x, y) => `${x.debtor}|${x.creditor}|${x.kind}|${x.credit ? 0 : 1}`.localeCompare(`${y.debtor}|${y.creditor}|${y.kind}|${y.credit ? 0 : 1}`))
    .map((x) => {
      // Borçlunun ödemesi yalnız borç yönündeki kaleme eşlenir; alacak kalemini alacaklının iadesi kapatır.
      const pay = x.credit
        ? []
        : weekReceipts.filter((r) => r.purpose === "settlement" && r.payer_id === x.debtor && r.payee_id === x.creditor && r.currency === x.currency && !used.has(r.id));
      pay.forEach((r) => used.add(r.id));
      // T1: alacaklının fazla ödemeyi ödeyene iadesi
      const back = weekReceipts.filter((r) => r.purpose === "overpayment_refund" && r.payer_id === x.creditor && r.payee_id === x.debtor && r.currency === x.currency && !used.has(r.id));
      back.forEach((r) => used.add(r.id));
      const paid = pay.reduce((s, r) => s + r.amount, 0) - back.reduce((s, r) => s + r.amount, 0);
      const outstanding = x.amount - paid;
      const status: Obligation["status"] =
        x.amount < 0 && paid <= 0 && outstanding < 0
          ? "credit_due"
          : x.amount === 0 && paid === 0
            ? "nothing_due"
            : outstanding === 0
              ? "paid"
              : outstanding < 0
                ? "overpaid"
                : paid > 0
                  ? "partially_paid"
                  : "unpaid";
      return {
        week_id: week.week_id,
        debtor_id: x.debtor,
        creditor_id: x.creditor,
        kind: x.kind,
        currency: x.currency,
        amount: x.amount,
        paid,
        outstanding,
        status,
        late: late && outstanding > 0,
        paid_late: pay.some((r) => ts(r.paid_at) > ts(week.payment_due_utc)),
        receipt_ids: [...pay, ...back].map((r) => r.id),
        receipt_refs: [...pay, ...back].map((r) => r.bank_reference),
        booking_ids: [...x.bookings],
        adjustment_ids: [...x.adj],
      };
    });
  const unmatched = weekReceipts.filter((r) => r.purpose !== "subscription" && !used.has(r.id));
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    const refs = obligations.filter((o) => o.booking_ids.includes(e.booking_id)).flatMap((o) => o.receipt_refs);
    entries[i] = { ...e, payment_reference: refs.length ? [...new Set(refs)].sort().join(",") : null };
  }

  // ---- Tedarikçi ekstreleri
  const supKeys = new Set<string>();
  for (const e of entries) supKeys.add(`${e.supplier_id}|${e.currency}`);
  for (const o of obligations) if (o.kind !== "supplier_entitlement") supKeys.add(`${o.debtor_id}|${o.currency}`);
  const supplier_statements: SupplierStatement[] = [...supKeys]
    .map((k) => {
      const [supplier_id, currency] = k.split("|") as [string, Currency];
      const mine = entries.filter((e) => e.supplier_id === supplier_id && e.currency === currency);
      const obs = obligations.filter((o) => o.debtor_id === supplier_id && o.currency === currency && o.kind !== "supplier_entitlement");
      const sites = obs.filter((o) => o.kind === "site_commission" || o.kind === "site_sale_share");
      const agos = obs.filter((o) => o.kind === "agos_fee");
      const outstanding = obs.reduce((s, o) => s + Math.max(0, o.outstanding), 0);
      const credits = obs.reduce((s, o) => s + Math.min(0, o.amount), 0);
      return {
        supplier_id,
        currency,
        jobs: new Set(mine.map((e) => e.booking_id)).size,
        collected: mine.filter((e) => e.collector === "supplier").reduce((s, e) => s + e.collected_delta, 0),
        entitlement: mine.reduce((s, e) => s + e.supplier_delta, 0),
        owes_sites: sites.map((o) => ({ site_party_id: o.creditor_id, amount: o.amount, paid: o.paid })),
        owes_agos: agos.reduce((s, o) => s + o.amount, 0),
        paid_agos: agos.reduce((s, o) => s + o.paid, 0),
        total_owed: obs.reduce((s, o) => s + Math.max(0, o.amount), 0),
        total_paid: obs.reduce((s, o) => s + Math.max(0, Math.min(o.paid, Math.max(0, o.amount))), 0),
        outstanding,
        overpaid: obs.reduce((s, o) => s + (o.amount >= 0 ? Math.max(0, -o.outstanding) : 0), 0),
        credits,
        status: outstanding > 0 ? (late ? ("late" as const) : ("open" as const)) : credits < 0 ? ("credit" as const) : ("settled" as const),
      };
    })
    .sort((a, b) => a.supplier_id.localeCompare(b.supplier_id));

  // ---- Site alacakları
  const siteMap = new Map<string, Obligation[]>();
  for (const o of obligations.filter((o) => o.kind === "site_commission" || o.kind === "site_sale_share")) {
    const k = `${o.creditor_id}|${o.currency}`;
    siteMap.set(k, [...(siteMap.get(k) ?? []), o]);
  }
  const site_receivables: SiteReceivable[] = [...siteMap.entries()]
    .map(([k, os]) => {
      const [site_party_id, currency] = k.split("|") as [string, Currency];
      return {
        site_party_id,
        currency,
        by_supplier: os.map((o) => ({ supplier_id: o.debtor_id, amount: o.amount, paid: o.paid })),
        total: os.reduce((s, o) => s + o.amount, 0),
        received: os.reduce((s, o) => s + Math.max(0, Math.min(o.paid, Math.max(0, o.amount))), 0),
        outstanding: os.reduce((s, o) => s + Math.max(0, o.outstanding), 0),
      };
    })
    .sort((a, b) => a.site_party_id.localeCompare(b.site_party_id));

  // ---- AGOS payları
  const agosOs = obligations.filter((o) => o.kind === "agos_fee");
  const total_by_currency: Partial<Record<Currency, number>> = {};
  const received_by_currency: Partial<Record<Currency, number>> = {};
  for (const o of agosOs) {
    total_by_currency[o.currency] = (total_by_currency[o.currency] ?? 0) + o.amount;
    received_by_currency[o.currency] = (received_by_currency[o.currency] ?? 0) + Math.max(0, Math.min(o.paid, Math.max(0, o.amount)));
  }

  // ---- İtirazlar
  const statement_disputes = (input.disputes ?? []).filter((d) => d.week_id === week.week_id).map((d) => ({ ...d, timing: disputeTiming(d) }));

  // ---- Borç ve ihtilaf listesi
  const debts: DebtOrDispute[] = [];
  for (const o of obligations) {
    if (o.status === "credit_due") {
      debts.push({ kind: "credit_due", obligation_kind: o.kind, late: false, debtor_id: o.creditor_id, creditor_id: o.debtor_id, amount: -o.outstanding, currency: o.currency, detail: "iade sonrası yeniden hesap: alacaklı fazlayı ödeyene iade eder; mahsup yalnız yazılı onayla" });
    } else if (o.status === "overpaid") {
      debts.push({ kind: "overpayment", obligation_kind: o.kind, late: false, debtor_id: o.debtor_id, creditor_id: o.creditor_id, amount: -o.outstanding, currency: o.currency, detail: "fazla tutar ödeyene iade edilir; sonraki haftaya mahsup yalnız yazılı onayla" });
    } else if (o.outstanding > 0) {
      debts.push({
        kind: o.paid > 0 ? "partial_payment" : o.late ? "late_payment" : "missing_payment",
        obligation_kind: o.kind,
        late: o.late,
        debtor_id: o.debtor_id,
        creditor_id: o.creditor_id,
        amount: o.outstanding,
        currency: o.currency,
        detail: o.late ? "son tarih (Salı 18:00) geçti" : "son tarih bekleniyor",
      });
    }
    if (o.paid_late && o.outstanding <= 0) {
      debts.push({ kind: "paid_late", obligation_kind: o.kind, late: true, debtor_id: o.debtor_id, creditor_id: o.creditor_id, amount: o.paid, currency: o.currency, detail: "ödendi, ancak son tarihten sonra" });
    }
  }
  for (const r of unmatched) {
    debts.push({ kind: "unmatched_receipt", obligation_kind: null, late: false, debtor_id: r.payer_id, creditor_id: r.payee_id, amount: r.amount, currency: r.currency, detail: `dekont ${r.bank_reference} hiçbir borçla eşleşmedi` });
  }
  for (const e of exceptions.filter((e) => e.reason === "disputed")) {
    debts.push({ kind: "booking_dispute", obligation_kind: null, late: false, debtor_id: e.supplier_id, creditor_id: null, amount: e.final_booking_price, currency: e.currency, detail: `${e.booking_ref}: ${e.note ?? "itiraz"}` });
  }
  for (const d of statement_disputes.filter((d) => d.status === "open")) {
    debts.push({ kind: "statement_dispute", obligation_kind: null, late: !d.timing.within_window, debtor_id: null, creditor_id: d.raised_by, amount: 0, currency: "EUR", detail: `${d.id}: ${d.timing.note}` });
  }

  return {
    week,
    generated_at: input.now,
    entries,
    exceptions,
    customer_balances: balances,
    adjustments,
    obligations,
    unmatched_receipts: unmatched,
    subscription_receipts: weekReceipts.filter((r) => r.purpose === "subscription"),
    supplier_statements,
    site_receivables,
    agos_fees: {
      by_supplier: agosOs.map((o) => ({ supplier_id: o.debtor_id, currency: o.currency, amount: o.amount, paid: o.paid })),
      total_by_currency,
      received_by_currency,
    },
    statement_disputes,
    debts_and_disputes: debts,
    payout_execution: "disabled_owner_go_required",
  };
}

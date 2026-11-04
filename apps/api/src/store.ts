import { AsyncLocalStorage } from "node:async_hooks";
import type {
  Adjustment,
  BankReceipt,
  BookingStatus,
  CollectionMethod,
  IntakeRequest,
  MoneyEvent,
  StatementDispute,
  PriceSnapshot,
  Product,
  SettlementStatus,
  ShuttleRun,
  WeeklyReport,
} from "@ag/core";

/** Same payer + bank reference is one receipt, regardless of whitespace/case. */
export const normalizeBankReference = (ref: string): string => ref.replace(/\s+/g, "").toUpperCase();
/** Adjustment business references are case-insensitive (even for legacy records). */
export const normalizeAdjustmentReference = (ref: string): string => ref.toUpperCase();

// Depo arayüzü. Üretimde karşılığı merkezi rezervasyon PostgreSQL'idir (CRS); şema adayı packages/db.
// MemoryStore yalnız yerel geliştirme ve test içindir.

/** K17: manuel fiyat onayının denetim kaydı (kim, hangi rol, ne zaman, eski/yeni fiyat, gerekçe). */
export interface PriceApprovalRecord {
  readonly actorId: string;
  readonly actorRole: string;
  readonly at: string;
  readonly oldPriceMinor: number | null;
  readonly newPriceMinor: number;
  readonly reason: string;
}

/** Local QA audit record. A real signed IdP/2FA assertion is required before production use. */
export interface SensitiveDecisionAudit {
  readonly actorId: string;
  readonly actorRole: "admin" | "finance_manager";
  readonly mfaVerified: true;
  readonly at: string;
  readonly reason: string;
}

/** QA-F04b local append-only credit-note record; no cash movement. */
export interface ApprovedCustomerCredit {
  readonly id: string;
  readonly amountMinor: number;
  readonly reference: string;
  readonly reason: string;
  readonly actorId: string;
  readonly actorRole: "admin" | "finance_manager";
  readonly mfaVerified: true;
  readonly at: string;
}

export interface StoredBooking {
  readonly id: string;
  readonly ref: string;
  readonly siteId: string;
  /** Satış kanalı payının alacaklısı (site sahibi). */
  readonly sellingPartyId: string;
  readonly product: Product;
  readonly status: BookingStatus;
  readonly request: IntakeRequest;
  readonly price?: PriceSnapshot;
  readonly lookupTokenHash: string;
  readonly fingerprint: string;
  readonly isDuplicate: boolean;
  readonly isTest: boolean;
  readonly shuttleRunId?: string;
  /** K15: bu rezervasyonda izin verilen tahsilat yöntemleri (rezervasyon anında dondurulur). */
  readonly allowedCollectionMethods: readonly CollectionMethod[];
  readonly preferredCollectionMethod?: CollectionMethod;
  /** İşi yapan tedarikçi; site kendi aracıyla yapıyorsa = sellingPartyId. */
  readonly supplierId?: string;
  /** Yalnız private/VIP: siteyi getiren sitenin belirlediği tedarikçi hak edişi. */
  readonly supplierEntitlementMinor?: number;
  /** Tahsilat ve müşteriye iade hareketleri; referans rezervasyon başına tekil (aynı kayıt iki kez yazılmaz). */
  readonly moneyEvents: readonly MoneyEvent[];
  /** Non-cash service credits are separate from money events and obligations. */
  readonly creditNotes?: readonly ApprovedCustomerCredit[];
  readonly priceApproval?: PriceApprovalRecord;
  readonly completedAt?: string;
  readonly cancelledAt?: string;
  readonly disputedAt?: string;
  readonly disputeReason?: string;
  readonly disputeResolvedAt?: string;
  readonly disputeOutcome?: "upheld" | "rejected";
  /** Required when an authorised manager releases a duplicate flag. */
  readonly duplicateClearAudit?: SensitiveDecisionAudit;
  /** Required when an authorised manager resolves a booking-level dispute. */
  readonly disputeResolutionAudit?: SensitiveDecisionAudit;
  /** Append-only local audit history: a second dispute must never erase the earlier decision. */
  readonly disputeResolutionHistory?: readonly SensitiveDecisionAudit[];

  /** Bir kez yazılır (kapanışta). */
  readonly settlementWeekId?: string;
  readonly settlementStatus: SettlementStatus;
  readonly invoiceReference?: string;
  readonly adjustmentReference?: string;
  readonly createdAt: string;
  readonly version: number;
}

export interface OutboxEvent {
  readonly id: string;
  /** Tekil anahtar: aynı olay iki kez yazılmaz (bildirim tekil gönderilir). */
  readonly dedupeKey: string;
  readonly type: string;
  readonly bookingId: string;
  /** Kişisel veri taşımaz; işçi kaydı API/DB'den yeniden okur. */
  readonly payload: Readonly<Record<string, string>>;
  readonly status: "pending" | "sent" | "retry" | "permanent_failure";
  readonly createdAt: string;
}

export interface IdempotencyRecord {
  readonly requestHash: string;
  readonly status: number;
  readonly body: unknown;
}

export interface Store {
  /** Tüm yazma işlemleri tek işlem (transaction) içinde; MemoryStore bunu sıraya dizerek taklit eder. */
  transaction<T>(fn: (tx: Store) => Promise<T>): Promise<T>;
  /** Single-use human challenge hash: atomic reservation inside the booking transaction (LOCAL_ONLY). */
  reserveHumanToken(hash: string, nowMs: number): Promise<boolean>;
  getIdempotency(scope: string): Promise<IdempotencyRecord | undefined>;
  putIdempotency(scope: string, rec: IdempotencyRecord): Promise<void>;
  insertBooking(b: StoredBooking): Promise<void>;
  /** Koşullu güncelleme: sürüm uyuşmazsa false (yarışı kaybeden taraf). */
  updateBooking(b: StoredBooking, expectedVersion: number): Promise<boolean>;
  getBookingByRef(ref: string): Promise<StoredBooking | undefined>;
  getBookingById(id: string): Promise<StoredBooking | undefined>;
  findActiveByFingerprint(fingerprint: string): Promise<StoredBooking | undefined>;
  listBookings(limit?: number): Promise<StoredBooking[]>;
  listRuns(routeCode: string, slotStart: string): Promise<ShuttleRun[]>;
  getRun(id: string): Promise<ShuttleRun | undefined>;
  saveRun(run: ShuttleRun): Promise<void>;
  appendOutbox(events: readonly OutboxEvent[]): Promise<void>;
  listOutbox(status?: OutboxEvent["status"]): Promise<OutboxEvent[]>;
  /** Dekontlar yalnız eklenir; aynı banka referansı ikinci kez kaydedilemez. */
  appendReceipt(r: BankReceipt): Promise<void>;
  listReceipts(weekId?: string): Promise<BankReceipt[]>;
  appendAdjustments(a: readonly Adjustment[]): Promise<void>;
  listAdjustments(): Promise<Adjustment[]>;
  /** Kapanmış haftanın anlık görüntüsü; bir hafta bir kez kapanır, sonradan değişmez. */
  saveClosedWeek(r: WeeklyReport): Promise<void>;
  getClosedWeek(weekId: string): Promise<WeeklyReport | undefined>;
  listClosedWeekIds(): Promise<string[]>;
  saveDispute(d: StatementDispute): Promise<void>;
  listDisputes(): Promise<StatementDispute[]>;
  /** Ekstre iletim zamanı: hafta + taraf → ilk iletim (sonradan değişmez). */
  recordStatementSent(weekId: string, partyId: string, at: string): Promise<string>;
  getStatementSent(weekId: string, partyId: string): Promise<string | undefined>;
}

interface Snapshot {
  idem: Map<string, IdempotencyRecord>;
  humanTokens: Map<string, number>;
  bookings: Map<string, StoredBooking>;
  runs: Map<string, ShuttleRun>;
  outbox: number;
  receipts: number;
  adjustments: number;
  closed: Map<string, WeeklyReport>;
  disputes: Map<string, StatementDispute>;
  sent: Map<string, string>;
}

export class MemoryStore implements Store {
  #queue: Promise<unknown> = Promise.resolve();
  // A single boolean incorrectly treats a *concurrent external call* as nested.
  // AsyncLocalStorage differentiates reentrancy from another request, preserving serial writes.
  readonly #txContext = new AsyncLocalStorage<symbol>();
  #activeTx: symbol | undefined;
  readonly #idem = new Map<string, IdempotencyRecord>();
  readonly #humanTokens = new Map<string, number>();
  readonly #bookings = new Map<string, StoredBooking>();
  readonly #runs = new Map<string, ShuttleRun>();
  readonly #outbox: OutboxEvent[] = [];
  readonly #receipts: BankReceipt[] = [];
  readonly #adjustments: Adjustment[] = [];
  readonly #closed = new Map<string, WeeklyReport>();
  readonly #disputes = new Map<string, StatementDispute>();
  readonly #sent = new Map<string, string>();

  transaction<T>(fn: (tx: Store) => Promise<T>): Promise<T> {
    if (this.#activeTx !== undefined && this.#txContext.getStore() === this.#activeTx) {
      return fn(this); // Only a true nested call inside this same transaction.
    }
    const run = this.#queue.then(() => {
      const token = Symbol("memory-transaction");
      this.#activeTx = token;
      const snapshot = this.#snapshot();
      return this.#txContext.run(token, async () => {
        try {
          return await fn(this);
        } catch (err) {
          this.#restore(snapshot);
          throw err;
        } finally {
          this.#activeTx = undefined;
        }
      });
    });
    this.#queue = run.catch(() => undefined);
    return run;
  }

  #snapshot(): Snapshot {
    return {
      idem: new Map(this.#idem),
      humanTokens: new Map(this.#humanTokens),
      bookings: new Map(this.#bookings),
      runs: new Map(this.#runs),
      outbox: this.#outbox.length,
      receipts: this.#receipts.length,
      adjustments: this.#adjustments.length,
      closed: new Map(this.#closed),
      disputes: new Map(this.#disputes),
      sent: new Map(this.#sent),
    };
  }

  #restore(s: Snapshot) {
    const reset = <K, V>(target: Map<K, V>, from: Map<K, V>) => {
      target.clear();
      from.forEach((v, k) => target.set(k, v));
    };
    reset(this.#idem, s.idem);
    reset(this.#humanTokens, s.humanTokens);
    reset(this.#bookings, s.bookings);
    reset(this.#runs, s.runs);
    reset(this.#closed, s.closed);
    reset(this.#disputes, s.disputes);
    reset(this.#sent, s.sent);
    this.#outbox.length = s.outbox;
    this.#receipts.length = s.receipts;
    this.#adjustments.length = s.adjustments;
  }

  async reserveHumanToken(hash: string, nowMs: number): Promise<boolean> {
    for (const [key, expiry] of this.#humanTokens) {
      if (expiry <= nowMs) this.#humanTokens.delete(key);
    }
    if (this.#humanTokens.has(hash)) return false;
    this.#humanTokens.set(hash, nowMs + 600_000);
    return true;
  }
  async getIdempotency(scope: string) {
    return this.#idem.get(scope);
  }
  async putIdempotency(scope: string, rec: IdempotencyRecord) {
    if (this.#idem.has(scope)) throw new Error("idempotency key already stored");
    this.#idem.set(scope, rec);
  }
  async insertBooking(b: StoredBooking) {
    if (this.#bookings.has(b.id) || [...this.#bookings.values()].some((x) => x.ref === b.ref)) {
      throw new Error("duplicate booking id/ref");
    }
    this.#bookings.set(b.id, b);
  }
  async updateBooking(b: StoredBooking, expectedVersion: number) {
    const cur = this.#bookings.get(b.id);
    if (!cur || cur.version !== expectedVersion) return false;
    this.#bookings.set(b.id, { ...b, version: expectedVersion + 1 });
    return true;
  }
  async getBookingByRef(ref: string) {
    return [...this.#bookings.values()].find((b) => b.ref === ref);
  }
  async getBookingById(id: string) {
    return this.#bookings.get(id);
  }
  async findActiveByFingerprint(fingerprint: string) {
    return [...this.#bookings.values()].find((b) => b.fingerprint === fingerprint && b.status !== "cancelled");
  }
  async listBookings(limit?: number) {
    const all = [...this.#bookings.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return limit === undefined ? all : all.slice(0, limit);
  }
  async listRuns(routeCode: string, slotStart: string) {
    return [...this.#runs.values()].filter((r) => r.routeCode === routeCode && r.slotStart === slotStart);
  }
  async getRun(id: string) {
    return this.#runs.get(id);
  }
  async saveRun(run: ShuttleRun) {
    this.#runs.set(run.id, run);
  }
  async appendOutbox(events: readonly OutboxEvent[]) {
    for (const e of events) {
      if (this.#outbox.some((x) => x.dedupeKey === e.dedupeKey)) continue;
      this.#outbox.push(e);
    }
  }
  async listOutbox(status?: OutboxEvent["status"]) {
    return this.#outbox.filter((e) => status === undefined || e.status === status);
  }
  async appendReceipt(r: BankReceipt) {
    if (this.#receipts.some((x) => normalizeBankReference(x.bank_reference) === normalizeBankReference(r.bank_reference) && x.payer_id === r.payer_id)) {
      throw new Error("duplicate bank reference");
    }
    this.#receipts.push(r);
  }
  async listReceipts(weekId?: string) {
    return this.#receipts.filter((r) => weekId === undefined || r.week_id === weekId);
  }
  async appendAdjustments(a: readonly Adjustment[]) {
    // Enforce unique business-reference atomically, including duplicates inside the same batch.
    const refs = new Set(this.#adjustments.map((x) => normalizeAdjustmentReference(x.adjustment_reference)));
    for (const item of a) {
      const ref = normalizeAdjustmentReference(item.adjustment_reference);
      if (refs.has(ref)) throw new Error("duplicate adjustment reference");
      refs.add(ref);
    }
    this.#adjustments.push(...a);
  }
  async listAdjustments() {
    return [...this.#adjustments];
  }
  async saveClosedWeek(r: WeeklyReport) {
    if (this.#closed.has(r.week.week_id)) throw new Error("week already closed");
    this.#closed.set(r.week.week_id, structuredClone(r));
  }
  async saveDispute(d: StatementDispute) {
    this.#disputes.set(d.id, d);
  }
  async listDisputes() {
    return [...this.#disputes.values()].sort((a, b) => a.id.localeCompare(b.id));
  }
  async recordStatementSent(weekId: string, partyId: string, at: string) {
    const k = `${weekId}|${partyId}`;
    if (!this.#sent.has(k)) this.#sent.set(k, at);
    return this.#sent.get(k)!;
  }
  async getStatementSent(weekId: string, partyId: string) {
    return this.#sent.get(`${weekId}|${partyId}`);
  }
  async listClosedWeekIds() {
    return [...this.#closed.keys()].sort();
  }
  async getClosedWeek(weekId: string) {
    const r = this.#closed.get(weekId);
    return r ? structuredClone(r) : undefined;
  }
}

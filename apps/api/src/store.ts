import type {
  BookingStatus,
  CollectionMode,
  IntakeRequest,
  LedgerEntry,
  OperationsOwner,
  PaymentStatus,
  PriceSnapshot,
  Product,
  ShuttleRun,
} from "@ag/core";

// Depo arayüzü. Üretimde bunun karşılığı merkezi rezervasyon PostgreSQL'idir (CRS);
// şema adayı: packages/db/migrations. Bu dosyadaki MemoryStore yalnız yerel geliştirme ve test içindir.

export interface StoredBooking {
  readonly id: string;
  readonly ref: string;
  readonly siteId: string;
  readonly product: Product;
  readonly status: BookingStatus;
  readonly paymentStatus: PaymentStatus;
  readonly collectionMode?: CollectionMode;
  readonly operationsOwner: OperationsOwner;
  readonly sourcePartnerId?: string;
  readonly request: IntakeRequest;
  readonly price?: PriceSnapshot;
  readonly lookupTokenHash: string;
  readonly fingerprint: string;
  readonly isDuplicate: boolean;
  readonly isTest: boolean;
  readonly shuttleRunId?: string;
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
  getIdempotency(scope: string): Promise<IdempotencyRecord | undefined>;
  putIdempotency(scope: string, rec: IdempotencyRecord): Promise<void>;
  insertBooking(b: StoredBooking): Promise<void>;
  /** Koşullu güncelleme: sürüm uyuşmazsa false (yarışı kaybeden taraf). */
  updateBooking(b: StoredBooking, expectedVersion: number): Promise<boolean>;
  getBookingByRef(ref: string): Promise<StoredBooking | undefined>;
  getBookingById(id: string): Promise<StoredBooking | undefined>;
  findActiveByFingerprint(fingerprint: string): Promise<StoredBooking | undefined>;
  listBookings(limit: number): Promise<StoredBooking[]>;
  listRuns(routeCode: string, slotStart: string): Promise<ShuttleRun[]>;
  getRun(id: string): Promise<ShuttleRun | undefined>;
  saveRun(run: ShuttleRun): Promise<void>;
  appendOutbox(events: readonly OutboxEvent[]): Promise<void>;
  listOutbox(status?: OutboxEvent["status"]): Promise<OutboxEvent[]>;
  appendLedger(entries: readonly LedgerEntry[]): Promise<void>;
  listLedger(bookingId?: string): Promise<LedgerEntry[]>;
}

interface Snapshot {
  idem: Map<string, IdempotencyRecord>;
  bookings: Map<string, StoredBooking>;
  runs: Map<string, ShuttleRun>;
  outbox: number;
  ledger: number;
}

export class MemoryStore implements Store {
  #queue: Promise<unknown> = Promise.resolve();
  #inTx = false;
  readonly #idem = new Map<string, IdempotencyRecord>();
  readonly #bookings = new Map<string, StoredBooking>();
  readonly #runs = new Map<string, ShuttleRun>();
  readonly #outbox: OutboxEvent[] = [];
  readonly #ledger: LedgerEntry[] = [];

  transaction<T>(fn: (tx: Store) => Promise<T>): Promise<T> {
    if (this.#inTx) return fn(this);
    const run = this.#queue.then(async () => {
      this.#inTx = true;
      // Basit geri alma: hata olursa anlık görüntüye dön.
      const snapshot = this.#snapshot();
      try {
        return await fn(this);
      } catch (err) {
        this.#restore(snapshot);
        throw err;
      } finally {
        this.#inTx = false;
      }
    });
    this.#queue = run.catch(() => undefined);
    return run;
  }

  #snapshot(): Snapshot {
    return {
      idem: new Map(this.#idem),
      bookings: new Map(this.#bookings),
      runs: new Map(this.#runs),
      outbox: this.#outbox.length,
      ledger: this.#ledger.length,
    };
  }

  #restore(s: Snapshot) {
    this.#idem.clear();
    s.idem.forEach((v, k) => this.#idem.set(k, v));
    this.#bookings.clear();
    s.bookings.forEach((v, k) => this.#bookings.set(k, v));
    this.#runs.clear();
    s.runs.forEach((v, k) => this.#runs.set(k, v));
    this.#outbox.length = s.outbox;
    this.#ledger.length = s.ledger;
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
  async listBookings(limit: number) {
    return [...this.#bookings.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
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
  async appendLedger(entries: readonly LedgerEntry[]) {
    this.#ledger.push(...entries);
  }
  async listLedger(bookingId?: string) {
    return this.#ledger.filter((e) => bookingId === undefined || e.bookingId === bookingId);
  }
}

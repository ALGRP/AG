import { createHash, timingSafeEqual } from "node:crypto";
import {
  COLLECTION_METHODS,
  assertTransition,
  bookingRef,
  checkManualPrice,
  collectionSummary,
  duplicateFingerprintInput,
  money,
  nextWeekId,
  placeInPool,
  priceShuttle,
  privateSplit,
  resolveSite,
  settlementWeekId,
  shuttleSplit,
  slotStartFor,
  transfers,
  validateIntake,
  weekBounds,
  weeklyReport,
  type Adjustment,
  type BankReceipt,
  type CollectionMethod,
  type Collector,
  type FieldError,
  type MoneyEvent,
  type SettlementEntry,
  type SettlementLine,
  type ShuttleTariffVersion,
  type SiteRecord,
  type SplitPolicy,
  type StatementDispute,
} from "@ag/core";
import { normalizeBankReference } from "./store.ts";
import type { OutboxEvent, Store, StoredBooking } from "./store.ts";

export interface ServiceDeps {
  readonly store: Store;
  readonly sites: ReadonlyMap<string, SiteRecord>;
  readonly shuttleTariff: ShuttleTariffVersion;
  /** Shuttle %20 / %10 / %70 — tek kaynak (SHUTTLE_SPLIT_V1). */
  readonly shuttlePolicy: SplitPolicy;
  /** D-F05: artık güncel olmayan onaylı bölüşüm politikaları; o politikayla dondurulmuş rezervasyonlar bunlarla hesaplanır. */
  readonly splitPolicies?: readonly SplitPolicy[];
  readonly pool: { readonly slotMinutes: number; readonly vehicleCapacity: number };
  /** Yerel önizleme için ek origin'ler (ör. http://localhost:4321). Üretimde boş. */
  readonly devOrigins: readonly string[];
  readonly clock: () => Date;
  readonly random: {
    readonly id: () => string;
    readonly index: (maxExclusive: number) => number;
    readonly token: () => string;
  };
  /** Turnstile/hCaptcha doğrulaması. Yapılandırılmamışsa çağıran "true" döndüren sahte verir (yalnız yerel). */
  readonly verifyHuman: (token: string | undefined, ip: string) => Promise<boolean>;
}

/**
 * İşlemi yapan kimlik. Gerçek kimlik sağlayıcı + 2FA (SEL-332) gelene kadar HTTP katmanındaki geçici admin
 * anahtarı `mfa: false` taşır; 2FA zorunlu işlemler (K17 fiyat onayı, itiraz kararı, mahsup) bu yüzden kapalıdır.
 */
export interface Actor {
  readonly id: string;
  readonly role: "admin" | "finance_manager" | "operator";
  readonly mfa: boolean;
}

export type ServiceResult<T> = { ok: true; status: number; body: T } | { ok: false; status: number; body: ApiError };

export interface ApiError {
  readonly error: string;
  readonly fields?: readonly FieldError[];
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
/** Taraf kimlikleri küçük harf (büyük/küçük harf farkıyla kural atlatılamaz). */
const ID = /^[a-z0-9_-]{1,64}$/;

/** İtiraz notunda e-posta ve telefon numarası saklanmaz (kişisel veri). */
function redactPii(text: string): string {
  return text.replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[e-posta]").replace(/\+?\d[\d ()-]{6,}\d/g, "[telefon]");
}

function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function fail(status: number, error: string, fields?: readonly FieldError[]): ServiceResult<never> {
  return { ok: false, status, body: fields ? { error, fields } : { error } };
}

const ok = <T>(body: T, status = 200): ServiceResult<T> => ({ ok: true, status, body });

export class BookingService {
  readonly #d: ServiceDeps;
  constructor(deps: ServiceDeps) {
    this.#d = deps;
  }

  #now(): string {
    return this.#d.clock().toISOString();
  }

  #event(b: StoredBooking, type: string, payload: Record<string, string> = {}): OutboxEvent {
    return {
      id: this.#d.random.id(),
      dedupeKey: `${type}:${b.id}`,
      type,
      bookingId: b.id,
      payload: { siteId: b.siteId, ...payload },
      status: "pending",
      createdAt: this.#now(),
    };
  }

  /** Okuma–değiştirme–yazma, sürüm kontrollü. fn ya hata döner ya da yeni kaydı. */
  async #mutate(
    ref: string,
    fn: (b: StoredBooking, tx: Store) => Promise<ServiceResult<never> | StoredBooking>,
  ): Promise<ServiceResult<unknown>> {
    return this.#d.store.transaction(async (tx) => {
      const b = await tx.getBookingByRef(ref);
      if (!b) return fail(404, "not_found");
      const r = await fn(b, tx);
      if ("ok" in r) return r;
      if (!(await tx.updateBooking(r, b.version))) return fail(409, "version_conflict");
      return ok(this.#adminView({ ...r, version: b.version + 1 }));
    });
  }

  // ================================================================ Herkese açık (uydu siteler)

  async submit(input: {
    raw: unknown;
    origin: string | undefined;
    ip: string;
    idempotencyKey: string | undefined;
  }): Promise<ServiceResult<unknown>> {
    const key = input.idempotencyKey;
    if (!key || !/^[A-Za-z0-9_-]{16,128}$/.test(key)) return fail(400, "idempotency_key_required");
    const rawSite =
      typeof input.raw === "object" && input.raw !== null ? (input.raw as Record<string, unknown>).siteId : undefined;
    const scope = `intake:${String(rawSite)}:${key}`;
    const requestHash = sha256(JSON.stringify(input.raw));

    return this.#d.store.transaction(async (tx) => {
      const prior = await tx.getIdempotency(scope);
      if (prior) {
        if (prior.requestHash !== requestHash) return fail(409, "idempotency_key_reused_with_different_body");
        return prior.status < 400 ? ok(prior.body, prior.status) : { ok: false, status: prior.status, body: prior.body as ApiError };
      }
      const result = await this.#createBooking(tx, input);
      if (result.ok) await tx.putIdempotency(scope, { requestHash, status: result.status, body: result.body });
      return result;
    });
  }

  async #createBooking(tx: Store, input: { raw: unknown; origin: string | undefined; ip: string }): Promise<ServiceResult<unknown>> {
    const v = validateIntake(input.raw);
    if (!v.ok) return fail(422, "validation_failed", v.errors);
    const req = v.value;

    const resolved = resolveSite(this.#d.sites, req.siteId, input.origin, this.#d.devOrigins);
    if (!resolved.ok) return fail(resolved.reason === "unknown_site" ? 404 : 403, resolved.reason);
    const site = resolved.site;
    if (!(await this.#d.verifyHuman(req.humanToken, input.ip))) return fail(403, "human_check_failed");
    if (req.paymentMethod !== undefined && !site.collectionMethods.includes(req.paymentMethod)) {
      return fail(422, "payment_method_not_allowed_for_site");
    }

    const now = this.#now();
    const id = this.#d.random.id();
    const lookupToken = this.#d.random.token();
    const fingerprint = sha256(duplicateFingerprintInput(req));
    const isDuplicate = (await tx.findActiveByFingerprint(fingerprint)) !== undefined;
    let ref = bookingRef(this.#d.random.index);
    for (let i = 0; (await tx.getBookingByRef(ref)) !== undefined; i++) {
      if (i >= 8) throw new Error("could not allocate a unique booking ref");
      ref = bookingRef(this.#d.random.index);
    }

    let booking: StoredBooking = {
      id,
      ref,
      siteId: site.id,
      sellingPartyId: site.ownerPartyId,
      product: req.product,
      status: "request",
      request: req,
      lookupTokenHash: sha256(lookupToken),
      fingerprint,
      isDuplicate,
      isTest: site.status === "preview",
      allowedCollectionMethods: site.collectionMethods,
      ...(req.paymentMethod !== undefined ? { preferredCollectionMethod: req.paymentMethod } : {}),
      moneyEvents: [],
      settlementStatus: "open",
      createdAt: now,
      version: 1,
    };
    const events: OutboxEvent[] = [];
    let next: string;

    if (req.product === "shuttle") {
      if (req.returnPickupAt !== undefined) return fail(422, "shuttle_return_must_be_booked_separately");
      const price = priceShuttle(this.#d.shuttleTariff, req.routeCode!, req.pickupAt.slice(0, 10), req.passengers);
      // 5+ kişi: Owner kararı K17 — otomatik fiyat yok, manuel onay.
      if (!price.ok && price.reason !== "requires_approval") return fail(422, price.reason);
      const slotRuns = await tx.listRuns(req.routeCode!, slotStartFor(req.pickupAt, this.#d.pool.slotMinutes));
      const poolBooking = { bookingId: id, passengers: req.passengers, routeCode: req.routeCode!, pickupAt: req.pickupAt };
      const poolOpts = { slotMinutes: this.#d.pool.slotMinutes, capacity: this.#d.pool.vehicleCapacity, newRunId: this.#d.random.id };
      let placement = placeInPool(slotRuns, poolBooking, poolOpts);
      // A late joiner inherits the run's assigned supplier only after the same eligibility check.
      // If that supplier cannot serve this site, keep the booking in a different OPEN run.
      if (placement.run.status === "assigned") {
        const payee = placement.run.carrierPayeeId;
        if (!payee || this.#checkSupplier(site, payee)) {
          placement = placeInPool(slotRuns.filter((run) => run.status === "open"), poolBooking, poolOpts);
        }
      }
      await tx.saveRun(placement.run);
      booking = {
        ...booking,
        shuttleRunId: placement.run.id,
        ...(placement.run.status === "assigned" && placement.run.carrierPayeeId ? { supplierId: placement.run.carrierPayeeId } : {}),
        ...(price.ok
          ? { price: { mode: "FIXED_SHUTTLE" as const, total: price.total, sourceVersionId: price.tariffVersionId, frozenAt: now, splitPolicyId: this.#d.shuttlePolicy.id } }
          : {}),
      };
      events.push(this.#event(booking, "shuttle.booking_received.notify_central", { runId: placement.run.id }));
      if (!price.ok) events.push(this.#event(booking, "shuttle.price_approval_required.notify_central"));
      events.push(this.#event(booking, "shuttle.booking_received.notify_site_owner"));
      next = price.ok ? "operations_will_confirm" : "price_requires_approval";
    } else {
      // Private / VIP: sabit komisyon yok. Fiyat sitenin kendi satış fiyatı; tedarikçi hak edişini site belirler.
      const sale = site.salePrices?.[req.product];
      if (sale !== undefined && site.saleCurrency) {
        booking = { ...booking, price: { mode: "SITE_PRICE", total: money(sale, site.saleCurrency), sourceVersionId: `site:${site.id}`, frozenAt: now } };
      }
      events.push(this.#event(booking, "private.request_received.notify_site_owner", { to: "site_owner_email" }));
      events.push(this.#event(booking, "private.request_received.notify_central"));
      next = "site_owner_will_confirm";
    }
    events.push(this.#event(booking, "booking.request_received.notify_customer"));
    await tx.insertBooking(booking);
    await tx.appendOutbox(events);
    return ok(
      {
        ref,
        lookupToken,
        product: req.product,
        status: booking.status,
        ...(booking.price ? { price: { amountMinor: booking.price.total.amountMinor, currency: booking.price.total.currency } } : {}),
        next,
      },
      201,
    );
  }

  /** Rezervasyon sorgulama: kod + gizli sorgu jetonu. Eşleşmezse her durumda 404. */
  async lookup(ref: string, token: string | undefined): Promise<ServiceResult<unknown>> {
    if (!token) return fail(404, "not_found");
    const b = await this.#d.store.getBookingByRef(ref);
    if (!b || !safeEqualHex(b.lookupTokenHash, sha256(token))) return fail(404, "not_found");
    return ok({
      ref: b.ref,
      product: b.product,
      status: b.status,
      pickupAt: b.request.pickupAt,
      pickup: b.request.pickup,
      dropoff: b.request.dropoff,
      passengers: b.request.passengers,
      ...(b.price ? { price: { amountMinor: b.price.total.amountMinor, currency: b.price.total.currency } } : {}),
    });
  }

  quoteShuttle(routeCode: string, date: string, passengers: number): ServiceResult<unknown> {
    const r = priceShuttle(this.#d.shuttleTariff, routeCode, date, passengers);
    if (!r.ok && r.reason === "requires_approval") return ok({ requiresApproval: true });
    if (!r.ok) return fail(422, r.reason);
    return ok({ amountMinor: r.total.amountMinor, currency: r.total.currency, tariffVersionId: r.tariffVersionId });
  }

  // ================================================================ Settlement satırı

  /** Rezervasyonun K15 alanları + para hareketleri. Fiyat ve tedarikçi belli değilse null. */
  /** D-F05: rezervasyonun fiyatla dondurulmuş bölüşüm politikası; eski kayıtta yoksa güncel politika. Bilinmeyen politika hata verir. */
  #splitPolicy(id: string | undefined): SplitPolicy {
    if (id === undefined || id === this.#d.shuttlePolicy.id) return this.#d.shuttlePolicy;
    const p = this.#d.splitPolicies?.find((x) => x.id === id);
    if (!p) throw new Error(`unknown_split_policy:${id}`);
    return p;
  }

  toLine(b: StoredBooking): SettlementLine | null {
    if (!b.price) return null;
    const supplierId = b.supplierId ?? (b.status === "cancelled" ? "unassigned" : undefined);
    if (!supplierId) return null;
    const final = b.price.total.amountMinor;
    const currency = b.price.total.currency;
    const split =
      b.product === "shuttle"
        ? shuttleSplit(final, currency, b.sellingPartyId, supplierId, this.#splitPolicy(b.price.splitPolicyId))
        : privateSplit(final, b.supplierEntitlementMinor ?? final, b.sellingPartyId, supplierId);
    const first = b.moneyEvents.find((e) => e.kind === "collection");
    const collector: Collector = first?.collector ?? "supplier";
    const sum = collectionSummary(b.moneyEvents, final);
    return {
      booking_id: b.id,
      booking_ref: b.ref,
      selling_site_id: b.siteId,
      selling_party_id: b.sellingPartyId,
      supplier_id: supplierId,
      service_type: b.product,
      final_booking_price: final,
      currency,
      collection_method: first?.method ?? null,
      collector,
      collection_status: sum.status,
      collected_amount: sum.net,
      refunded_amount: sum.refunded,
      collected_at: sum.firstAt,
      completed_at: b.completedAt ?? null,
      cancelled: b.status === "cancelled",
      cancelled_at: b.cancelledAt ?? null,
      disputed: b.disputedAt !== undefined && b.disputeResolvedAt === undefined,
      disputed_at: b.disputeResolvedAt === undefined ? (b.disputedAt ?? null) : null,
      dispute_reason: b.disputeReason ?? null,
      suspected_duplicate: b.isDuplicate,
      self_supplied: split.self_supplied,
      site_commission_amount: split.site_commission_amount,
      agos_fee_amount: split.agos_fee_amount,
      supplier_entitlement: split.supplier_entitlement,
      ...transfers(split, final, collector),
      policy_id: split.policy_id,
      settlement_week_id: b.settlementWeekId ?? null,
      settlement_status: b.settlementStatus,
      payment_reference: null,
      invoice_reference: b.invoiceReference ?? null,
      adjustment_reference: b.adjustmentReference ?? null,
      money_events: b.moneyEvents,
    };
  }

  #adminView(b: StoredBooking) {
    const line = this.toLine(b);
    const { money_events: _m, ...settlement } = line ?? ({ money_events: [] } as unknown as SettlementLine);
    return {
      ref: b.ref,
      siteId: b.siteId,
      product: b.product,
      status: b.status,
      pickupAt: b.request.pickupAt,
      passengers: b.request.passengers,
      shuttleRunId: b.shuttleRunId ?? null,
      price: b.price ? { amountMinor: b.price.total.amountMinor, currency: b.price.total.currency, mode: b.price.mode } : null,
      priceStatus: b.price ? "set" : b.product === "shuttle" ? "requires_approval" : "quote_pending",
      priceApproval: b.priceApproval ?? null,
      isDuplicate: b.isDuplicate,
      isTest: b.isTest,
      moneyEvents: b.moneyEvents,
      settlement: line ? settlement : null,
    };
  }

  // ================================================================ Yönetim

  async listBookings(): Promise<ServiceResult<unknown>> {
    return ok((await this.#d.store.listBookings(200)).map((b) => this.#adminView(b)));
  }

  async outbox(): Promise<ServiceResult<unknown>> {
    return ok(await this.#d.store.listOutbox("pending"));
  }

  async confirm(ref: string): Promise<ServiceResult<unknown>> {
    return this.#mutate(ref, async (b, tx) => {
      if (b.product === "shuttle" && !b.price) return fail(409, "price_requires_approval");
      try {
        assertTransition(b.status, "confirmed");
      } catch {
        return fail(409, "invalid_transition");
      }
      await tx.appendOutbox([this.#event(b, "booking.confirmed.notify_customer")]);
      return { ...b, status: "confirmed" };
    });
  }

  #requireMfa(actor: Actor, roles: readonly Actor["role"][]): ServiceResult<never> | null {
    if (!actor.mfa) return fail(403, "mfa_required");
    if (!roles.includes(actor.role)) return fail(403, "role_not_allowed");
    return null;
  }

  /**
   * K17 (taslak): 5+ kişilik shuttle için manuel fiyat. Yalnız 2FA'lı yetkili yönetici; yalnız hattın Owner onaylı
   * alt/üst sınırı içinde; gerekçe zorunlu; kim/rol/zaman/eski-yeni fiyat/gerekçe denetim kaydına yazılır.
   * Onaylanmamış fiyat müşteriye kesin teklif olarak gösterilmez (fiyat alanı boş kalır).
   */
  async approveShuttlePrice(actor: Actor, ref: string, input: Record<string, unknown>): Promise<ServiceResult<unknown>> {
    const denied = this.#requireMfa(actor, ["admin", "finance_manager"]);
    if (denied) return denied;
    const { amountMinor, currency, reason } = input;
    if (typeof reason !== "string" || reason.trim().length < 5) return fail(422, "reason_required");
    if (currency !== this.#d.shuttleTariff.currency) return fail(422, "currency_must_match_tariff");
    return this.#mutate(ref, async (b, tx) => {
      if (b.product !== "shuttle") return fail(409, "not_a_shuttle_booking");
      if (b.price) return fail(409, "price_already_set");
      if (b.status !== "request") return fail(409, "invalid_transition");
      const check = checkManualPrice(this.#d.shuttleTariff, b.request.routeCode!, amountMinor as number);
      if (!check.ok) return fail(422, check.reason);
      const now = this.#now();
      await tx.appendOutbox([this.#event(b, "audit.manual_price_approved", { actor: actor.id, role: actor.role })]);
      return {
        ...b,
        price: { mode: "SHUTTLE_MANUAL_APPROVED", total: money(amountMinor as number, this.#d.shuttleTariff.currency), sourceVersionId: `manual-approval:${this.#d.shuttleTariff.id}`, frozenAt: now, splitPolicyId: this.#d.shuttlePolicy.id },
        priceApproval: { actorId: actor.id, actorRole: actor.role, at: now, oldPriceMinor: null, newPriceMinor: amountMinor as number, reason: redactPii(reason.trim()).slice(0, 300) },
      };
    });
  }

  #checkSupplier(site: SiteRecord | undefined, supplierId: unknown): ServiceResult<never> | null {
    if (typeof supplierId !== "string" || !ID.test(supplierId)) return fail(422, "supplierId_invalid");
    if (site && supplierId === site.ownerPartyId && !site.selfOperationVerifiedAt) return fail(409, "self_operation_not_verified");
    return null;
  }

  async assignRun(runId: string, supplierId: unknown): Promise<ServiceResult<unknown>> {
    if (typeof supplierId !== "string" || !ID.test(supplierId)) return fail(422, "supplierId_invalid");
    return this.#d.store.transaction(async (tx) => {
      const run = await tx.getRun(runId);
      if (!run) return fail(404, "not_found");
      if (run.status !== "open") return fail(409, "run_not_open");
      const bookings = (await Promise.all(run.bookings.map((x) => tx.getBookingById(x.bookingId)))).filter(
        (b): b is StoredBooking => b !== undefined && b.status !== "cancelled",
      );
      for (const b of bookings) {
        const bad = this.#checkSupplier(this.#d.sites.get(b.siteId), supplierId);
        if (bad) return bad;
      }
      await tx.saveRun({ ...run, status: "assigned", carrierPayeeId: supplierId });
      for (const b of bookings) {
        if (!(await tx.updateBooking({ ...b, supplierId }, b.version))) throw new Error("version_conflict");
      }
      return ok({ runId, status: "assigned", supplierId });
    });
  }

  /** Sefer tamamlandı: onaylı ve fiyatlı rezervasyonlar "delivered"; bekleyen varsa sefer açık kalır. */
  async completeRun(runId: string): Promise<ServiceResult<unknown>> {
    return this.#d.store.transaction(async (tx) => {
      const run = await tx.getRun(runId);
      if (!run) return fail(404, "not_found");
      if (run.status !== "assigned") return fail(409, "run_not_assigned");
      const now = this.#now();
      const outcome: Array<{ ref: string; result: string }> = [];
      let pending = 0;
      for (const item of run.bookings) {
        const b = await tx.getBookingById(item.bookingId);
        if (!b || b.status === "cancelled" || b.status === "delivered") continue;
        if (b.status !== "confirmed" || !b.price) {
          pending++;
          outcome.push({ ref: b.ref, result: b.price ? `pending_${b.status}` : "pending_price_not_approved" });
          continue;
        }
        if (!run.carrierPayeeId || b.supplierId !== run.carrierPayeeId) {
          pending++;
          outcome.push({ ref: b.ref, result: "pending_supplier_assignment" });
          continue;
        }
        if (!(await tx.updateBooking({ ...b, status: "delivered", completedAt: now }, b.version))) throw new Error("version_conflict");
        outcome.push({ ref: b.ref, result: "completed" });
      }
      const status = pending > 0 ? "assigned" : "completed";
      await tx.saveRun({ ...run, status });
      return ok({ runId, status, bookings: outcome });
    });
  }

  async assignPrivate(ref: string, input: Record<string, unknown>): Promise<ServiceResult<unknown>> {
    const { mode, supplierId, supplierEntitlementMinor } = input;
    if (mode === "pool") return fail(501, "pool_not_available_in_this_version");
    if (mode !== "self" && mode !== "pass") return fail(422, "mode_invalid");
    return this.#mutate(ref, async (b) => {
      if (b.product === "shuttle") return fail(409, "use_shuttle_run_assignment");
      if (!b.price) return fail(409, "price_not_set");
      if (b.status !== "request" && b.status !== "confirmed") return fail(409, "invalid_transition");
      if (b.moneyEvents.length > 0) return fail(409, "collection_already_recorded");
      const site = this.#d.sites.get(b.siteId);
      const supplier = mode === "self" ? b.sellingPartyId : supplierId;
      const bad = this.#checkSupplier(site, supplier);
      if (bad) return bad;
      if (mode === "pass") {
        if (supplier === b.sellingPartyId) return fail(422, "use_self_mode");
        const e = supplierEntitlementMinor;
        if (!Number.isSafeInteger(e) || (e as number) < 0 || (e as number) > b.price.total.amountMinor) return fail(422, "supplierEntitlementMinor_invalid");
        return { ...b, supplierId: supplier as string, supplierEntitlementMinor: e as number };
      }
      const { supplierEntitlementMinor: _drop, ...rest } = b;
      return { ...rest, supplierId: supplier as string };
    });
  }

  async completePrivate(ref: string): Promise<ServiceResult<unknown>> {
    return this.#mutate(ref, async (b) => {
      if (b.product === "shuttle") return fail(409, "use_shuttle_run_completion");
      if (!b.supplierId) return fail(409, "supplier_not_assigned");
      if (b.status !== "confirmed") return fail(409, "invalid_transition");
      return { ...b, status: "delivered", completedAt: this.#now() };
    });
  }

  /**
   * Müşteri tahsilatı (T2: kısmi tahsilat ve sonradan kalan tahsilat ayrı kayıtlar). Her kayıt bir kanıt
   * referansı taşır (dekont/POS slip/makbuz) ve rezervasyon içinde tekildir — aynı tahsilat iki kez yazılmaz.
   * Shuttle'da tahsil eden tedarikçidir. Satış fiyatını aşan tutar kaydedilir ama pay satış fiyatına kadar
   * hesaplanır; fazlası müşteriye iade edilmek üzere istisna listesine düşer (T1).
   */
  async recordCollection(ref: string, input: Record<string, unknown>): Promise<ServiceResult<unknown>> {
    const { method, amountMinor, collector, reference } = input;
    if (!(COLLECTION_METHODS as readonly unknown[]).includes(method)) return fail(422, "method_invalid");
    if (collector !== "supplier" && collector !== "site") return fail(422, "collector_invalid");
    if (!Number.isSafeInteger(amountMinor) || (amountMinor as number) <= 0) return fail(422, "amountMinor_invalid");
    if (typeof reference !== "string" || !/^[A-Za-z0-9./_-]{3,64}$/.test(reference)) return fail(422, "reference_required");
    return this.#mutate(ref, async (b) => {
      if (b.moneyEvents.some((e) => e.reference === reference)) return fail(409, "reference_already_recorded");
      if (!b.price) return fail(409, "price_not_set");
      if (!b.supplierId) return fail(409, "supplier_not_assigned");
      if (b.status === "cancelled") return fail(409, "booking_cancelled");
      if (b.product === "shuttle" && collector !== "supplier") return fail(422, "shuttle_collection_is_by_supplier");
      const first = b.moneyEvents.find((e) => e.kind === "collection");
      if (first && first.collector !== collector) return fail(422, "collector_must_not_change");
      if (!b.allowedCollectionMethods.includes(method as CollectionMethod)) return fail(422, "method_not_allowed_for_booking");
      const ev: MoneyEvent = { id: this.#d.random.id(), kind: "collection", amount: amountMinor as number, at: this.#now(), method: method as CollectionMethod, collector: collector as Collector, reference };
      return { ...b, moneyEvents: [...b.moneyEvents, ev] };
    });
  }

  /**
   * Müşteriye iade (T1): ayrı kayıt + kanıt referansı (tekil). Payların yeniden hesabı otomatiktir: iade net
   * tahsilatı düşürür, haftalık kapanış farkı negatif yazar (eski hafta değişmez).
   */
  async refund(ref: string, input: Record<string, unknown>): Promise<ServiceResult<unknown>> {
    const { amountMinor, refundReference } = input;
    if (!Number.isSafeInteger(amountMinor) || (amountMinor as number) <= 0) return fail(422, "amountMinor_invalid");
    if (typeof refundReference !== "string" || !/^[A-Za-z0-9./_-]{3,64}$/.test(refundReference)) return fail(422, "refundReference_invalid");
    return this.#mutate(ref, async (b, tx) => {
      if (b.moneyEvents.some((e) => e.reference === refundReference)) return fail(409, "refund_reference_already_used");
      const first = b.moneyEvents.find((e) => e.kind === "collection");
      if (!first || !b.price) return fail(409, "nothing_collected");
      const net = collectionSummary(b.moneyEvents, b.price.total.amountMinor).net;
      if ((amountMinor as number) > net) return fail(422, "refund_exceeds_collected");
      const ev: MoneyEvent = { id: this.#d.random.id(), kind: "refund", amount: amountMinor as number, at: this.#now(), method: first.method, collector: first.collector, reference: refundReference };
      if (b.settlementWeekId) await tx.appendOutbox([this.#event(b, "finance.refund_after_settlement", { reference: refundReference })]);
      return { ...b, moneyEvents: [...b.moneyEvents, ev], ...(b.settlementWeekId ? { settlementStatus: "adjusted" as const } : {}) };
    });
  }

  async clearDuplicate(ref: string): Promise<ServiceResult<unknown>> {
    return this.#mutate(ref, async (b) => (b.isDuplicate ? { ...b, isDuplicate: false } : fail(409, "not_flagged_as_duplicate")));
  }

  async dispute(ref: string, input: Record<string, unknown>): Promise<ServiceResult<unknown>> {
    const reason = typeof input.reason === "string" ? redactPii(input.reason.trim()).slice(0, 300) : "";
    if (!reason) return fail(422, "reason_required");
    return this.#mutate(ref, async (b, tx) => {
      if (b.disputedAt && !b.disputeResolvedAt) return fail(409, "already_disputed");
      await tx.appendOutbox([this.#event(b, "finance.dispute_opened")]);
      const { disputeResolvedAt: _r, disputeOutcome: _o, ...rest } = b;
      return { ...rest, disputedAt: this.#now(), disputeReason: reason };
    });
  }

  async resolveDispute(ref: string, input: Record<string, unknown>): Promise<ServiceResult<unknown>> {
    const { outcome } = input;
    if (outcome !== "upheld" && outcome !== "rejected") return fail(422, "outcome_invalid");
    return this.#mutate(ref, async (b, tx) => {
      if (!b.disputedAt || b.disputeResolvedAt) return fail(409, "no_open_dispute");
      await tx.appendOutbox([this.#event(b, "finance.dispute_resolved", { outcome })]);
      return { ...b, disputeResolvedAt: this.#now(), disputeOutcome: outcome };
    });
  }

  async cancel(ref: string): Promise<ServiceResult<unknown>> {
    return this.#mutate(ref, async (b, tx) => {
      try {
        assertTransition(b.status, "cancelled");
      } catch {
        return fail(409, "invalid_transition");
      }
      const events = [this.#event(b, "booking.cancelled.notify_customer")];
      const held = b.price ? collectionSummary(b.moneyEvents, b.price.total.amountMinor).net : 0;
      if (held > 0) events.push(this.#event(b, "finance.refund_due", { amountMinor: String(held) }));
      if (b.shuttleRunId) {
        const run = await tx.getRun(b.shuttleRunId);
        if (run && (run.status === "open" || run.status === "assigned")) await tx.saveRun({ ...run, bookings: run.bookings.filter((x) => x.bookingId !== b.id) });
      }
      await tx.appendOutbox(events);
      return { ...b, status: "cancelled", cancelledAt: this.#now() };
    });
  }

  async setInvoiceReference(ref: string, input: Record<string, unknown>): Promise<ServiceResult<unknown>> {
    const inv = typeof input.invoiceReference === "string" ? input.invoiceReference.trim() : "";
    if (!/^[A-Za-z0-9./_-]{1,64}$/.test(inv)) return fail(422, "invoiceReference_invalid");
    return this.#mutate(ref, async (b) => (b.invoiceReference ? fail(409, "invoice_reference_already_set") : { ...b, invoiceReference: inv }));
  }

  // ================================================================ Dekont, itiraz, mahsup, kapanış

  async addReceipt(input: Record<string, unknown>): Promise<ServiceResult<unknown>> {
    const { weekId, payerId, payeeId, amountMinor, currency, bankReference, paidAt } = input;
    const purpose = input.purpose ?? "settlement";
    if (purpose !== "settlement" && purpose !== "subscription" && purpose !== "overpayment_refund") return fail(422, "purpose_invalid");
    if (typeof weekId !== "string") return fail(422, "weekId_invalid");
    try {
      weekBounds(weekId);
    } catch {
      return fail(422, "weekId_invalid");
    }
    if (typeof payerId !== "string" || !ID.test(payerId) || typeof payeeId !== "string" || !ID.test(payeeId)) return fail(422, "party_invalid");
    if (!Number.isSafeInteger(amountMinor) || (amountMinor as number) <= 0) return fail(422, "amountMinor_invalid");
    if (currency !== this.#d.shuttleTariff.currency) return fail(422, "currency_invalid");
    if (typeof bankReference !== "string" || !/^[A-Za-z0-9./_ -]{3,96}$/.test(bankReference) || !/^[A-Z0-9./_-]{3,64}$/.test(normalizeBankReference(bankReference))) return fail(422, "bankReference_invalid");
    if (typeof paidAt !== "string" || Number.isNaN(Date.parse(paidAt))) return fail(422, "paidAt_invalid");
    const r: BankReceipt = {
      id: this.#d.random.id(),
      week_id: weekId,
      payer_id: payerId,
      payee_id: payeeId,
      amount: amountMinor as number,
      currency: this.#d.shuttleTariff.currency,
      bank_reference: bankReference,
      paid_at: new Date(paidAt).toISOString(),
      purpose,
    };
    return this.#d.store.transaction(async (tx) => {
      if ((await tx.listReceipts()).some((x) => normalizeBankReference(x.bank_reference) === normalizeBankReference(r.bank_reference) && x.payer_id === r.payer_id)) return fail(409, "duplicate_bank_reference");
      await tx.appendReceipt(r);
      return ok(r, 201);
    });
  }

  /** Düzeltme/itiraz farkının yazılacağı "sonraki açık hesap dönemi": son kapanmış haftadan sonraki ilk hafta. */
  async #openWeek(tx: Store): Promise<string> {
    const closed = await tx.listClosedWeekIds();
    return closed.length === 0 ? settlementWeekId(this.#now()) : nextWeekId(closed[closed.length - 1]!);
  }

  /** Ekstrenin tarafa iletildiği an (itiraz süresi buradan başlar; ilk kayıt geçerlidir). */
  async recordStatementSent(weekId: string, input: Record<string, unknown>): Promise<ServiceResult<unknown>> {
    const { partyId } = input;
    if (typeof partyId !== "string" || !ID.test(partyId)) return fail(422, "party_invalid");
    if (!(await this.#d.store.getClosedWeek(weekId))) return fail(409, "week_not_closed");
    const at = await this.#d.store.recordStatementSent(weekId, partyId, this.#now());
    return ok({ weekId, partyId, sentAt: at }, 201);
  }

  /** T3: kapanmış haftaya itiraz kaydı (kayıt numarası, taraf, gerekçe). Süre dışı itiraz otomatik reddedilmez. */
  async raiseStatementDispute(weekId: string, input: Record<string, unknown>): Promise<ServiceResult<unknown>> {
    const { raisedBy, reason, category } = input;
    if (typeof raisedBy !== "string" || !ID.test(raisedBy)) return fail(422, "raisedBy_invalid");
    if (typeof reason !== "string" || reason.trim().length < 5) return fail(422, "reason_required");
    if (category !== "calculation_error" && category !== "legal_right" && category !== "fraud_suspicion" && category !== "other") return fail(422, "category_invalid");
    return this.#d.store.transaction(async (tx) => {
      if (!(await tx.getClosedWeek(weekId))) return fail(409, "week_not_closed");
      const n = (await tx.listDisputes()).length + 1;
      const d: StatementDispute = {
        id: `ITZ-${weekId}-${String(n).padStart(4, "0")}`,
        week_id: weekId,
        raised_by: raisedBy,
        reason: redactPii(reason.trim()).slice(0, 500),
        category,
        raised_at: this.#now(),
        statement_sent_at: (await tx.getStatementSent(weekId, raisedBy)) ?? null,
        status: "open",
        decided_by: null,
        decided_role: null,
        decision_reason: null,
        decided_at: null,
        adjustment_ids: [],
      };
      await tx.saveDispute(d);
      return ok(d, 201);
    });
  }

  /**
   * T3: yetkili yönetici (2FA) gerekçeli karar verir. Kabul edilen fark sonraki AÇIK hesap dönemine düzeltme
   * hareketi olarak yazılır; kapanmış hafta değişmez.
   */
  async decideStatementDispute(actor: Actor, id: string, input: Record<string, unknown>): Promise<ServiceResult<unknown>> {
    const denied = this.#requireMfa(actor, ["admin", "finance_manager"]);
    if (denied) return denied;
    const { decision, reason, adjustment } = input;
    if (decision !== "accepted" && decision !== "rejected") return fail(422, "decision_invalid");
    if (typeof reason !== "string" || reason.trim().length < 5) return fail(422, "reason_required");
    return this.#d.store.transaction(async (tx) => {
      const d = (await tx.listDisputes()).find((x) => x.id === id);
      if (!d) return fail(404, "not_found");
      if (d.status !== "open") return fail(409, "already_decided");
      const adjIds: string[] = [];
      if (decision === "accepted" && adjustment !== undefined) {
        const a = adjustment as Record<string, unknown>;
        if (typeof a.debtorId !== "string" || !ID.test(a.debtorId) || typeof a.creditorId !== "string" || !ID.test(a.creditorId) || !Number.isSafeInteger(a.amountMinor) || a.amountMinor === 0) {
          return fail(422, "adjustment_invalid");
        }
        const adj: Adjustment = {
          id: this.#d.random.id(),
          week_id: await this.#openWeek(tx),
          original_week_id: d.week_id,
          debtor_id: a.debtorId,
          creditor_id: a.creditorId,
          amount: a.amountMinor as number,
          currency: this.#d.shuttleTariff.currency,
          kind: "dispute_decision",
          reason: redactPii(reason.trim()).slice(0, 300),
          adjustment_reference: `${d.id}-ADJ`,
          written_approval_reference: null,
          booking_id: null,
          dispute_id: d.id,
        };
        if ((await tx.listAdjustments()).some((x) => x.adjustment_reference === adj.adjustment_reference)) {
          return fail(409, "duplicate_adjustment_reference");
        }
        await tx.appendAdjustments([adj]);
        adjIds.push(adj.id);
      }
      const decided: StatementDispute = {
        ...d,
        status: decision,
        decided_by: actor.id,
        decided_role: actor.role,
        decision_reason: redactPii(reason.trim()).slice(0, 500),
        decided_at: this.#now(),
        adjustment_ids: adjIds,
      };
      await tx.saveDispute(decided);
      return ok(decided);
    });
  }

  /** T1: sonraki haftaya mahsup — yalnız ilgili tarafların yazılı onayının belge referansıyla, 2FA'lı yöneticiyle. */
  async createOffset(actor: Actor, input: Record<string, unknown>): Promise<ServiceResult<unknown>> {
    const denied = this.#requireMfa(actor, ["admin", "finance_manager"]);
    if (denied) return denied;
    const { fromWeekId, debtorId, creditorId, amountMinor, writtenApprovalReference, reason } = input;
    if (typeof writtenApprovalReference !== "string" || !/^[A-Za-z0-9./_-]{3,64}$/.test(writtenApprovalReference)) return fail(422, "written_approval_required");
    if (typeof fromWeekId !== "string" || typeof debtorId !== "string" || !ID.test(debtorId) || typeof creditorId !== "string" || !ID.test(creditorId)) return fail(422, "party_invalid");
    if (!Number.isSafeInteger(amountMinor) || amountMinor === 0) return fail(422, "amountMinor_invalid");
    if (typeof reason !== "string" || reason.trim().length < 5) return fail(422, "reason_required");
    return this.#d.store.transaction(async (tx) => {
      if (!(await tx.getClosedWeek(fromWeekId))) return fail(409, "week_not_closed");
      const adj: Adjustment = {
        id: this.#d.random.id(),
        week_id: await this.#openWeek(tx),
        original_week_id: fromWeekId,
        debtor_id: debtorId,
        creditor_id: creditorId,
        amount: amountMinor as number,
        currency: this.#d.shuttleTariff.currency,
        kind: "offset",
        reason: redactPii(reason.trim()).slice(0, 300),
        adjustment_reference: `OFS-${fromWeekId}-${writtenApprovalReference}`,
        written_approval_reference: writtenApprovalReference,
        booking_id: null,
        dispute_id: null,
      };
      if ((await tx.listAdjustments()).some((x) => x.adjustment_reference === adj.adjustment_reference)) {
        return fail(409, "duplicate_adjustment_reference");
      }
      await tx.appendAdjustments([adj]);
      return ok(adj, 201);
    });
  }

  async #lines(tx: Store): Promise<SettlementLine[]> {
    const out: SettlementLine[] = [];
    for (const b of await tx.listBookings()) {
      if (b.isTest) continue;
      const l = this.toLine(b);
      if (l) out.push(l);
    }
    return out;
  }

  async #priorEntries(tx: Store): Promise<SettlementEntry[]> {
    const out: SettlementEntry[] = [];
    for (const id of await tx.listClosedWeekIds()) out.push(...((await tx.getClosedWeek(id))?.entries ?? []));
    return out;
  }

  async weekReport(weekId: string): Promise<ServiceResult<unknown>> {
    try {
      weekBounds(weekId);
    } catch {
      return fail(422, "weekId_invalid");
    }
    const tx = this.#d.store;
    const closed = await tx.getClosedWeek(weekId);
    const report = weeklyReport({
      weekId,
      now: this.#now(),
      lines: closed ? [] : await this.#lines(tx),
      priorEntries: await this.#priorEntries(tx),
      adjustments: await tx.listAdjustments(),
      receipts: await tx.listReceipts(weekId),
      disputes: await tx.listDisputes(),
      policy: this.#d.shuttlePolicy,
      policies: this.#d.splitPolicies ?? [],
      ...(closed ? { frozen: { entries: closed.entries, exceptions: closed.exceptions, customer_balances: closed.customer_balances } } : {}),
    });
    return ok({ ...report, closed: Boolean(closed) });
  }

  async closeWeek(weekId: string): Promise<ServiceResult<unknown>> {
    let bounds;
    try {
      bounds = weekBounds(weekId);
    } catch {
      return fail(422, "weekId_invalid");
    }
    if (this.#now() < bounds.end_utc) return fail(409, "week_not_finished");
    return this.#d.store.transaction(async (tx) => {
      if (await tx.getClosedWeek(weekId)) return fail(409, "week_already_closed");
      const closedIds = await tx.listClosedWeekIds();
      if (closedIds.length > 0) {
        const last = closedIds[closedIds.length - 1]!;
        if (weekId < last) return fail(409, "week_before_last_closed");
        if (nextWeekId(last) !== weekId) return fail(409, `close_weeks_in_order:${nextWeekId(last)}`);
      } else {
        // First close must not jump over a week with booking/payment activity.
        // With no earlier activity, do not allow arbitrary historical bootstrap weeks.
        const activity: string[] = [];
        for (const b of await tx.listBookings()) {
          if (b.isTest) continue;
          for (const at of [b.createdAt, b.completedAt, b.cancelledAt, ...b.moneyEvents.map((e) => e.at)]) {
            if (at) activity.push(settlementWeekId(at));
          }
        }
        for (const r of await tx.listReceipts()) {
          activity.push(r.week_id, settlementWeekId(r.paid_at));
        }
        for (const a of await tx.listAdjustments()) activity.push(a.week_id);
        const earliest = activity.sort()[0];
        if (earliest !== undefined && earliest < weekId) return fail(409, `close_first_active_week:${earliest}`);
        // The bootstrap age limit only applies to a completely empty ledger.
        // Historical activity must remain closable, even if it was over four weeks ago;
        // otherwise the earliest active week and all following weeks become deadlocked.
        // The four-week threshold is still LOCAL_ONLY pending an Owner policy decision.
        if (earliest === undefined) {
          const idleWeeks = (Date.parse(this.#now()) - Date.parse(bounds.end_utc)) / (7 * 86400_000);
          if (idleWeeks > 4) return fail(409, "first_week_too_old");
        }
      }
      const report = weeklyReport({
        weekId,
        now: this.#now(),
        lines: await this.#lines(tx),
        priorEntries: await this.#priorEntries(tx),
        adjustments: await tx.listAdjustments(),
        receipts: await tx.listReceipts(weekId),
        disputes: await tx.listDisputes(),
        policy: this.#d.shuttlePolicy,
        policies: this.#d.splitPolicies ?? [],
        newId: this.#d.random.id,
      });
      for (const e of report.entries) {
        const b = await tx.getBookingById(e.booking_id);
        if (!b) continue;
        if (!(await tx.updateBooking({ ...b, settlementWeekId: weekId, settlementStatus: b.settlementWeekId ? "adjusted" : "included" }, b.version))) throw new Error("version_conflict");
      }
      await tx.saveClosedWeek(report);
      return ok(report, 201);
    });
  }
}

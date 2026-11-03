import { createHash, timingSafeEqual } from "node:crypto";
import {
  assertTransition,
  balances,
  bookingRef,
  checkPaymentEvent,
  closeWeek,
  duplicateFingerprintInput,
  earnPassShares,
  earnShuttleShares,
  money,
  paymentSummary,
  reverseEntries,
  splitPass,
  placeInPool,
  priceShuttle,
  resolveSite,
  slotStartFor,
  validateIntake,
  type FieldError,
  type LedgerEntry,
  type PartyRef,
  type PassPolicy,
  type PaymentEvent,
  type ShuttleSplitPolicies,
  type ShuttleTariffVersion,
  type SiteRecord,
} from "@ag/core";
import type { OutboxEvent, Store, StoredBooking } from "./store.ts";

export interface ServiceDeps {
  readonly store: Store;
  readonly sites: ReadonlyMap<string, SiteRecord>;
  readonly shuttleTariff: ShuttleTariffVersion;
  readonly splitPolicies: ShuttleSplitPolicies;
  readonly passPolicy: PassPolicy;
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

export type ServiceResult<T> = { ok: true; status: number; body: T } | { ok: false; status: number; body: ApiError };

export interface ApiError {
  readonly error: string;
  readonly fields?: readonly FieldError[];
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function fail(status: number, error: string, fields?: readonly FieldError[]): ServiceResult<never> {
  return { ok: false, status, body: fields ? { error, fields } : { error } };
}

export class BookingService {
  readonly #d: ServiceDeps;
  constructor(deps: ServiceDeps) {
    this.#d = deps;
  }

  /** Uydu site formundan gelen talep. */
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
        return prior.status < 400
          ? { ok: true, status: prior.status, body: prior.body }
          : { ok: false, status: prior.status, body: prior.body as ApiError };
      }
      const result = await this.#createBooking(tx, input);
      // Doğrulama hataları idempotency'ye yazılmaz: kullanıcı düzeltip aynı anahtarla tekrar gönderebilir.
      if (result.ok) await tx.putIdempotency(scope, { requestHash, status: result.status, body: result.body });
      return result;
    });
  }

  async #createBooking(
    tx: Store,
    input: { raw: unknown; origin: string | undefined; ip: string },
  ): Promise<ServiceResult<unknown>> {
    const v = validateIntake(input.raw);
    if (!v.ok) return fail(422, "validation_failed", v.errors);
    const req = v.value;

    const site = resolveSite(this.#d.sites, req.siteId, input.origin, this.#d.devOrigins);
    if (!site.ok) return fail(site.reason === "unknown_site" ? 404 : 403, site.reason);
    if (!(await this.#d.verifyHuman(req.humanToken, input.ip))) return fail(403, "human_check_failed");
    if (req.paymentMethod !== undefined && !site.site.paymentMethods.includes(req.paymentMethod)) {
      return fail(422, "payment_method_not_allowed_for_site");
    }

    const now = this.#d.clock().toISOString();
    const id = this.#d.random.id();
    const lookupToken = this.#d.random.token();
    const fingerprint = sha256(duplicateFingerprintInput(req));
    const isDuplicate = (await tx.findActiveByFingerprint(fingerprint)) !== undefined;
    const sourcePartnerId = site.site.ownership === "partner" ? site.site.partnerId : undefined;
    // Kod çakışması (31^6 olasılık) nadirdir ama mümkündür: boş kod bulunana kadar en çok 8 deneme.
    let ref = bookingRef(this.#d.random.index);
    for (let i = 0; (await tx.getBookingByRef(ref)) !== undefined; i++) {
      if (i >= 8) throw new Error("could not allocate a unique booking ref");
      ref = bookingRef(this.#d.random.index);
    }

    const base = {
      id,
      ref,
      siteId: site.site.id,
      product: req.product,
      status: "request" as const,
      paymentStatus: "unpaid" as const,
      request: req,
      lookupTokenHash: sha256(lookupToken),
      fingerprint,
      isDuplicate,
      isTest: site.site.status === "preview",
      allowedPaymentMethods: site.site.paymentMethods,
      ...(req.paymentMethod !== undefined ? { preferredPaymentMethod: req.paymentMethod } : {}),
      createdAt: now,
      version: 1,
      ...(sourcePartnerId !== undefined ? { sourcePartnerId } : {}),
    };

    const events: OutboxEvent[] = [];
    const event = (type: string, payload: Record<string, string> = {}): OutboxEvent => ({
      id: this.#d.random.id(),
      dedupeKey: `${type}:${id}`,
      type,
      bookingId: id,
      payload: { siteId: site.site.id, ...payload },
      status: "pending",
      createdAt: now,
    });

    if (req.product === "shuttle") {
      if (req.returnPickupAt !== undefined) return fail(422, "shuttle_return_must_be_booked_separately");
      const price = priceShuttle(this.#d.shuttleTariff, req.routeCode!, req.pickupAt.slice(0, 10), req.passengers);
      // 5+ kişi: Owner kararıyla otomatik fiyat yok; rezervasyon fiyatsız alınır ve fiyat onayı bekler.
      if (!price.ok && price.reason !== "requires_approval") return fail(422, price.reason);
      const slotRuns = await tx.listRuns(req.routeCode!, slotStartFor(req.pickupAt, this.#d.pool.slotMinutes));
      const placement = placeInPool(
        slotRuns,
        { bookingId: id, passengers: req.passengers, routeCode: req.routeCode!, pickupAt: req.pickupAt },
        { slotMinutes: this.#d.pool.slotMinutes, capacity: this.#d.pool.vehicleCapacity, newRunId: this.#d.random.id },
      );
      await tx.saveRun(placement.run);

      const booking: StoredBooking = {
        ...base,
        operationsOwner: { kind: "central" },
        shuttleRunId: placement.run.id,
        ...(price.ok
          ? {
              price: {
                mode: "FIXED_SHUTTLE" as const,
                total: price.total,
                sourceVersionId: price.tariffVersionId,
                frozenAt: now,
              },
            }
          : {}),
      };
      await tx.insertBooking(booking);
      events.push(event("shuttle.booking_received.notify_central", { runId: placement.run.id }));
      if (!price.ok) events.push(event("shuttle.price_approval_required.notify_central", { runId: placement.run.id }));
      events.push(event("booking.request_received.notify_customer"));
      if (sourcePartnerId !== undefined) {
        events.push(event("shuttle.booking_received.notify_site_owner", { partnerId: sourcePartnerId }));
      }
      await tx.appendOutbox(events);
      return {
        ok: true,
        status: 201,
        body: {
          ref,
          lookupToken,
          product: req.product,
          status: booking.status,
          ...(price.ok ? { price: { amountMinor: price.total.amountMinor, currency: price.total.currency } } : {}),
          next: price.ok ? "central_operations_will_confirm" : "price_requires_approval",
        },
      };
    }

    // Özel / VIP — K12 (öneri): varsayılan network_pass; self_operated yalnız doğrulanmış yetkiyle.
    //  network_pass:  site kendi fiyatıyla satar, iş pass bedeliyle AG tedarikçi ağına aktarılır (AG ek komisyon 0 €).
    //  self_operated: site sahibi kendisi yapar; merkez kaydı tutar ve bilgilendirilir; AG işlem komisyonu almaz.
    const product = req.product as "private" | "vip";
    const toNetwork = site.site.privateMode === "network_pass";
    let price: StoredBooking["price"];
    if (toNetwork && site.site.salePrices?.[product] !== undefined) {
      const sp = splitPass(product, site.site.salePrices, site.site.saleCurrency!, this.#d.passPolicy);
      if (!sp.ok) {
        console.error("site_pricing_misconfigured", site.site.id, sp.reason);
        return fail(503, "site_pricing_misconfigured");
      }
      price = {
        mode: "PARTNER_PRICE_WITH_PASS",
        total: sp.split.sale,
        pass: sp.split.pass,
        sourceVersionId: sp.split.policyId,
        frozenAt: now,
      };
    }
    const booking: StoredBooking = {
      ...base,
      operationsOwner:
        toNetwork || sourcePartnerId === undefined
          ? { kind: "central" }
          : { kind: "partner", partnerId: sourcePartnerId },
      ...(price ? { price } : {}),
    };
    await tx.insertBooking(booking);
    events.push(event("private.request_received.notify_site_owner", { to: "site_owner_email", mode: site.site.privateMode }));
    events.push(event("private.request_received.notify_central", { mode: site.site.privateMode }));
    events.push(event("booking.request_received.notify_customer"));
    await tx.appendOutbox(events);
    return {
      ok: true,
      status: 201,
      body: {
        ref,
        lookupToken,
        product: req.product,
        status: booking.status,
        ...(price ? { price: { amountMinor: price.total.amountMinor, currency: price.total.currency } } : {}),
        next: toNetwork ? "central_operations_will_confirm" : "site_owner_will_send_quote",
      },
    };
  }

  /** Rezervasyon sorgulama: kod + gizli sorgu jetonu. Eşleşmezse her durumda 404 (varlık sızdırılmaz). */
  async lookup(ref: string, token: string | undefined): Promise<ServiceResult<unknown>> {
    if (!token) return fail(404, "not_found");
    const b = await this.#d.store.getBookingByRef(ref);
    if (!b || !safeEqualHex(b.lookupTokenHash, sha256(token))) return fail(404, "not_found");
    return {
      ok: true,
      status: 200,
      body: {
        ref: b.ref,
        product: b.product,
        status: b.status,
        paymentStatus: b.paymentStatus,
        pickupAt: b.request.pickupAt,
        pickup: b.request.pickup,
        dropoff: b.request.dropoff,
        passengers: b.request.passengers,
        ...(b.price ? { price: { amountMinor: b.price.total.amountMinor, currency: b.price.total.currency } } : {}),
      },
    };
  }

  quoteShuttle(routeCode: string, date: string, passengers: number): ServiceResult<unknown> {
    const r = priceShuttle(this.#d.shuttleTariff, routeCode, date, passengers);
    // 5+ kişi hata değil, iş kuralıdır: fiyat yok, onay gerekir.
    if (!r.ok && r.reason === "requires_approval") return { ok: true, status: 200, body: { requiresApproval: true } };
    if (!r.ok) return fail(422, r.reason);
    return {
      ok: true,
      status: 200,
      body: { amountMinor: r.total.amountMinor, currency: r.total.currency, tariffVersionId: r.tariffVersionId },
    };
  }

  // ---- Yönetim (admin) işlemleri ----

  async listBookings(): Promise<ServiceResult<unknown>> {
    const list = await this.#d.store.listBookings(100);
    return {
      ok: true,
      status: 200,
      body: list.map((b) => ({
        ref: b.ref,
        siteId: b.siteId,
        product: b.product,
        status: b.status,
        paymentStatus: b.paymentStatus,
        operationsOwner: b.operationsOwner,
        pickupAt: b.request.pickupAt,
        passengers: b.request.passengers,
        shuttleRunId: b.shuttleRunId ?? null,
        price: b.price ? { amountMinor: b.price.total.amountMinor, currency: b.price.total.currency, mode: b.price.mode } : null,
        priceStatus: b.price ? "set" : b.product === "shuttle" ? "requires_approval" : "quote_pending",
        isDuplicate: b.isDuplicate,
        isTest: b.isTest,
      })),
    };
  }

  async confirm(ref: string): Promise<ServiceResult<unknown>> {
    return this.#d.store.transaction(async (tx) => {
      const b = await tx.getBookingByRef(ref);
      if (!b) return fail(404, "not_found");
      if (b.product === "shuttle" && !b.price) return fail(409, "price_requires_approval");
      try {
        assertTransition(b.status, "confirmed");
      } catch {
        return fail(409, "invalid_transition");
      }
      const ok = await tx.updateBooking({ ...b, status: "confirmed" }, b.version);
      if (!ok) return fail(409, "version_conflict");
      await tx.appendOutbox([
        {
          id: this.#d.random.id(),
          dedupeKey: `booking.confirmed.notify_customer:${b.id}`,
          type: "booking.confirmed.notify_customer",
          bookingId: b.id,
          payload: { siteId: b.siteId },
          status: "pending",
          createdAt: this.#d.clock().toISOString(),
        },
      ]);
      return { ok: true, status: 200, body: { ref, status: "confirmed" } };
    });
  }

  /**
   * 5+ kişilik shuttle için fiyatın elle onayı (Owner kararı: yeni karar verilene kadar ayrı onay).
   * Onaylanan tutar dondurulur; 70/20/10 paylaşımı bu tutar üzerinden otomatik hesaplanır.
   * NOT: onaylayanın kimliği, gerçek yönetim girişi (IdP + 2FA, SEL-332) gelene kadar kaydedilemiyor.
   */
  async approveShuttlePrice(ref: string, input: Record<string, unknown>): Promise<ServiceResult<unknown>> {
    const { amountMinor, currency } = input;
    if (!Number.isSafeInteger(amountMinor) || (amountMinor as number) <= 0) return fail(422, "amountMinor_invalid");
    if (currency !== this.#d.shuttleTariff.currency) return fail(422, "currency_must_match_tariff");
    return this.#d.store.transaction(async (tx) => {
      const b = await tx.getBookingByRef(ref);
      if (!b) return fail(404, "not_found");
      if (b.product !== "shuttle") return fail(409, "not_a_shuttle_booking");
      if (b.price) return fail(409, "price_already_set");
      if (b.status !== "request") return fail(409, "invalid_transition");
      const now = this.#d.clock().toISOString();
      const ok = await tx.updateBooking(
        {
          ...b,
          price: {
            mode: "SHUTTLE_MANUAL_APPROVED",
            total: money(amountMinor as number, this.#d.shuttleTariff.currency),
            sourceVersionId: `manual-approval:${this.#d.shuttleTariff.id}`,
            frozenAt: now,
          },
        },
        b.version,
      );
      if (!ok) return fail(409, "version_conflict");
      return { ok: true, status: 200, body: { ref, price: { amountMinor, currency }, priceStatus: "set" } };
    });
  }

  async assignRun(runId: string, carrierPayeeId: unknown): Promise<ServiceResult<unknown>> {
    if (typeof carrierPayeeId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(carrierPayeeId)) {
      return fail(422, "carrierPayeeId_invalid");
    }
    return this.#d.store.transaction(async (tx) => {
      const run = await tx.getRun(runId);
      if (!run) return fail(404, "not_found");
      if (run.status !== "open") return fail(409, "run_not_open");
      await tx.saveRun({ ...run, status: "assigned", carrierPayeeId });
      return { ok: true, status: 200, body: { runId, status: "assigned", carrierPayeeId } };
    });
  }

  /** Pay yazmayı dener. Aynı rezervasyon için pay bir kez yazılır (ters kayıt sonrası otomatik yeniden yazılmaz). */
  async #tryEarn(tx: Store, b: StoredBooking, now: string): Promise<string> {
    const existing = await tx.listLedger(b.id);
    if (existing.length > 0) return "shares_already_recorded";
    if (!b.price) return "price_not_approved";
    const ctx = { now, newId: this.#d.random.id };
    const common = {
      id: b.id,
      status: b.status,
      paymentStatus: b.paymentStatus,
      isTest: b.isTest,
      isDuplicate: b.isDuplicate,
      ...(b.sourcePartnerId !== undefined ? { sourcePartnerId: b.sourcePartnerId } : {}),
    };
    const earned =
      b.price.mode === "PARTNER_PRICE_WITH_PASS" && b.price.pass
        ? earnPassShares(
            { ...common, sale: b.price.total, pass: b.price.pass, passPolicyId: b.price.sourceVersionId },
            b.carrierPayeeId,
            ctx,
          )
        : b.product === "shuttle"
          ? earnShuttleShares({ ...common, shareBase: b.price.total }, b.carrierPayeeId, this.#d.splitPolicies, ctx)
          : ({ ok: false, reason: "self_operated_no_platform_shares" } as const);
    if (!earned.ok) {
      if (earned.reason === "split_policy_not_approved") {
        await tx.appendOutbox([this.#event(b, "finance.review_required", now, { reason: earned.reason })]);
      }
      return earned.reason === "not_paid" ? "awaiting_payment" : earned.reason;
    }
    await tx.appendLedger(earned.entries);
    return "shares_earned";
  }

  #event(b: StoredBooking, type: string, now: string, payload: Record<string, string> = {}): OutboxEvent {
    return {
      id: this.#d.random.id(),
      dedupeKey: `${type}:${b.id}`,
      type,
      bookingId: b.id,
      payload: { siteId: b.siteId, ...payload },
      status: "pending",
      createdAt: now,
    };
  }

  /**
   * Sefer tamamlandı: onaylı rezervasyonlar "delivered" olur ve tedarikçi (hak ediş alıcısı) yazılır.
   * Pay, rezervasyon TAMAMEN tahsil edilmişse hemen; değilse son tahsilat kaydedildiğinde yazılır.
   */
  async completeRun(runId: string): Promise<ServiceResult<unknown>> {
    return this.#d.store.transaction(async (tx) => {
      const run = await tx.getRun(runId);
      if (!run) return fail(404, "not_found");
      if (run.status !== "assigned" || !run.carrierPayeeId) return fail(409, "run_not_assigned");
      const now = this.#d.clock().toISOString();
      const outcome: Array<{ ref: string; result: string }> = [];
      for (const item of run.bookings) {
        const b = await tx.getBookingById(item.bookingId);
        if (!b) continue;
        if (b.status !== "confirmed") {
          outcome.push({ ref: b.ref, result: `skipped_${b.status}` });
          continue;
        }
        if (!b.price) {
          outcome.push({ ref: b.ref, result: "skipped_price_not_approved" });
          continue;
        }
        const updated: StoredBooking = { ...b, status: "delivered", carrierPayeeId: run.carrierPayeeId };
        if (!(await tx.updateBooking(updated, b.version))) throw new Error("version_conflict");
        outcome.push({ ref: b.ref, result: await this.#tryEarn(tx, { ...updated, version: b.version + 1 }, now) });
      }
      await tx.saveRun({ ...run, status: "completed" });
      return { ok: true, status: 200, body: { runId, status: "completed", bookings: outcome } };
    });
  }

  /** K12 Model B (network_pass) özel/VIP işin tamamlanması: tedarikçi pass'ın tamamını alır, AG 0 €. */
  async completePrivate(ref: string, input: Record<string, unknown>): Promise<ServiceResult<unknown>> {
    const { carrierPayeeId } = input;
    if (typeof carrierPayeeId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(carrierPayeeId)) {
      return fail(422, "carrierPayeeId_invalid");
    }
    return this.#d.store.transaction(async (tx) => {
      const b = await tx.getBookingByRef(ref);
      if (!b) return fail(404, "not_found");
      if (b.price?.mode !== "PARTNER_PRICE_WITH_PASS" || !b.price.pass) return fail(409, "not_a_network_pass_booking");
      if (b.status !== "confirmed") return fail(409, "invalid_transition");
      const updated: StoredBooking = { ...b, status: "delivered", carrierPayeeId };
      if (!(await tx.updateBooking(updated, b.version))) return fail(409, "version_conflict");
      const result = await this.#tryEarn(tx, { ...updated, version: b.version + 1 }, this.#d.clock().toISOString());
      return { ok: true, status: 200, body: { ref, status: "delivered", result } };
    });
  }

  /**
   * K15: tahsilat veya iade kaydı. Kayıt silinmez. Online kart yalnız merkezden; araçta nakit yalnız
   * rezervasyonun izin verdiği yöntemse ve işi yapan tedarikçi alır. Tam tahsil + teslim → pay yazılır.
   * Teslim edilmiş ve payı yazılmış işte iade → payların tamamı ters kayıtla kapatılır, finans incelemesine düşer.
   */
  async recordPayment(ref: string, input: Record<string, unknown>): Promise<ServiceResult<unknown>> {
    const { kind, method, amountMinor, party } = input;
    if (kind !== "collection" && kind !== "refund") return fail(422, "kind_invalid");
    if (method !== "card_online" && method !== "cash_in_vehicle") return fail(422, "method_invalid");
    if (!Number.isSafeInteger(amountMinor)) return fail(422, "amountMinor_invalid");
    const p = (party ?? {}) as Record<string, unknown>;
    let partyRef: PartyRef;
    if (p.kind === "platform") partyRef = { kind: "platform", id: "central" };
    else if ((p.kind === "carrier" || p.kind === "partner") && typeof p.id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(p.id)) {
      partyRef = { kind: p.kind, id: p.id };
    } else return fail(422, "party_invalid");

    return this.#d.store.transaction(async (tx) => {
      const b = await tx.getBookingByRef(ref);
      if (!b) return fail(404, "not_found");
      const prior = await tx.listPayments(b.id);
      const currency = b.price?.total.currency ?? this.#d.shuttleTariff.currency;
      const ev: PaymentEvent = {
        id: this.#d.random.id(),
        bookingId: b.id,
        kind,
        method,
        amount: money(amountMinor as number, currency),
        party: partyRef,
        at: this.#d.clock().toISOString(),
      };
      // Nakit tahsilat, işi yapan tedarikçi belliyse ona; sefere atanmış ama henüz tamamlanmamışsa seferin tedarikçisine bakılır.
      let assignedCarrierId = b.carrierPayeeId;
      if (!assignedCarrierId && b.shuttleRunId) assignedCarrierId = (await tx.getRun(b.shuttleRunId))?.carrierPayeeId;
      const check = checkPaymentEvent(
        { total: b.price?.total, allowedMethods: b.allowedPaymentMethods, assignedCarrierId },
        prior,
        ev,
      );
      if (!check.ok) return fail(422, check.reason);
      await tx.appendPayment(ev);
      const summary = paymentSummary(b.price!.total, [...prior, ev]);
      let current: StoredBooking = { ...b, paymentStatus: summary.status };
      if (!(await tx.updateBooking(current, b.version))) return fail(409, "version_conflict");
      current = { ...current, version: b.version + 1 };

      let finance = "none";
      const now = ev.at;
      if (kind === "collection" && current.status === "delivered" && summary.status === "paid") {
        finance = await this.#tryEarn(tx, current, now);
      }
      if (kind === "refund") {
        const ledger = await tx.listLedger(b.id);
        const reversals = reverseEntries(ledger, b.id, { now, newId: this.#d.random.id });
        if (reversals.length > 0) {
          await tx.appendLedger(reversals);
          await tx.appendOutbox([this.#event(b, "finance.review_required", now, { reason: "refund_after_shares" })]);
          finance = "shares_reversed_review_required";
        }
      }
      return {
        ok: true,
        status: 201,
        body: {
          ref,
          payment: { kind, method, amountMinor, party: partyRef },
          totals: {
            totalMinor: summary.total.amountMinor,
            collectedMinor: summary.collected.amountMinor,
            refundedMinor: summary.refunded.amountMinor,
            remainingMinor: summary.remaining.amountMinor,
            status: summary.status,
          },
          finance,
        },
      };
    });
  }

  /** İptal (teslimden önce). Tahsil edilmiş tutar varsa iade gerekir bildirimi oluşur; iade ayrı kaydedilir. */
  async cancel(ref: string): Promise<ServiceResult<unknown>> {
    return this.#d.store.transaction(async (tx) => {
      const b = await tx.getBookingByRef(ref);
      if (!b) return fail(404, "not_found");
      try {
        assertTransition(b.status, "cancelled");
      } catch {
        return fail(409, "invalid_transition");
      }
      if (!(await tx.updateBooking({ ...b, status: "cancelled" }, b.version))) return fail(409, "version_conflict");
      const now = this.#d.clock().toISOString();
      const events = [this.#event(b, "booking.cancelled.notify_customer", now)];
      const net = b.price ? paymentSummary(b.price.total, await tx.listPayments(b.id)).net.amountMinor : 0;
      if (net > 0) events.push(this.#event(b, "finance.refund_due", now, { amountMinor: String(net) }));
      if (b.shuttleRunId) {
        const run = await tx.getRun(b.shuttleRunId);
        if (run && (run.status === "open" || run.status === "assigned")) {
          await tx.saveRun({ ...run, bookings: run.bookings.filter((x) => x.bookingId !== b.id) });
        }
      }
      await tx.appendOutbox(events);
      return { ok: true, status: 200, body: { ref, status: "cancelled", refundDueMinor: net } };
    });
  }

  /** K15: haftalık kapanış (Pazartesi–Pazar, Europe/Istanbul). Yalnız ekstre; ödeme gönderimi kapalı. */
  async closeWeek(weekStart: unknown): Promise<ServiceResult<unknown>> {
    if (typeof weekStart !== "string") return fail(422, "weekStart_invalid");
    return this.#d.store.transaction(async (tx) => {
      if (await tx.getClosing(weekStart)) return fail(409, "week_already_closed");
      const closings = await tx.listClosings();
      let closing;
      try {
        closing = closeWeek({
          weekStart,
          ledger: await tx.listLedger(),
          payments: await tx.listPayments(),
          closedEntryIds: new Set(closings.flatMap((c) => c.entryIds)),
          closedPaymentIds: new Set(closings.flatMap((c) => c.paymentIds)),
        });
      } catch (err) {
        return fail(422, err instanceof Error ? err.message : "weekStart_invalid");
      }
      // Hafta bitmeden kapanmaz: aksi halde haftanın kalan kayıtları sonraki kapanışa kayar.
      if (this.#d.clock().toISOString() < closing.periodEndUtc) return fail(409, "week_not_finished");
      await tx.saveClosing(closing);
      return { ok: true, status: 201, body: closing };
    });
  }

  async listClosings(): Promise<ServiceResult<unknown>> {
    return { ok: true, status: 200, body: await this.#d.store.listClosings() };
  }

  async ledgerBalances(): Promise<ServiceResult<unknown>> {
    return { ok: true, status: 200, body: balances(await this.#d.store.listLedger()) };
  }

  async outbox(): Promise<ServiceResult<unknown>> {
    return { ok: true, status: 200, body: await this.#d.store.listOutbox("pending") };
  }
}

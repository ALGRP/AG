import { createHash, timingSafeEqual } from "node:crypto";
import {
  assertTransition,
  balances,
  bookingRef,
  duplicateFingerprintInput,
  earnPassShares,
  earnShuttleShares,
  money,
  splitPass,
  placeInPool,
  priceShuttle,
  resolveSite,
  slotStartFor,
  validateIntake,
  type FieldError,
  type PassPolicy,
  type ShuttleTariffVersion,
  type SiteRecord,
  type SplitPolicy,
} from "@ag/core";
import type { OutboxEvent, Store, StoredBooking } from "./store.ts";

export interface ServiceDeps {
  readonly store: Store;
  readonly sites: ReadonlyMap<string, SiteRecord>;
  readonly shuttleTariff: ShuttleTariffVersion;
  readonly splitPolicy: SplitPolicy;
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

    const now = this.#d.clock().toISOString();
    const id = this.#d.random.id();
    const lookupToken = this.#d.random.token();
    const fingerprint = sha256(duplicateFingerprintInput(req));
    const isDuplicate = (await tx.findActiveByFingerprint(fingerprint)) !== undefined;
    const sourcePartnerId = site.site.ownership === "partner" ? site.site.partnerId : undefined;
    const ref = bookingRef(this.#d.random.index);

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
      if (!price.ok) return fail(422, price.reason);

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
        price: {
          mode: "FIXED_SHUTTLE",
          total: price.total,
          sourceVersionId: price.tariffVersionId,
          frozenAt: now,
        },
      };
      await tx.insertBooking(booking);
      events.push(event("shuttle.booking_received.notify_central", { runId: placement.run.id }));
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
          price: { amountMinor: price.total.amountMinor, currency: price.total.currency },
          next: "central_operations_will_confirm",
        },
      };
    }

    // Özel / VIP — iki model (site ayarı):
    //  pass_to_network: site sahibi kendi fiyatıyla satar, iş pass bedeliyle AG ağına aktarılır (Partner Sunumu V3).
    //  self_operate:    site sahibi operasyonu kendisi yapar; merkez kaydı tutar ve bilgilendirilir.
    const product = req.product as "private" | "vip";
    const toNetwork = site.site.privateMode === "pass_to_network";
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
        isDuplicate: b.isDuplicate,
        isTest: b.isTest,
      })),
    };
  }

  async confirm(ref: string): Promise<ServiceResult<unknown>> {
    return this.#d.store.transaction(async (tx) => {
      const b = await tx.getBookingByRef(ref);
      if (!b) return fail(404, "not_found");
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

  /**
   * Sefer tamamlandı: onaylı rezervasyonlar "delivered" olur; tahsil edildiği bildirilenler "paid" olur;
   * ikisi birden sağlanan, test/mükerrer olmayan rezervasyonlar için 70/20/10 pay kayıtları defterde açılır.
   */
  async completeRun(runId: string, paidRefs: unknown): Promise<ServiceResult<unknown>> {
    if (!Array.isArray(paidRefs) || paidRefs.some((r) => typeof r !== "string")) return fail(422, "paidRefs_invalid");
    const paid = new Set(paidRefs as string[]);
    return this.#d.store.transaction(async (tx) => {
      const run = await tx.getRun(runId);
      if (!run) return fail(404, "not_found");
      if (run.status !== "assigned") return fail(409, "run_not_assigned");
      const now = this.#d.clock().toISOString();
      const outcome: Array<{ ref: string; result: string }> = [];
      for (const item of run.bookings) {
        const b = await tx.getBookingById(item.bookingId);
        if (!b) continue;
        if (b.status !== "confirmed") {
          outcome.push({ ref: b.ref, result: `skipped_${b.status}` });
          continue;
        }
        const updated: StoredBooking = {
          ...b,
          status: "delivered",
          paymentStatus: paid.has(b.ref) ? "paid" : b.paymentStatus,
        };
        if (!(await tx.updateBooking(updated, b.version))) throw new Error("version_conflict");
        const earned = earnShuttleShares(
          {
            id: b.id,
            status: updated.status,
            paymentStatus: updated.paymentStatus,
            isTest: b.isTest,
            isDuplicate: b.isDuplicate,
            shareBase: b.price!.total,
            ...(b.sourcePartnerId !== undefined ? { sourcePartnerId: b.sourcePartnerId } : {}),
          },
          run.carrierPayeeId,
          this.#d.splitPolicy,
          { now, newId: this.#d.random.id },
        );
        if (earned.ok) await tx.appendLedger(earned.entries);
        outcome.push({ ref: b.ref, result: earned.ok ? "shares_earned" : earned.reason });
      }
      await tx.saveRun({ ...run, status: "completed" });
      return { ok: true, status: 200, body: { runId, status: "completed", bookings: outcome } };
    });
  }

  /**
   * Pass modelindeki özel/VIP işin tamamlanması: araç hak edişi atamada/sözleşmede belirlenir (≤ pass).
   * Defter: site sahibi = satış − pass, araç = hak ediş, merkez = pass − hak ediş.
   */
  async completePrivate(ref: string, input: Record<string, unknown>): Promise<ServiceResult<unknown>> {
    const { carrierPayeeId, carrierPayoutMinor, paid } = input;
    if (typeof carrierPayeeId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(carrierPayeeId)) {
      return fail(422, "carrierPayeeId_invalid");
    }
    if (!Number.isSafeInteger(carrierPayoutMinor)) return fail(422, "carrierPayoutMinor_invalid");
    if (typeof paid !== "boolean") return fail(422, "paid_invalid");
    return this.#d.store.transaction(async (tx) => {
      const b = await tx.getBookingByRef(ref);
      if (!b) return fail(404, "not_found");
      if (b.price?.mode !== "PARTNER_PRICE_WITH_PASS" || !b.price.pass) return fail(409, "not_a_network_pass_booking");
      if (b.status !== "confirmed") return fail(409, "invalid_transition");
      const updated: StoredBooking = { ...b, status: "delivered", paymentStatus: paid ? "paid" : b.paymentStatus };
      const earned = earnPassShares(
        {
          id: b.id,
          status: updated.status,
          paymentStatus: updated.paymentStatus,
          isTest: b.isTest,
          isDuplicate: b.isDuplicate,
          sale: b.price.total,
          pass: b.price.pass,
          passPolicyId: b.price.sourceVersionId,
          ...(b.sourcePartnerId !== undefined ? { sourcePartnerId: b.sourcePartnerId } : {}),
        },
        carrierPayeeId,
        money(carrierPayoutMinor as number, b.price.pass.currency),
        { now: this.#d.clock().toISOString(), newId: this.#d.random.id },
      );
      // Hak ediş pass'ı aşıyorsa iş tamamlanmış sayılmaz: önce tutar düzeltilir.
      if (!earned.ok && ["payout_exceeds_pass", "negative_payout", "currency_mismatch"].includes(earned.reason)) {
        return fail(422, earned.reason);
      }
      if (!(await tx.updateBooking(updated, b.version))) return fail(409, "version_conflict");
      if (earned.ok) await tx.appendLedger(earned.entries);
      return { ok: true, status: 200, body: { ref, status: "delivered", result: earned.ok ? "shares_earned" : earned.reason } };
    });
  }

  async ledgerBalances(): Promise<ServiceResult<unknown>> {
    return { ok: true, status: 200, body: balances(await this.#d.store.listLedger()) };
  }

  async outbox(): Promise<ServiceResult<unknown>> {
    return { ok: true, status: 200, body: await this.#d.store.listOutbox("pending") };
  }
}

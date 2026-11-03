// Areas 7 (unauthorised price changes), 8 (financial approval without 2FA), 12 (5+ passenger price bounds).
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { parseShuttleTariff, priceShuttle } from "@ag/core";
import { MemoryStore } from "../apps/api/src/store.ts";
import { MANAGER, TARIFF_RAW, W45, harness, makeSites, SITE_RAW, sumFor, tariff } from "./harness.ts";

const approve = (h: ReturnType<typeof harness>, ref: string, amountMinor: unknown, extra: Record<string, unknown> = {}, actor = MANAGER) =>
  h.service.approveShuttlePrice(actor, ref, { amountMinor, currency: "EUR", reason: "6 kisi tek Sprinter", ...extra });

describe("A12 5+ passenger price bounds", () => {
  const h = harness();
  before(() => h.setNow("2026-11-04T08:00:00Z"));

  it("A12.1 5..10 pax: no automatic price anywhere (intake, quote); 11 pax over capacity; no 80 EUR", async () => {
    for (const pax of [5, 6, 10]) {
      const b = await h.book({ passengers: pax });
      assert.equal(b.status, 201);
      assert.equal(b.body.price, undefined);
      assert.equal(b.body.next, "price_requires_approval");
      assert.deepEqual(h.service.quoteShuttle("AYT-ALN", "2026-12-01", pax).body, { requiresApproval: true });
    }
    assert.equal((await h.book({ passengers: 11 })).body.error, "over_capacity");
    assert.equal((await h.service.confirm((await h.book({ passengers: 5 })).body.ref)).body.error, "price_requires_approval");
  });

  it("A12.2 approved bounds 80..140: 0,01 / 79,99 / 140,01 / 0 / -1 / 80.5 / '9000' / NaN refused; 80 and 140 inclusive", async () => {
    const cases: Array<[unknown, string]> = [[1, "below_min"], [7999, "below_min"], [14001, "above_max"], [0, "invalid_amount"], [-1, "invalid_amount"], [8000.5, "invalid_amount"], ["9000", "invalid_amount"], [Number.NaN, "invalid_amount"]];
    for (const [amt, err] of cases) {
      const ref = (await h.book({ passengers: 6 })).body.ref;
      assert.equal((await approve(h, ref, amt)).body.error, err, `amount ${String(amt)}`);
    }
    for (const amt of [8000, 14000]) {
      const ref = (await h.book({ passengers: 6 })).body.ref;
      assert.equal((await approve(h, ref, amt)).status, 200, `amount ${amt}`);
    }
  });

  it("A12.3 no bounds -> closed; proposed (not approved) bounds -> closed", async () => {
    const nb = (await h.book({ passengers: 6, routeCode: "ALN-AYT" })).body.ref;
    assert.equal((await approve(h, nb, 9000)).body.error, "no_bounds_for_route");
    const pr = (await h.book({ passengers: 6, routeCode: "AYT-SID" })).body.ref;
    assert.equal((await approve(h, pr, 9000)).body.error, "bounds_not_approved");
  });

  it("A12.4 inactive route: no booking at all; and a route deactivated in a newer tariff blocks approval of an old request", async () => {
    assert.equal((await h.book({ passengers: 6, routeCode: "AYT-KMR" })).body.error, "route_inactive");
    assert.deepEqual([h.service.quoteShuttle("AYT-KMR", "2026-12-01", 2).status, h.service.quoteShuttle("AYT-KMR", "2026-12-01", 2).body], [422, { error: "route_inactive" }]);
    assert.equal((await h.book({ routeCode: "AYT-GZP" })).body.error, "route_not_in_tariff");
    assert.throws(() => tariff({ routes: [...(TARIFF_RAW.routes as string[]), "GZP-AYT"] }), /not allowed/);
    const store = new MemoryStore();
    const v1 = harness({ store, idPrefix: "v1" });
    const ref = (await v1.book({ passengers: 6 })).body.ref;
    const info = { ...(TARIFF_RAW.routeInfo as Record<string, unknown>), "AYT-ALN": { active: false, coverage: "AYT -> Alanya (closed)" } };
    const v2 = harness({ store, idPrefix: "v2", tariff: tariff({ id: "qa-tariff-v2", routeInfo: info }) });
    assert.equal((await approve(v2, ref, 9000)).body.error, "route_inactive");
  });

  it("A12.5 [RULE] the historical '5 pax = 80 EUR' must never become active (tariff with a 5th total is refused)", () => {
    let parsed: unknown;
    let err = "";
    try {
      parsed = parseShuttleTariff({ ...TARIFF_RAW, totalsMinor: [3000, 5000, 6000, 7000, 8000] });
    } catch (e) {
      err = String(e);
    }
    const p = parsed ? priceShuttle(parsed as any, "AYT-ALN", "2026-12-01", 5) : null;
    assert.equal(p, null, `tariff accepted and prices 5 pax automatically: ${JSON.stringify(p)} ${err}`);
  });

  it("A12.6 [RULE] approved bounds whose minimum is 0,01 EUR must not make a 0,01 EUR manual price approvable", { todo: "QA-L8 · H-22 kararı bekliyor" }, async () => {
    const t = tariff({ id: "qa-tariff-cent", manualPriceBounds: { "AYT-ALN": { minMinor: 1, maxMinor: 100000, status: "approved" } } });
    const x = harness({ tariff: t, idPrefix: "cent" });
    const ref = (await x.book({ passengers: 6 })).body.ref;
    assert.notEqual((await approve(x, ref, 1)).status, 200, "a 0,01 EUR group price was approved (bounds parser has no sanity floor)");
  });
});

describe("A7 unauthorised price changes", () => {
  it("A7.1 no path changes a price once set (fixed or approved), before or after settlement", async () => {
    const h = harness();
    h.setNow("2026-11-04T08:00:00Z");
    const two = (await h.book()).body.ref;
    assert.equal((await approve(h, two, 9000)).body.error, "price_already_set");
    const six = (await h.book({ passengers: 6 })).body.ref;
    assert.equal((await approve(h, six, 9000)).status, 200);
    assert.equal((await approve(h, six, 14000)).body.error, "price_already_set");
    // concurrent double approval: exactly one wins
    const seven = (await h.book({ passengers: 7 })).body.ref;
    const both = await Promise.all([approve(h, seven, 9000), approve(h, seven, 12000)]);
    assert.deepEqual(both.map((r) => r.status).sort(), [200, 409]);
    assert.equal((await h.row(seven)).price.amountMinor, 9000);
  });

  it("A7.2 audit record: who, role, when, old/new price, reason; reason required (>= 5 chars)", async () => {
    const h = harness();
    h.setNow("2026-11-04T08:00:00Z");
    const ref = (await h.book({ passengers: 6 })).body.ref;
    assert.equal((await approve(h, ref, 9000, { reason: "   ab   " })).body.error, "reason_required");
    assert.equal((await approve(h, ref, 9000, { currency: "USD" })).body.error, "currency_must_match_tariff");
    await approve(h, ref, 9000, { reason: "Grup 6 kisi, Sprinter" });
    const a = (await h.row(ref)).priceApproval;
    assert.deepEqual([a.actorId, a.actorRole, a.at, a.oldPriceMinor, a.newPriceMinor, a.reason], [MANAGER.id, "finance_manager", "2026-11-04T08:00:00.000Z", null, 9000, "Grup 6 kisi, Sprinter"]);
    const ev = (await h.store.listOutbox()).find((e) => e.type === "audit.manual_price_approved");
    assert.equal(ev?.payload.actor, MANAGER.id);
  });

  it("A7.3 a new tariff version or a changed site sale price never re-prices an existing booking or its settlement", async () => {
    const store = new MemoryStore();
    const v1 = harness({ store, idPrefix: "p1" });
    v1.setNow("2026-11-04T08:00:00Z");
    const shuttle = await v1.shuttleJob({}, "sup-a", 5000);
    const priv = (await v1.book({ product: "private", routeCode: undefined })).body.ref;
    const changedSites = makeSites(SITE_RAW.map((s) => (s.id === "partner-site" ? { ...s, salePrices: { private: 100, vip: 100 } } : s)));
    const v2 = harness({ store, idPrefix: "p2", sites: changedSites, tariff: tariff({ id: "qa-tariff-v9", totalsMinor: [100, 200, 300, 400] }) });
    v2.setNow("2026-11-09T06:00:00Z");
    assert.equal((await v2.row(shuttle)).price.amountMinor, 5000);
    assert.equal((await v2.row(priv)).price.amountMinor, 8000);
    const w45 = (await v2.close(W45)).body;
    assert.equal(sumFor(w45.entries, shuttle, "site_delta"), 1000);
  });
});

describe("A8 financial approval without 2FA", () => {
  const h = harness();
  let ref5 = "";
  let disputeId = "";
  before(async () => {
    await h.start();
    h.setNow("2026-11-04T08:00:00Z");
    ref5 = (await h.book({ passengers: 6 })).body.ref;
    await h.shuttleJob({}, "sup-a", 5000);
    h.setNow("2026-11-09T06:00:00Z");
    await h.close(W45);
    disputeId = (await h.service.raiseStatementDispute(W45, { raisedBy: "p-001", reason: "hesap hatasi iddiasi", category: "calculation_error" })).body.id;
  });
  after(() => h.stop());

  it("A8.1 HTTP: price approval, statement-dispute decision and offset are all refused (static token has no 2FA)", async () => {
    const a = await h.adminPost(`/v1/admin/bookings/${ref5}/approve-price`, { amountMinor: 9000, currency: "EUR", reason: "6 kisi Sprinter" });
    const d = await h.adminPost(`/v1/admin/settlements/disputes/${disputeId}/decide`, { decision: "accepted", reason: "kabul edildi", adjustment: { debtorId: "sup-a", creditorId: "p-001", amountMinor: 100 } });
    const o = await h.adminPost("/v1/admin/settlements/offsets", { fromWeekId: W45, debtorId: "agos", creditorId: "sup-a", amountMinor: 100, reason: "mahsup denemesi", writtenApprovalReference: "ONAY-77" });
    assert.deepEqual([a, d, o].map((r) => [r.status, r.body.error]), [[403, "mfa_required"], [403, "mfa_required"], [403, "mfa_required"]]);
    assert.equal((await h.row(ref5)).price, null);
    assert.equal((await h.store.listAdjustments()).length, 0);
  });

  it("A8.2 service: mfa=false -> mfa_required; operator with mfa -> role_not_allowed (all three operations)", async () => {
    for (const actor of [{ ...MANAGER, mfa: false }, { id: "op", role: "operator" as const, mfa: true }]) {
      const want = actor.mfa ? "role_not_allowed" : "mfa_required";
      assert.equal((await h.service.approveShuttlePrice(actor, ref5, { amountMinor: 9000, currency: "EUR", reason: "6 kisi Sprinter" })).body.error, want);
      assert.equal((await h.service.decideStatementDispute(actor, disputeId, { decision: "rejected", reason: "gerekce yazildi" })).body.error, want);
      assert.equal((await h.service.createOffset(actor, { fromWeekId: W45, debtorId: "agos", creditorId: "sup-a", amountMinor: 100, reason: "mahsup denemesi", writtenApprovalReference: "ONAY-1" })).body.error, want);
    }
    assert.equal((await h.service.decideStatementDispute(MANAGER, disputeId, { decision: "rejected", reason: "abc" })).body.error, "reason_required");
  });

  it("A8.3 [RULE] deciding a booking dispute (which releases the held commission) needs 2FA, a reason and a recorded decider", async () => {
    h.setNow("2026-11-10T08:00:00Z");
    const ref = await h.shuttleJob({}, "sup-b", 5000);
    await h.adminPost(`/v1/admin/bookings/${ref}/dispute`, { reason: "musteri bekletildi" });
    const before = await h.adminGet("/v1/admin/settlements/2026-W46");
    assert.equal(sumFor(before.body.entries, ref, "site_delta"), 0, "held while disputed");
    const r = await h.adminPost(`/v1/admin/bookings/${ref}/resolve-dispute`, { outcome: "upheld" });
    const after = await h.adminGet("/v1/admin/settlements/2026-W46");
    assert.deepEqual(
      { status: r.status, released: sumFor(after.body.entries, ref, "site_delta") },
      { status: 403, released: 0 },
      "static admin token (no 2FA, no reason, decider not recorded) resolved the dispute and released 10 EUR site + 5 EUR AGOS commission",
    );
  });

  it("A8.4 [RULE] an 'upheld' customer dispute must not settle exactly like a 'rejected' one", { todo: "QA-F10 · H-21 kararı bekliyor" }, async () => {
    const mk = async (outcome: "upheld" | "rejected") => {
      const x = harness({ idPrefix: outcome });
      x.setNow("2026-11-04T10:00:00Z");
      const ref = await x.shuttleJob({}, "sup-a", 5000);
      await x.service.dispute(ref, { reason: "arac gelmedi" });
      await x.service.resolveDispute(MANAGER, ref, { outcome, reason: "Musteri itirazi incelendi" });
      x.setNow("2026-11-09T06:00:00Z");
      const e = (await x.close(W45)).body.entries.find((y: any) => y.booking_ref === ref);
      return e ? [e.site_delta, e.agos_delta, e.supplier_delta] : null;
    };
    assert.notDeepEqual(await mk("upheld"), await mk("rejected"), "outcome is stored but ignored by settlement");
  });

  it("A8.5 [RULE] releasing a suspected duplicate into settlement needs 2FA and a reason", async () => {
    h.setNow("2026-11-11T08:00:00Z");
    const same = { pickupAt: "2026-12-24T10:00", customer: { name: "Twin", email: "twin@example.com", phone: "+49 151 3333333", locale: "de" } };
    await h.book(same, "qa-twin-key-a-0000001");
    const b = await h.book(same, "qa-twin-key-b-0000001");
    const r = await h.adminPost(`/v1/admin/bookings/${b.body.ref}/clear-duplicate`, {});
    assert.equal(r.status, 403, "duplicate flag cleared with the static token, no 2FA, no reason, no actor recorded");
  });
});

describe("A8.6 manager approval evidence for booking-level financial hold releases (LOCAL_ONLY)", () => {
  it("rejects no MFA, operator and missing reasons; verified test manager decision is audited", async () => {
    const x = harness({ idPrefix: "qa-f10-proof" });
    x.setNow("2026-11-04T08:00:00Z");
    const same = {
      pickupAt: "2026-11-04T13:20",
      customer: { name: "Same Guest", email: "same-qa-f10@example.com", phone: "+49 151 2222222", locale: "de" },
    };
    const first = await x.book(same);
    const duplicate = await x.book(same);
    const ref = duplicate.body.ref;
    assert.equal((await x.row(ref)).isDuplicate, true);
    const reason = "Iki ayri rezervasyon goruldu";
    assert.equal((await x.service.clearDuplicate({ ...MANAGER, mfa: false }, ref, { reason })).body.error, "mfa_required");
    assert.equal((await x.service.clearDuplicate({ id: "op", role: "operator", mfa: true }, ref, { reason })).body.error, "role_not_allowed");
    assert.equal((await x.service.clearDuplicate(MANAGER, ref, { reason: "x" })).body.error, "reason_required");
    assert.equal((await x.row(ref)).isDuplicate, true);
    assert.equal((await x.service.clearDuplicate(MANAGER, ref, { reason })).status, 200);
    const cleared = await x.row(ref);
    assert.deepEqual([cleared.duplicateClearAudit.actorId, cleared.duplicateClearAudit.actorRole, cleared.duplicateClearAudit.mfaVerified, cleared.isDuplicate],
      [MANAGER.id, "finance_manager", true, false]);
    assert.equal((await x.service.clearDuplicate(MANAGER, ref, { reason })).body.error, "not_flagged_as_duplicate");

    assert.equal((await x.service.dispute(ref, { reason: "Musteri transferine itiraz" })).status, 200);
    assert.equal((await x.service.resolveDispute({ ...MANAGER, mfa: false }, ref, { outcome: "rejected", reason })).body.error, "mfa_required");
    assert.equal((await x.service.resolveDispute({ id: "op", role: "operator", mfa: true }, ref, { outcome: "rejected", reason })).body.error, "role_not_allowed");
    assert.equal((await x.service.resolveDispute(MANAGER, ref, { outcome: "rejected", reason: "" })).body.error, "reason_required");
    const approved = await x.service.resolveDispute(MANAGER, ref, { outcome: "rejected", reason: "Musteri kayitlari incelenip itiraz reddedildi" });
    assert.equal(approved.status, 200);
    const decision = (await x.row(ref)).disputeResolutionAudit;
    assert.deepEqual([decision.actorId, decision.actorRole, decision.mfaVerified],
      [MANAGER.id, "finance_manager", true]);
    assert.ok(decision.at);
    assert.ok(decision.reason.length >= 5);
    assert.equal((await x.service.resolveDispute(MANAGER, ref, { outcome: "rejected", reason })).body.error, "no_open_dispute");
    const events = (await x.store.listOutbox()).map((e) => e.type);
    assert.ok(events.includes("audit.duplicate_cleared") && events.includes("audit.booking_dispute_resolved"));
    assert.ok(first.status === 201);
  });
});

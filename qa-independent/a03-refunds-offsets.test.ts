// Area 3 — refunds and offsets.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { MANAGER, W45, W46, W47, harness, sumFor } from "./harness.ts";

describe("A3 refunds", () => {
  it("A3.1 refund > net collected is refused, also cumulatively; refund == net is accepted", async () => {
    const h = harness();
    h.setNow("2026-11-04T10:00:00Z");
    const ref = await h.shuttleJob({}, "sup-a", 3000);
    assert.equal((await h.service.refund(ref, { amountMinor: 3001, refundReference: "RF-1" })).body.error, "refund_exceeds_collected");
    assert.equal((await h.service.refund(ref, { amountMinor: 2000, refundReference: "RF-2" })).status, 200);
    assert.equal((await h.service.refund(ref, { amountMinor: 1001, refundReference: "RF-3" })).body.error, "refund_exceeds_collected");
    assert.equal((await h.service.refund(ref, { amountMinor: 1000, refundReference: "RF-4" })).status, 200);
    assert.equal((await h.service.refund(ref, { amountMinor: 1, refundReference: "RF-5" })).body.error, "refund_exceeds_collected");
  });

  it("A3.2 duplicate refund reference refused; a refund cannot reuse a collection slip number; refund needs a prior collection", async () => {
    const h = harness();
    h.setNow("2026-11-04T10:00:00Z");
    const ref = await h.shuttleJob({}, "sup-a", null);
    assert.equal((await h.service.refund(ref, { amountMinor: 100, refundReference: "RF-0" })).body.error, "nothing_collected");
    await h.collect(ref, 5000, { reference: "SLIP-77" });
    assert.equal((await h.service.refund(ref, { amountMinor: 100, refundReference: "SLIP-77" })).body.error, "refund_reference_already_used");
    assert.equal((await h.service.refund(ref, { amountMinor: 100, refundReference: "RF-1" })).status, 200);
    assert.equal((await h.service.refund(ref, { amountMinor: 100, refundReference: "RF-1" })).body.error, "refund_reference_already_used");
  });

  it("A3.3 refund after close: next week gets a negative correction (-4/-2/-14 for 20 EUR); the closed week is unchanged", async () => {
    const h = harness();
    h.setNow("2026-11-04T10:00:00Z");
    const ref = await h.shuttleJob({}, "sup-a", 5000);
    h.setNow("2026-11-09T06:00:00Z");
    const closed = (await h.close(W45)).body;
    h.setNow("2026-11-11T06:00:00Z");
    assert.equal((await h.service.refund(ref, { amountMinor: 2000, refundReference: "RF-AFTER" })).status, 200);
    h.setNow("2026-11-16T06:00:00Z");
    const w46 = (await h.close(W46)).body;
    const e = w46.entries.find((x: any) => x.booking_ref === ref);
    assert.deepEqual([e.kind, e.collected_delta, e.site_delta, e.agos_delta, e.supplier_delta], ["refund_correction", -2000, -400, -200, -1400]);
    const again = await h.report(W45);
    assert.deepEqual(again.entries, closed.entries);
  });

  it("A3.4 [RULE] after a FULL customer refund the statement must not list the customer as still owing the price", async () => {
    const h = harness();
    h.setNow("2026-11-04T10:00:00Z");
    const ref = await h.shuttleJob({}, "sup-a", 5000);
    h.setNow("2026-11-09T06:00:00Z");
    await h.close(W45);
    h.setNow("2026-11-11T06:00:00Z");
    await h.service.refund(ref, { amountMinor: 5000, refundReference: "RF-FULL" });
    h.setNow("2026-11-16T06:00:00Z");
    const w46 = (await h.close(W46)).body;
    assert.deepEqual(
      w46.customer_balances.filter((b: any) => b.booking_ref === ref).map((b: any) => b.remaining),
      [],
      "W46 lists 'customer still owes 50 EUR' for a booking whose money was deliberately refunded",
    );
  });

  it("A3.5 [RULE] a partial (goodwill) refund must not turn into a customer debt", async () => {
    const h = harness();
    h.setNow("2026-11-04T10:00:00Z");
    const ref = await h.shuttleJob({}, "sup-a", 5000);
    h.setNow("2026-11-05T10:00:00Z");
    await h.service.refund(ref, { amountMinor: 1000, refundReference: "RF-GOODWILL" });
    h.setNow("2026-11-09T06:00:00Z");
    const w45 = (await h.close(W45)).body;
    assert.deepEqual(w45.customer_balances.filter((b: any) => b.booking_ref === ref).map((b: any) => b.remaining), []);
  });

  it("A3.6 refund on a cancelled booking clears the cancelled_after_collection exception", async () => {
    const h = harness();
    h.setNow("2026-11-04T10:00:00Z");
    const b = await h.book();
    const ref = b.body.ref;
    await h.service.confirm(ref);
    await h.service.assignRun(await h.runOf(ref), "sup-a");
    await h.collect(ref, 5000);
    assert.equal((await h.service.cancel(ref)).status, 200);
    assert.equal((await h.collect(ref, 100)).body.error, "booking_cancelled");
    h.setNow("2026-11-09T06:00:00Z");
    const w45 = (await h.close(W45)).body;
    assert.deepEqual(w45.exceptions.filter((x: any) => x.booking_ref === ref).map((x: any) => [x.reason, x.customer_refund_due]), [["cancelled_after_collection", 5000]]);
    assert.equal(sumFor(w45.entries, ref, "collected_delta"), 0);
    h.setNow("2026-11-10T06:00:00Z");
    assert.equal((await h.service.refund(ref, { amountMinor: 5000, refundReference: "RF-CXL" })).status, 200);
    const w46 = await h.report(W46);
    assert.deepEqual(w46.exceptions.filter((x: any) => x.booking_ref === ref).map((x: any) => x.reason), []);
  });
});

describe("A3 offsets and overpayments", () => {
  const h = harness();
  let ref = "";
  before(async () => {
    await h.start();
    h.setNow("2026-11-04T10:00:00Z");
    ref = await h.shuttleJob({}, "sup-a", 5000);
    h.setNow("2026-11-09T06:00:00Z");
    assert.equal((await h.close(W45)).status, 201);
  });
  after(() => h.stop());

  const body = { fromWeekId: W45, debtorId: "agos", creditorId: "sup-a", amountMinor: 100, reason: "fazla odeme mahsubu" };

  it("A3.7 offset needs a written approval reference and 2FA (service and HTTP)", async () => {
    assert.equal((await h.service.createOffset(MANAGER, body)).body.error, "written_approval_required");
    assert.equal((await h.service.createOffset({ ...MANAGER, mfa: false }, { ...body, writtenApprovalReference: "ONAY-1" })).body.error, "mfa_required");
    assert.equal((await h.service.createOffset({ id: "op", role: "operator", mfa: true }, { ...body, writtenApprovalReference: "ONAY-1" })).body.error, "role_not_allowed");
    const http = await h.adminPost("/v1/admin/settlements/offsets", { ...body, writtenApprovalReference: "ONAY-1" });
    assert.deepEqual([http.status, http.body.error], [403, "mfa_required"]);
    assert.equal((await h.service.createOffset(MANAGER, { ...body, fromWeekId: W46, writtenApprovalReference: "ONAY-1" })).body.error, "week_not_closed");
  });

  it("A3.8 [RULE] the same offset submitted twice must be recorded once (unique adjustment reference)", { todo: "QA-F2 · Codex Paket-01" }, async () => {
    const one = await h.service.createOffset(MANAGER, { ...body, writtenApprovalReference: "ONAY-DUP-1" });
    const two = await h.service.createOffset(MANAGER, { ...body, writtenApprovalReference: "ONAY-DUP-1" });
    assert.equal(one.status, 201);
    const w46 = await h.report(W46);
    const manual = w46.obligations.filter((o: any) => o.kind === "manual" && o.debtor_id === "agos" && o.creditor_id === "sup-a");
    assert.deepEqual(
      { second: two.status, manualAmount: manual.reduce((s: number, o: any) => s + o.amount, 0), refs: w46.adjustments.map((a: any) => a.adjustment_reference) },
      { second: 409, manualAmount: 100, refs: ["OFS-2026-W45-ONAY-DUP-1"] },
      "double-submitted offset is applied twice",
    );
  });

  it("A3.9 [RULE] a 'written approval reference' must be a real reference, not punctuation", { todo: "QA-L3 · Paket-02" }, async () => {
    const r = await h.service.createOffset(MANAGER, { ...body, amountMinor: 1, writtenApprovalReference: "---" });
    assert.equal(r.status, 422, "'---' accepted as written approval of the parties");
  });

  it("A3.10 an overpaid commission is reported as refundable to the payer and a refund receipt settles it", async () => {
    const pay = (payer: string, payee: string, amountMinor: number, bankReference: string, purpose = "settlement") =>
      h.service.addReceipt({ weekId: W45, payerId: payer, payeeId: payee, amountMinor, currency: "EUR", bankReference, paidAt: "2026-11-10T08:00:00Z", purpose });
    assert.equal((await pay("sup-a", "agos", 600, "OVR-1")).status, 201);
    let w45 = await h.report(W45);
    const ob = () => w45.obligations.find((o: any) => o.debtor_id === "sup-a" && o.creditor_id === "agos");
    assert.equal(ob().status, "overpaid");
    assert.ok(w45.debts_and_disputes.some((d: any) => d.kind === "overpayment" && d.amount === 100));
    assert.equal((await pay("agos", "sup-a", 100, "OVR-BACK-1", "overpayment_refund")).status, 201);
    w45 = await h.report(W45);
    assert.equal(ob().status, "paid");
  });
});

describe("A3 automatic netting = offset without written approval", () => {
  it("A3.11 [RULE] a refund correction (site owes supplier 10) must not be silently netted with a new commission (supplier owes site 4)", async () => {
    const h = harness();
    h.setNow("2026-11-04T10:00:00Z");
    const paid = await h.shuttleJob({}, "sup-a", 5000);
    const partial = await h.shuttleJob({}, "sup-a", 3000);
    h.setNow("2026-11-09T06:00:00Z");
    await h.close(W45);
    h.setNow("2026-11-11T06:00:00Z");
    await h.service.refund(paid, { amountMinor: 5000, refundReference: "RF-NET" }); // site owes supplier 10 back
    await h.collect(partial, 2000); // supplier owes site +4
    h.setNow("2026-11-16T06:00:00Z");
    const w46 = (await h.close(W46)).body;
    const siteObs = w46.obligations
      .filter((o: any) => o.kind === "site_commission")
      .map((o: any) => [o.debtor_id, o.creditor_id, o.amount])
      .sort();
    assert.deepEqual(
      siteObs,
      [["sup-a", "p-001", -1000], ["sup-a", "p-001", 400]].sort(),
      "W46 shows a single netted -600 obligation: the 4 EUR debt was offset against the 10 EUR credit without written approval",
    );
  });

  it("A3.12 an adjustment never lands in a closed week (offset after W46 closed goes to W47)", async () => {
    const h = harness();
    h.setNow("2026-11-04T10:00:00Z");
    await h.shuttleJob({}, "sup-a", 5000);
    h.setNow("2026-11-09T06:00:00Z");
    await h.close(W45);
    h.setNow("2026-11-16T06:00:00Z");
    await h.close(W46);
    const off = await h.service.createOffset(MANAGER, { fromWeekId: W45, debtorId: "agos", creditorId: "sup-a", amountMinor: 100, reason: "mahsup denemesi", writtenApprovalReference: "ONAY-W47" });
    assert.equal((off.body as any).week_id, W47);
  });
});

// Area 4 — weekly close: before end, twice, out of order, concurrency, frozen snapshot, boundaries, week 53.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { nextWeekId, settlementWeekId, weekBounds } from "@ag/core";
import { MANAGER, W45, W46, W47, harness, sumFor } from "./harness.ts";

describe("A4 weekly close", () => {
  it("A4.1 refuses at Sun 23:59:59.999 Istanbul, accepts at Mon 00:00:00.000 Istanbul", async () => {
    const h = harness();
    h.setNow("2026-11-08T20:59:59.999Z");
    assert.equal((await h.close(W45)).body.error, "week_not_finished");
    h.setNow("2026-11-08T21:00:00.000Z");
    assert.equal((await h.close(W45)).status, 201);
    assert.equal((await h.close(W45)).body.error, "week_already_closed");
    h.setNow("2026-11-09T06:00:00Z");
    assert.equal((await h.close(W46)).body.error, "week_not_finished", "the current week cannot be closed");
  });

  it("A4.2 concurrent HTTP close calls produce exactly one snapshot", async () => {
    const h = harness();
    await h.start();
    try {
      h.setNow("2026-11-04T10:00:00Z");
      await h.shuttleJob({}, "sup-a", 5000);
      h.setNow("2026-11-09T06:00:00Z");
      const rs = await Promise.all(Array.from({ length: 6 }, () => h.adminPost(`/v1/admin/settlements/${W45}/close`)));
      assert.deepEqual(rs.map((r) => r.status).sort(), [201, 409, 409, 409, 409, 409]);
      assert.deepEqual(await h.store.listClosedWeekIds(), [W45]);
    } finally {
      await h.stop();
    }
  });

  it("A4.3 out of order: W47 before W46 is refused; a week before the last closed one is refused", async () => {
    const h = harness();
    h.setNow("2026-11-23T06:00:00Z");
    assert.equal((await h.close(W45)).status, 201);
    assert.equal((await h.close(W47)).body.error, "close_weeks_in_order:2026-W46");
    assert.equal((await h.close(W46)).status, 201);
    assert.equal((await h.close(W45)).body.error, "week_already_closed");
    assert.equal((await h.close("2026-W44")).body.error, "week_before_last_closed");
  });

  it("A4.4 [RULE] the first close must not skip earlier weeks that have activity", async () => {
    const h = harness();
    h.setNow("2026-11-04T10:00:00Z");
    await h.shuttleJob({}, "sup-a", 5000); // W45 activity
    h.setNow("2026-11-16T06:00:00Z");
    const first = await h.close(W46);
    assert.equal(first.status, 409, "W46 closed as the very first week; W45 is now permanently unclosable");
  });

  it("A4.5 [RULE] the first close must not accept an arbitrary historic week (2020-W01)", async () => {
    const h = harness();
    h.setNow("2026-11-16T06:00:00Z");
    const r = await h.close("2020-W01");
    assert.equal(r.status, 409, "closing 2020-W01 first forces ~350 empty sequential closes before the current week");
  });

  it("A4.6 frozen snapshot: entries/exceptions/balances of a closed week do not change after later money, refunds and dispute/duplicate changes", async () => {
    const h = harness();
    h.setNow("2026-11-04T10:00:00Z");
    const full = await h.shuttleJob({}, "sup-a", 5000);
    const part = await h.shuttleJob({}, "sup-a", 3000);
    const disp = await h.shuttleJob({}, "sup-b", 5000);
    await h.service.dispute(disp, { reason: "musteri itirazi" });
    h.setNow("2026-11-09T06:00:00Z");
    const closed = (await h.close(W45)).body;
    h.setNow("2026-11-10T06:00:00Z");
    await h.service.refund(full, { amountMinor: 5000, refundReference: "RF-FRZ" });
    await h.collect(part, 2000);
    await h.service.resolveDispute(MANAGER, disp, { outcome: "rejected", reason: "Kontrol edilen itiraz reddedildi" });
    const later = await h.report(W45);
    for (const k of ["entries", "exceptions", "customer_balances"]) assert.deepEqual(later[k], closed[k], k);
    assert.deepEqual(
      later.obligations.map((o: any) => [o.debtor_id, o.creditor_id, o.kind, o.amount]),
      closed.obligations.map((o: any) => [o.debtor_id, o.creditor_id, o.kind, o.amount]),
    );
  });

  it("A4.7 boundary: completion at Sun 23:59:59 IST belongs to W45, at Mon 00:00:00 IST to W46", async () => {
    const h = harness();
    const mk = async (completeAt: string) => {
      h.setNow("2026-11-08T10:00:00Z");
      const b = await h.book();
      const ref = b.body.ref;
      await h.service.confirm(ref);
      const run = await h.runOf(ref);
      await h.service.assignRun(run, "sup-a");
      await h.collect(ref, 5000);
      h.setNow(completeAt);
      await h.service.completeRun(run);
      return ref;
    };
    const sun = await mk("2026-11-08T20:59:59.000Z");
    const mon = await mk("2026-11-08T21:00:00.000Z");
    h.setNow("2026-11-09T06:00:00Z");
    const w45 = (await h.close(W45)).body;
    assert.equal(sumFor(w45.entries, sun, "collected_delta"), 5000);
    assert.equal(sumFor(w45.entries, mon, "collected_delta"), 0);
    h.setNow("2026-11-16T06:00:00Z");
    const w46 = (await h.close(W46)).body;
    assert.equal(sumFor(w46.entries, mon, "collected_delta"), 5000);
    assert.equal(w45.week.payment_due_utc, "2026-11-10T15:00:00.000Z", "Tue 18:00 Istanbul");
  });

  it("A4.8 ISO week 53: reject empty W52 bootstrap; W53 -> W01 close in order at year boundary", async () => {
    assert.equal(settlementWeekId("2027-01-03T20:59:59.999Z"), "2026-W53");
    assert.equal(settlementWeekId("2027-01-03T21:00:00.000Z"), "2027-W01");
    assert.equal(nextWeekId("2026-W52"), "2026-W53");
    assert.equal(nextWeekId("2026-W53"), "2027-W01");
    assert.throws(() => weekBounds("2027-W53"), "2027 has 52 ISO weeks");
    assert.equal(weekBounds("2026-W53").payment_due_utc, "2027-01-05T15:00:00.000Z");
    const h = harness({ startAt: "2026-12-30T10:00:00Z" });
    const w53job = await h.shuttleJob({}, "sup-a", 5000);
    h.setNow("2027-01-03T20:59:59.000Z");
    const lastSecond = await h.shuttleJob({}, "sup-a", 3000);
    h.setNow("2027-01-03T21:00:00.000Z");
    const w01job = await h.shuttleJob({ passengers: 3 }, "sup-a", 6000); // 3 pax = 60 EUR
    h.setNow("2027-01-11T06:00:00Z");
    // PR1-N5 supersedes the old permissive W52 bootstrap: earliest activity is W53.
    assert.equal((await h.close("2026-W52")).body.error, "close_first_active_week:2026-W53");
    const w53 = (await h.close("2026-W53")).body;
    const w01 = (await h.close("2027-W01")).body;
    assert.deepEqual([sumFor(w53.entries, w53job, "collected_delta"), sumFor(w53.entries, lastSecond, "collected_delta"), sumFor(w53.entries, w01job, "collected_delta")], [5000, 3000, 0]);
    assert.equal(sumFor(w01.entries, w01job, "collected_delta"), 6000);
  });

  it("A4.9 statement-dispute adjustment goes to the next OPEN week, never into a closed one", async () => {
    const h = harness();
    h.setNow("2026-11-04T10:00:00Z");
    await h.shuttleJob({}, "sup-a", 5000);
    h.setNow("2026-11-09T06:00:00Z");
    await h.close(W45);
    await h.service.recordStatementSent(W45, { partyId: "p-001" });
    const d = await h.service.raiseStatementDispute(W45, { raisedBy: "p-001", reason: "hesap hatasi iddiasi", category: "calculation_error" });
    h.setNow("2026-11-16T06:00:00Z");
    await h.close(W46);
    const dec = await h.service.decideStatementDispute(MANAGER, (d.body as any).id, { decision: "accepted", reason: "kontrol edildi, fark kabul", adjustment: { debtorId: "sup-a", creditorId: "p-001", amountMinor: 100 } });
    assert.equal(dec.status, 200);
    const w46 = await h.report(W46);
    const w47 = await h.report(W47);
    assert.equal(w46.adjustments.length, 0);
    assert.equal(w47.adjustments.length, 1);
  });
});

describe("A4 statement disputes timing (T3)", () => {
  const h = harness();
  before(async () => {
    h.setNow("2026-11-04T10:00:00Z");
    await h.shuttleJob({}, "sup-a", 5000);
    h.setNow("2026-11-09T06:00:00Z");
    await h.close(W45);
  });
  after(() => undefined);

  it("A4.10 a late dispute (any category) is never auto-rejected; it stays open for a reasoned decision", async () => {
    h.setNow("2026-11-10T06:00:00Z"); // statement sent Tue 09:00 IST
    await h.service.recordStatementSent(W45, { partyId: "p-001" });
    h.setNow("2027-03-01T06:00:00Z");
    for (const category of ["other", "calculation_error", "legal_right", "fraud_suspicion"]) {
      const d = await h.service.raiseStatementDispute(W45, { raisedBy: "p-001", reason: "cok gec itiraz denemesi", category });
      assert.equal(d.status, 201);
      assert.equal((d.body as any).status, "open");
    }
    const rep = await h.report(W45);
    assert.ok(rep.statement_disputes.every((d: any) => d.status === "open" && d.timing.reviewable === true && d.timing.within_window === false));
  });

  it("A4.11 [RULE] '7 calendar days' — a dispute on day 7 at 23:00 Istanbul is still within the window", { todo: "QA-L4 · H-20 kararı bekliyor" }, async () => {
    // statement sent Tue 10 Nov 09:00 IST -> day 7 = Tue 17 Nov; 23:00 IST = 20:00Z
    h.setNow("2026-11-17T20:00:00Z");
    const d = await h.service.raiseStatementDispute(W45, { raisedBy: "p-001", reason: "yedinci gun itirazi", category: "other" });
    const rep = await h.report(W45);
    const t = rep.statement_disputes.find((x: any) => x.id === (d.body as any).id).timing;
    assert.equal(t.within_window, true, `deadline computed as ${t.deadline} (exactly 168 h), not end of the 7th calendar day`);
  });

  it("A4.12 [RULE] a first close more than four weeks after the first activity must still be possible (no deadlock)", async () => {
    const h = harness();
    h.setNow("2026-11-04T10:00:00Z");
    await h.shuttleJob({}, "sup-a", 5000); // W45 activity
    h.setNow("2026-12-16T06:00:00Z"); // ~5 weeks later, nothing closed yet
    const w45 = await h.close(W45);
    assert.equal(w45.status, 201, `earliest active week refused (${w45.body.error}); W46 is refused with close_first_active_week, so no week can be closed`);
    assert.equal((await h.close(W46)).status, 201, "the following week closes in order");
  });

  it("A4.13 [RULE] with recorded activity, the first close must be the earliest active week, not an older empty week", async () => {
    const h = harness();
    h.setNow("2026-11-04T10:00:00Z");
    await h.shuttleJob({}, "sup-a", 5000); // W45 activity
    h.setNow("2026-11-16T06:00:00Z");
    const r = await h.close("2020-W01");
    assert.equal(r.status, 409, "2020-W01 accepted as the first close; W45 now needs ~350 empty sequential closes first");
    assert.equal((await h.close(W45)).status, 201, "the earliest active week is the valid first close");
  });

  it("A4.14 [RULE] one mistyped historical receipt date or week must not force hundreds of empty first closes", async () => {
    for (const bad of [{ weekId: W45, paidAt: "2016-03-01T08:00:00Z" }, { weekId: "2020-W01", paidAt: "2026-11-05T08:00:00Z" }]) {
      const h = harness();
      h.setNow("2026-11-04T10:00:00Z");
      await h.shuttleJob({}, "sup-a", 5000); // W45 activity
      await h.service.addReceipt({ ...bad, payerId: "sup-a", payeeId: "agos", amountMinor: 500, currency: "EUR", bankReference: `TR-TYPO-${bad.weekId}` });
      h.setNow("2026-11-16T06:00:00Z");
      const r = await h.close(W45);
      assert.equal(r.status, 201, `receipt ${JSON.stringify(bad)} accepted and first close now demands ${r.body.error}`);
    }
  });

  it("A4.15 [RULE] an ancient but self-consistent receipt (old week, paid in that week) must not force an ancient first close", async () => {
    const h = harness();
    h.setNow("2026-11-04T10:00:00Z");
    await h.shuttleJob({}, "sup-a", 5000); // W45 activity
    await h.service.addReceipt({ weekId: "2020-W01", payerId: "sup-a", payeeId: "agos", amountMinor: 500, currency: "EUR", bankReference: "TR-ANCIENT-1", paidAt: "2020-01-01T10:00:00Z" });
    h.setNow("2026-11-16T06:00:00Z");
    const r = await h.close(W45);
    assert.equal(r.status, 201, `ancient receipt accepted and first close now demands ${r.body.error}`);
  });
});


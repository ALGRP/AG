// Area 2 — partial collection (multiple partials, before/after completion, after a week closed).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SITE_TOKEN, W45, W46, W47, harness, sumFor } from "./harness.ts";

const quad = (entries: any[], ref: string) => ["collected_delta", "site_delta", "agos_delta", "supplier_delta"].map((f) => sumFor(entries, ref, f));

describe("A2 partial collection", () => {
  it("A2.1 Owner example across three weeks: 30 -> 6/3/21, +10 -> 2/1/7, +10 -> 2/1/7; price stays 50; balance 20 -> 10 -> 0", async () => {
    const h = harness();
    h.setNow("2026-11-04T10:00:00Z");
    const ref = await h.shuttleJob({}, "sup-a", 3000);
    h.setNow("2026-11-09T06:00:00Z");
    const w45 = (await h.close(W45)).body;
    assert.deepEqual(quad(w45.entries, ref), [3000, 600, 300, 2100]);
    assert.deepEqual(w45.customer_balances.map((b: any) => [b.final_booking_price, b.collected_amount, b.remaining]), [[5000, 3000, 2000]]);
    h.setNow("2026-11-10T06:00:00Z");
    await h.collect(ref, 1000);
    h.setNow("2026-11-16T06:00:00Z");
    const w46 = (await h.close(W46)).body;
    assert.deepEqual(quad(w46.entries, ref), [1000, 200, 100, 700]);
    assert.deepEqual(w46.customer_balances.map((b: any) => b.remaining), [1000]);
    h.setNow("2026-11-17T06:00:00Z");
    await h.collect(ref, 1000);
    h.setNow("2026-11-23T06:00:00Z");
    const w47 = (await h.close(W47)).body;
    assert.deepEqual(quad(w47.entries, ref), [1000, 200, 100, 700]);
    assert.equal(w47.customer_balances.length, 0);
    assert.equal((await h.row(ref)).price.amountMinor, 5000, "original price never changes");
  });

  it("A2.2 several partials inside one week settle as one entry (10 + 15 + 25 = 50 -> 10/5/35)", async () => {
    const h = harness();
    h.setNow("2026-11-04T10:00:00Z");
    const b = await h.book();
    const ref = b.body.ref;
    await h.service.confirm(ref);
    const run = await h.runOf(ref);
    await h.service.assignRun(run, "sup-a");
    for (const a of [1000, 1500, 2500]) assert.equal((await h.collect(ref, a)).status, 200);
    await h.service.completeRun(run);
    h.setNow("2026-11-09T06:00:00Z");
    const w45 = (await h.close(W45)).body;
    assert.deepEqual(quad(w45.entries, ref), [5000, 1000, 500, 3500]);
    assert.equal(w45.entries.filter((e: any) => e.booking_ref === ref).length, 1);
  });

  it("A2.3 collected before completion: no commission in the collection week, full commission in the completion week", async () => {
    const h = harness();
    h.setNow("2026-11-07T10:00:00Z"); // Sat W45
    const b = await h.book();
    const ref = b.body.ref;
    await h.service.confirm(ref);
    const run = await h.runOf(ref);
    await h.service.assignRun(run, "sup-a");
    await h.collect(ref, 5000);
    h.setNow("2026-11-09T05:00:00Z"); // Mon W46 08:00 IST: transfer completed now
    await h.service.completeRun(run);
    h.setNow("2026-11-09T06:00:00Z");
    const w45 = (await h.close(W45)).body;
    assert.deepEqual(quad(w45.entries, ref), [0, 0, 0, 0]);
    h.setNow("2026-11-16T06:00:00Z");
    const w46 = (await h.close(W46)).body;
    assert.deepEqual(quad(w46.entries, ref), [5000, 1000, 500, 3500]);
  });

  it("A2.4 money collected after the week ended but before the (late) close goes to the next week", async () => {
    const h = harness();
    h.setNow("2026-11-05T10:00:00Z");
    const ref = await h.shuttleJob({}, "sup-a", null);
    h.setNow("2026-11-09T05:00:00Z"); // Monday W46 08:00 IST — W45 not closed yet
    await h.collect(ref, 5000);
    h.setNow("2026-11-09T06:00:00Z");
    const w45 = (await h.close(W45)).body;
    assert.deepEqual(quad(w45.entries, ref), [0, 0, 0, 0]);
    assert.deepEqual(w45.customer_balances.map((x: any) => x.remaining), [5000], "as of Sunday 23:59 nothing was collected");
    h.setNow("2026-11-16T06:00:00Z");
    const w46 = (await h.close(W46)).body;
    assert.deepEqual(quad(w46.entries, ref), [5000, 1000, 500, 3500]);
  });

  it("A2.5 odd-cent partials never drift (1 + 3333 + 1666 = 5000 -> 1000/500/3500 overall)", async () => {
    const h = harness();
    h.setNow("2026-11-04T10:00:00Z");
    const ref = await h.shuttleJob({}, "sup-a", 1);
    const all: any[] = [];
    const plan: Array<[string, string, number | null]> = [
      [W45, "2026-11-09T06:00:00Z", 3333],
      [W46, "2026-11-16T06:00:00Z", 1666],
      [W47, "2026-11-23T06:00:00Z", null],
    ];
    for (const [week, at, next] of plan) {
      h.setNow(at);
      const c = await h.close(week);
      all.push(...c.body.entries);
      for (const e of c.body.entries) {
        assert.ok(e.site_delta >= 0 && e.agos_delta >= 0 && e.supplier_delta >= 0, `no negative share on a collection: ${JSON.stringify(e)}`);
        assert.equal(e.site_delta + e.agos_delta + e.supplier_delta, e.collected_delta);
      }
      if (next !== null) await h.collect(ref, next);
    }
    assert.deepEqual(quad(all, ref), [5000, 1000, 500, 3500]);
  });

  it("A2.6 [RULE] a shuttle booking that joins an already-assigned run must still be settled (site 20 % / AGOS 10 %)", async () => {
    const h = harness();
    h.setNow("2026-11-04T08:00:00Z");
    const first = await h.book({ pickupAt: "2026-11-04T13:00" });
    await h.service.confirm(first.body.ref);
    const run = await h.runOf(first.body.ref);
    assert.equal((await h.service.assignRun(run, "sup-a")).status, 200);
    // second customer books the same slot AFTER the run was assigned
    const late = await h.book({ pickupAt: "2026-11-04T13:30" });
    assert.equal(late.status, 201);
    assert.equal(await h.runOf(late.body.ref), run, "placed into the already-assigned run");
    await h.service.confirm(late.body.ref);
    const c = await h.collect(late.body.ref, 5000);
    const done = await h.service.completeRun(run);
    const row = await h.row(late.body.ref);
    h.setNow("2026-11-09T06:00:00Z");
    const w45 = (await h.close(W45)).body;
    const visible = JSON.stringify(w45).includes(late.body.ref);
    assert.deepEqual(
      { collect: c.status, completed: (done.body as any).bookings.map((x: any) => x.result), status: row.status, supplier: row.settlement?.supplier_id ?? null, inReport: visible },
      { collect: 200, completed: ["completed", "completed"], status: "delivered", supplier: "sup-a", inReport: true },
      "late joiner: collection impossible, delivered without supplier, invisible in the weekly report",
    );
  });

  it("A2.7 [RULE] money collected for a transfer that is never marked completed must be visible on the statement", async () => {
    const h = harness();
    h.setNow("2026-11-04T08:00:00Z");
    const b = await h.book();
    const ref = b.body.ref;
    await h.service.confirm(ref);
    await h.service.assignRun(await h.runOf(ref), "sup-a");
    await h.collect(ref, 5000);
    h.setNow("2026-11-09T06:00:00Z");
    const w45 = (await h.close(W45)).body;
    assert.ok(
      JSON.stringify([w45.entries, w45.exceptions, w45.customer_balances]).includes(ref),
      "supplier holds 50 EUR of customer money, but the booking appears nowhere in W45 (no entry, exception or balance)",
    );
  });
});

describe("A2 QA-F14 collected but not completed (Paket-02)", () => {
  /** Book, confirm, assign, collect; the run is NOT completed. Returns ref and run id. */
  const collectedOpen = async (h: ReturnType<typeof harness>, siteId: string, amount: number) => {
    const b = await h.book({ siteId });
    const ref = b.body.ref as string;
    await h.service.confirm(ref);
    const run = await h.runOf(ref);
    await h.service.assignRun(run, "sup-a");
    await h.collect(ref, amount);
    return { ref, run };
  };
  const reasonsFor = (rep: any, ref: string) => (rep.exceptions as any[]).filter((e) => e.booking_ref === ref).map((e) => e.reason).sort();

  it("A2.8 [RULE] lifecycle: visible each week while uncompleted, no shares before completion, shares once completed, closed weeks frozen", async () => {
    const h = harness();
    h.setNow("2026-11-04T08:00:00Z");
    const { ref, run } = await collectedOpen(h, "partner-site", 3000);
    h.setNow("2026-11-09T06:00:00Z");
    const w45 = (await h.close(W45)).body;
    h.setNow("2026-11-16T06:00:00Z");
    const w46 = (await h.close(W46)).body;
    h.setNow("2026-11-18T08:00:00Z");
    await h.service.completeRun(run);
    h.setNow("2026-11-23T06:00:00Z");
    const w47 = (await h.close(W47)).body;
    const w45again = await h.report(W45);
    assert.deepEqual(
      {
        w45: { reasons: reasonsFor(w45, ref), shares: quad(w45.entries, ref) },
        w46: { reasons: reasonsFor(w46, ref), shares: quad(w46.entries, ref) },
        w47: { reasons: reasonsFor(w47, ref), shares: quad(w47.entries, ref) },
        w45Frozen: JSON.stringify(w45again.exceptions) === JSON.stringify(w45.exceptions),
      },
      {
        w45: { reasons: ["collected_not_completed"], shares: [0, 0, 0, 0] },
        w46: { reasons: ["collected_not_completed"], shares: [0, 0, 0, 0] },
        w47: { reasons: [], shares: [3000, 600, 300, 2100] },
        w45Frozen: true,
      },
    );
    const ex = (w45.exceptions as any[]).find((e) => e.booking_ref === ref);
    assert.equal(ex.collected_amount, 3000, "the exception carries the cash held by the supplier");
  });

  it("A2.9 cancellation after collection keeps its own reason; no second 'collected_not_completed' line (QA-F14 guard)", async () => {
    const h = harness();
    h.setNow("2026-11-04T08:00:00Z");
    const { ref } = await collectedOpen(h, "partner-site", 5000);
    await h.service.cancel(ref);
    h.setNow("2026-11-09T06:00:00Z");
    const w45 = (await h.close(W45)).body;
    assert.deepEqual(reasonsFor(w45, ref), ["cancelled_after_collection"]);
  });

  it("A2.10 [RULE] a site credential sees its own collected-not-completed exception, never another site's", async () => {
    const h = harness();
    await h.start();
    try {
      h.setNow("2026-11-04T08:00:00Z");
      const own = await collectedOpen(h, "partner-site", 2000);
      const rival = await collectedOpen(h, "rival-site", 2000);
      h.setNow("2026-11-09T06:00:00Z");
      const r = await h.adminGet(`/v1/admin/settlements/${W45}`, { authorization: `Bearer ${SITE_TOKEN.partner}` });
      assert.equal(r.status, 200);
      assert.deepEqual(
        { own: reasonsFor(r.body, own.ref), rivalVisible: JSON.stringify(r.body).includes(rival.ref) },
        { own: ["collected_not_completed"], rivalVisible: false },
      );
    } finally {
      await h.stop();
    }
  });
});


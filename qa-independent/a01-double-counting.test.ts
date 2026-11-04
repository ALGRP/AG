// Area 1 — double counting of commissions across weeks / closings / reports.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { W45, W46, W47, harness, sumFor } from "./harness.ts";

describe("A1 double counting", () => {
  it("A1.1 a fully collected job is settled exactly once over three consecutive closings", async () => {
    const h = harness();
    h.setNow("2026-11-04T10:00:00Z");
    const ref = await h.shuttleJob({}, "sup-a", 5000);
    const all: any[] = [];
    for (const [week, at] of [[W45, "2026-11-09T06:00:00Z"], [W46, "2026-11-16T06:00:00Z"], [W47, "2026-11-23T06:00:00Z"]] as const) {
      h.setNow(at);
      const c = await h.close(week);
      assert.equal(c.status, 201, JSON.stringify(c.body));
      all.push(...c.body.entries);
    }
    assert.deepEqual(
      ["collected_delta", "site_delta", "agos_delta", "supplier_delta"].map((f) => sumFor(all, ref, f)),
      [5000, 1000, 500, 3500],
    );
    assert.equal(all.filter((e) => e.booking_ref === ref).length, 1, "one entry only, in W45");
  });

  it("A1.2 a closed week's report never re-counts after the next week closes (frozen + prior entries)", async () => {
    const h = harness();
    h.setNow("2026-11-04T10:00:00Z");
    const ref = await h.shuttleJob({}, "sup-a", 3000); // 30 of 50
    h.setNow("2026-11-09T06:00:00Z");
    await h.close(W45);
    h.setNow("2026-11-10T06:00:00Z");
    await h.collect(ref, 2000);
    h.setNow("2026-11-16T06:00:00Z");
    await h.close(W46);
    const r45 = await h.report(W45);
    const r46 = await h.report(W46);
    const live47 = await h.report(W47);
    assert.equal(sumFor(r45.entries, ref, "collected_delta") + sumFor(r46.entries, ref, "collected_delta") + sumFor(live47.entries, ref, "collected_delta"), 5000);
    assert.equal(live47.entries.length, 0);
  });

  it("A1.3 [RULE] the open-week reports must not show a collection that a closed week already settled (first close skipped W45)", { skip: "QA-F7: first close cannot skip the earliest active week; A4.4 is the new assertion" }, async () => {
    const h = harness();
    h.setNow("2026-11-04T10:00:00Z");
    const ref = await h.shuttleJob({}, "sup-a", 5000); // W45 job
    h.setNow("2026-11-16T06:00:00Z"); // W47 Monday; nothing closed yet
    const c46 = await h.close(W46); // first ever close is W46, not W45
    assert.equal(c46.status, 201, "W46 can be closed first (observed)");
    assert.equal(sumFor(c46.body.entries, ref, "collected_delta"), 5000, "W46 already settles the W45 job");
    const r45 = await h.report(W45); // W45 can never be closed any more
    assert.equal(r45.closed, false);
    assert.equal(
      sumFor(r45.entries, ref, "collected_delta"),
      0,
      "W45 report shows the same 50 EUR again although W46 (closed) already settled it -> counted twice across reports",
    );
  });

  it("A1.4 [RULE] two open-week previews must not both carry the same delta", { todo: "QA-L1 · Paket-02 (önizleme)" }, async () => {
    const h = harness();
    h.setNow("2026-11-04T10:00:00Z");
    const ref = await h.shuttleJob({}, "sup-a", 5000);
    h.setNow("2026-11-10T10:00:00Z"); // in W46, W45 not closed yet
    const p45 = await h.report(W45);
    const p46 = await h.report(W46);
    assert.equal(sumFor(p45.entries, ref, "collected_delta"), 5000);
    assert.equal(
      sumFor(p46.entries, ref, "collected_delta"),
      0,
      "W46 preview repeats the W45 delta while W45 is still open (sum of previews = 100 EUR for a 50 EUR collection)",
    );
  });
});

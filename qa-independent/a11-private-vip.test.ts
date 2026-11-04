// Area 11 — Private/VIP partial collection maths (pro-rata, rounding, entitlement > sale, AGOS share 0).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { privateSplit, splitOnCollected } from "@ag/core";
import { W45, W46, W47, harness, sumFor } from "./harness.ts";

const quad = (entries: any[], ref: string) => ["collected_delta", "site_delta", "agos_delta", "supplier_delta"].map((f) => sumFor(entries, ref, f));

async function privateJob(h: ReturnType<typeof harness>, siteId: string, product: "private" | "vip", entitlement: number | null, collector: "supplier" | "site" = "supplier") {
  const b = await h.book({ siteId, product, routeCode: undefined });
  assert.equal(b.status, 201, JSON.stringify(b.body));
  const ref = b.body.ref as string;
  const a = entitlement === null
    ? await h.service.assignPrivate(ref, { mode: "self" })
    : await h.service.assignPrivate(ref, { mode: "pass", supplierId: "sup-p", supplierEntitlementMinor: entitlement });
  assert.equal(a.status, 200, JSON.stringify(a.body));
  assert.equal((await h.service.confirm(ref)).status, 200);
  return { ref, collector };
}

describe("A11 private / VIP", () => {
  it("A11.1 pro-rata: 80 EUR sale, 47,50 entitlement; 40 + 40 over two weeks -> 16,25/0/23,75 twice; AGOS always 0", async () => {
    const h = harness();
    h.setNow("2026-11-04T08:00:00Z");
    const { ref } = await privateJob(h, "partner-site", "private", 4750);
    await h.collect(ref, 4000);
    await h.service.completePrivate(ref);
    h.setNow("2026-11-09T06:00:00Z");
    const w45 = (await h.close(W45)).body;
    assert.deepEqual(quad(w45.entries, ref), [4000, 1625, 0, 2375]);
    h.setNow("2026-11-10T06:00:00Z");
    await h.collect(ref, 4000);
    h.setNow("2026-11-16T06:00:00Z");
    const w46 = (await h.close(W46)).body;
    assert.deepEqual(quad(w46.entries, ref), [4000, 1625, 0, 2375]);
    for (const r of [w45, w46]) assert.equal(r.obligations.filter((o: any) => o.kind === "agos_fee").length, 0);
  });

  it("A11.2 odd amounts (sale 99,99, entitlement 33,33): 1 + 4998 + 5000 cents never drift, no negative share, AGOS 0", async () => {
    const h = harness();
    h.setNow("2026-11-04T08:00:00Z");
    const { ref } = await privateJob(h, "rival-site", "private", 3333);
    await h.collect(ref, 1);
    await h.service.completePrivate(ref);
    const all: any[] = [];
    for (const [week, at, next] of [[W45, "2026-11-09T06:00:00Z", 4998], [W46, "2026-11-16T06:00:00Z", 5000], [W47, "2026-11-23T06:00:00Z", 0]] as const) {
      h.setNow(at);
      const c = (await h.close(week)).body;
      for (const e of c.entries) {
        assert.equal(e.agos_delta, 0);
        assert.ok(e.site_delta >= 0 && e.supplier_delta >= 0, JSON.stringify(e));
      }
      all.push(...c.entries);
      if (next > 0) await h.collect(ref, next);
    }
    assert.deepEqual(quad(all, ref), [9999, 6666, 0, 3333]);
  });

  it("A11.3 entitlement > sale, negative, fractional or non-numeric is refused; entitlement can't change after a collection", async () => {
    const h = harness();
    h.setNow("2026-11-04T08:00:00Z");
    const ref = (await h.book({ product: "vip", routeCode: undefined })).body.ref; // 120 EUR
    for (const e of [12001, -1, 100.5, "6000", null]) {
      assert.equal((await h.service.assignPrivate(ref, { mode: "pass", supplierId: "sup-p", supplierEntitlementMinor: e })).body.error, "supplierEntitlementMinor_invalid", String(e));
    }
    assert.equal((await h.service.assignPrivate(ref, { mode: "pass", supplierId: "sup-p", supplierEntitlementMinor: 12000 })).status, 200);
    await h.service.confirm(ref);
    await h.collect(ref, 1000);
    assert.equal((await h.service.assignPrivate(ref, { mode: "pass", supplierId: "sup-p", supplierEntitlementMinor: 1 })).body.error, "collection_already_recorded");
    assert.equal((await h.service.assignPrivate(ref, { mode: "pool" })).status, 501, "pool not implemented");
    assert.throws(() => privateSplit(8000, 9000, "site-1", "sup-1"));
  });

  it("A11.4 site collects: site owes the supplier its pro-rata entitlement, AGOS 0; overcollection capped; refund reverses pro-rata", async () => {
    const h = harness();
    h.setNow("2026-11-04T08:00:00Z");
    const { ref } = await privateJob(h, "partner-site", "vip", 6000); // 120 EUR sale, supplier 60
    await h.collect(ref, 13000, { collector: "site", method: "bank_transfer" }); // 10 EUR too much
    await h.service.completePrivate(ref);
    h.setNow("2026-11-09T06:00:00Z");
    const w45 = (await h.close(W45)).body;
    assert.deepEqual(quad(w45.entries, ref), [12000, 6000, 0, 6000]);
    const ob = w45.obligations.find((o: any) => o.kind === "supplier_entitlement");
    assert.deepEqual([ob.debtor_id, ob.creditor_id, ob.amount], ["p-001", "sup-p", 6000]);
    assert.ok(w45.exceptions.some((e: any) => e.booking_ref === ref && e.reason === "overcollected" && e.customer_refund_due === 1000));
    h.setNow("2026-11-10T06:00:00Z");
    await h.service.refund(ref, { amountMinor: 1000, refundReference: "RF-OVER" }); // excess back: no correction
    await h.service.refund(ref, { amountMinor: 3000, refundReference: "RF-PART" }); // net 90 of 120
    h.setNow("2026-11-16T06:00:00Z");
    const w46 = (await h.close(W46)).body;
    assert.deepEqual(quad(w46.entries, ref), [-3000, -1500, 0, -1500]);
  });

  it("A11.5 self mode by a verified site keeps 100 %, AGOS 0; unverified site cannot self-supply", async () => {
    const h = harness();
    h.setNow("2026-11-04T08:00:00Z");
    const { ref } = await privateJob(h, "self-op-site", "private", null); // 100 EUR
    await h.collect(ref, 2500);
    await h.service.completePrivate(ref);
    h.setNow("2026-11-09T06:00:00Z");
    const w45 = (await h.close(W45)).body;
    assert.deepEqual(quad(w45.entries, ref), [2500, 0, 0, 2500]);
    assert.equal(w45.obligations.length, 0);
    const other = (await h.book({ siteId: "partner-site", product: "private", routeCode: undefined })).body.ref;
    assert.equal((await h.service.assignPrivate(other, { mode: "self" })).body.error, "self_operation_not_verified");
  });

  it("A11.6 core pro-rata helper: zero entitlement / full entitlement / partial", () => {
    const base = { service_type: "private" as const, final_booking_price: 8000, currency: "EUR" as const, selling_party_id: "s", supplier_id: "x" };
    assert.deepEqual([splitOnCollected({ ...base, site_commission_amount: 8000 }, 4000)].map((s) => [s.site_commission_amount, s.agos_fee_amount, s.supplier_entitlement]), [[4000, 0, 0]]);
    assert.deepEqual([splitOnCollected({ ...base, site_commission_amount: 0 }, 4000)].map((s) => [s.site_commission_amount, s.agos_fee_amount, s.supplier_entitlement]), [[0, 0, 4000]]);
    assert.deepEqual([splitOnCollected({ ...base, site_commission_amount: 3250 }, 9000)].map((s) => [s.site_commission_amount, s.agos_fee_amount, s.supplier_entitlement]), [[3250, 0, 4750]]);
  });
});

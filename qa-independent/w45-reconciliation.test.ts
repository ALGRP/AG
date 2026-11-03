// Row-by-row re-derivation of the sample week from the freshly generated docs/ornek-hafta-2026-W45.json
// (run `npm run report:sample` first). Expected values are computed here with independent arithmetic,
// not with the product's split functions.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

const J = JSON.parse(readFileSync(resolve(import.meta.dirname, "../docs/ornek-hafta-2026-W45.json"), "utf8"));
const w45 = J.w45;

// What the sample script did (apps/api/src/sample-week.ts), restated as business facts per booking.
// price = Owner tariff 1..4 pax 30/50/60/70; 6 pax = manual 90 (approved bounds 80..140); private = site price 80, entitlement 47,50.
const FACTS: Record<string, { site: string; party: string; supplier: string; service: string; price: number; collected: number; self: boolean; entitlement?: number }> = {
  "AG-R4FT6H": { site: "ege-transfer", party: "p-ege", supplier: "sup-yildiz", service: "shuttle", price: 3000, collected: 3000, self: false },
  "AG-Q3ES5G": { site: "ege-transfer", party: "p-ege", supplier: "sup-yildiz", service: "shuttle", price: 5000, collected: 5000, self: false },
  "AG-P2DR4F": { site: "alanyagroup-com", party: "alanya-group", supplier: "sup-yildiz", service: "shuttle", price: 7000, collected: 7000, self: false },
  "AG-NZCQ3E": { site: "alanyagroup-com", party: "alanya-group", supplier: "sup-akdeniz", service: "shuttle", price: 6000, collected: 6000, self: false },
  "AG-MYBP2D": { site: "side-tur", party: "p-side", supplier: "p-side", service: "shuttle", price: 5000, collected: 5000, self: true },
  "AG-KXANZC": { site: "ege-transfer", party: "p-ege", supplier: "sup-akdeniz", service: "shuttle", price: 5000, collected: 3000, self: false },
  "AG-JW9MYB": { site: "ege-transfer", party: "p-ege", supplier: "sup-yildiz", service: "shuttle", price: 3000, collected: 3500, self: false },
  "AG-FT6HV8": { site: "ege-transfer", party: "p-ege", supplier: "sup-akdeniz", service: "shuttle", price: 9000, collected: 9000, self: false },
  "AG-5GU7JW": { site: "ege-transfer", party: "p-ege", supplier: "sup-akdeniz", service: "private", price: 8000, collected: 8000, self: false, entitlement: 4750 },
};

function expected(f: (typeof FACTS)[string]): [number, number, number, number] {
  const base = Math.min(f.collected, f.price); // commission capped at the price
  if (f.service === "private") {
    const siteShare = f.price - f.entitlement!; // 32,50 on 80
    const site = Math.floor((base * siteShare) / f.price);
    return [base, site, 0, base - site]; // AGOS 0 on private/VIP
  }
  const supplier = Math.floor((base * 70) / 100);
  const site = Math.floor((base * 20) / 100);
  const agos = base - supplier - site;
  return f.self ? [base, 0, agos, supplier + site] : [base, site, agos, supplier];
}

describe("W45 sample — row-by-row reconciliation", () => {
  it("each of the 9 entries follows its own rule (shuttle 20/10/70, self-supply 0/10/90, private site-set, AGOS 0 on private)", () => {
    assert.equal(w45.closed, true);
    assert.equal(w45.entries.length, 9);
    for (const e of w45.entries) {
      const f = FACTS[e.booking_ref];
      assert.ok(f, `unexpected row ${e.booking_ref}`);
      assert.deepEqual([e.selling_site_id, e.selling_party_id, e.supplier_id, e.service_type, e.self_supplied], [f.site, f.party, f.supplier, f.service, f.self], e.booking_ref);
      assert.deepEqual([e.collected_delta, e.site_delta, e.agos_delta, e.supplier_delta], expected(f), e.booking_ref);
      assert.equal(e.kind, "collection");
      assert.equal(e.base_before, 0);
    }
  });

  it("totals: 490 collected = 344,50 supplier + 104,50 site + 41 AGOS", () => {
    const sum = (k: string) => w45.entries.reduce((s: number, e: any) => s + e[k], 0);
    assert.deepEqual([sum("collected_delta"), sum("supplier_delta"), sum("site_delta"), sum("agos_delta")], [49000, 34450, 10450, 4100]);
    const site = w45.site_receivables.reduce((s: number, r: any) => s + r.total, 0);
    assert.equal(site, 10450);
    assert.equal(w45.agos_fees.total_by_currency.EUR, 4100);
  });

  it("excluded rows: disputed AG-HV8KXA (30 collected) and cancelled AG-U7JW9M are exceptions, not entries; overcollection 5 EUR refundable; 20 EUR still owed", () => {
    assert.deepEqual(w45.exceptions.map((x: any) => [x.booking_ref, x.reason, x.collected_amount, x.customer_refund_due]).sort(), [
      ["AG-HV8KXA", "disputed", 3000, 0],
      ["AG-JW9MYB", "overcollected", 3500, 500],
      ["AG-U7JW9M", "cancelled", 0, 0],
    ]);
    assert.deepEqual(w45.customer_balances.map((b: any) => [b.booking_ref, b.remaining]), [["AG-KXANZC", 2000]]);
  });

  it("W46 carries the remainder (+4/+2/+14) and the refund correction (-10/-5/-35)", () => {
    const by = (r: string) => J.w46.entries.find((e: any) => e.booking_ref === r);
    assert.deepEqual(["collected_delta", "site_delta", "agos_delta", "supplier_delta"].map((k) => by("AG-KXANZC")[k]), [2000, 400, 200, 1400]);
    assert.deepEqual(["collected_delta", "site_delta", "agos_delta", "supplier_delta"].map((k) => by("AG-Q3ES5G")[k]), [-5000, -1000, -500, -3500]);
  });
});

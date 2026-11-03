// Area 5 — duplicate booking submission, duplicate collection reference, duplicate bank receipt.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ORIGIN, W45, harness, sumFor } from "./harness.ts";

const body = (over: Record<string, unknown> = {}) => ({
  siteId: "partner-site",
  product: "shuttle",
  routeCode: "AYT-ALN",
  pickup: "AYT",
  dropoff: "Alanya",
  pickupAt: "2026-12-10T10:00",
  passengers: 2,
  customer: { name: "Dup Guest", email: "dup@example.com", phone: "+49 151 1234567", locale: "de" },
  consent: true,
  ...over,
});

describe("A5 duplicate submissions", () => {
  it("A5.1 same Idempotency-Key (sequential and 8x concurrent over HTTP) -> one booking, same ref", async () => {
    const h = harness();
    await h.start();
    try {
      const headers = { origin: ORIGIN["partner-site"]!, "idempotency-key": "qa-idem-key-000000001" };
      const rs = await Promise.all(Array.from({ length: 8 }, () => h.httpPost("/v1/public/bookings", body(), headers)));
      assert.ok(rs.every((r) => r.status === 201), JSON.stringify(rs.map((r) => r.status)));
      assert.equal(new Set(rs.map((r) => r.body.ref)).size, 1);
      const again = await h.httpPost("/v1/public/bookings", body(), headers);
      assert.equal(again.body.ref, rs[0]!.body.ref);
      assert.equal((await h.store.listBookings()).length, 1);
      const changed = await h.httpPost("/v1/public/bookings", body({ passengers: 3 }), headers);
      assert.deepEqual([changed.status, changed.body.error], [409, "idempotency_key_reused_with_different_body"]);
    } finally {
      await h.stop();
    }
  });

  it("A5.2 same payload with a different key is flagged as suspected duplicate and blocked from settlement until reviewed", async () => {
    const h = harness();
    h.setNow("2026-11-04T08:00:00Z");
    const a = await h.book({ pickupAt: "2026-12-11T10:00", customer: { name: "D", email: "Same@Example.com", phone: "+49 151 7654321", locale: "de" } }, "qa-dup-key-a-000001");
    const b = await h.book({ pickupAt: "2026-12-11T10:00", customer: { name: "D", email: "same@example.com", phone: "+49 (151) 765-4321", locale: "de" } }, "qa-dup-key-b-000001");
    assert.equal(a.status, 201);
    assert.equal(b.status, 201);
    assert.equal((await h.row(b.body.ref)).isDuplicate, true, "case/format variants are normalised");
    // both run in the same slot -> same run
    await h.service.confirm(a.body.ref);
    await h.service.confirm(b.body.ref);
    const run = await h.runOf(a.body.ref);
    await h.service.assignRun(run, "sup-a");
    await h.collect(a.body.ref, 5000);
    await h.collect(b.body.ref, 5000);
    await h.service.completeRun(run);
    h.setNow("2026-11-09T06:00:00Z");
    const w45 = (await h.close(W45)).body;
    assert.equal(sumFor(w45.entries, a.body.ref, "collected_delta"), 5000);
    assert.equal(sumFor(w45.entries, b.body.ref, "collected_delta"), 0);
    assert.ok(w45.exceptions.some((e: any) => e.booking_ref === b.body.ref && e.reason === "suspected_duplicate"));
  });

  it("A5.3 duplicate collection reference on the same booking is refused", async () => {
    const h = harness();
    h.setNow("2026-11-04T08:00:00Z");
    const ref = await h.shuttleJob({}, "sup-a", null);
    assert.equal((await h.collect(ref, 3000, { reference: "POS-SAME" })).status, 200);
    assert.equal((await h.collect(ref, 3000, { reference: "POS-SAME" })).body.error, "reference_already_recorded");
  });

  it("A5.4 [RULE] one physical slip/receipt number of the same supplier must not be recorded on two bookings", { todo: "QA-F9 · Paket-02 (tahsis modeli kararı)" }, async () => {
    const h = harness();
    h.setNow("2026-11-04T08:00:00Z");
    const r1 = await h.shuttleJob({}, "sup-a", null);
    const r2 = await h.shuttleJob({}, "sup-a", null);
    assert.equal((await h.collect(r1, 5000, { reference: "MAKBUZ-0001" })).status, 200);
    const second = await h.collect(r2, 5000, { reference: "MAKBUZ-0001" });
    assert.equal(second.status, 409, "the same receipt MAKBUZ-0001 of sup-a is accepted on a second booking");
  });

  it("A5.5 duplicate bank receipt (same payer + reference, also for another week) is refused", async () => {
    const h = harness();
    const rc = (weekId: string, bankReference: string) =>
      h.service.addReceipt({ weekId, payerId: "sup-a", payeeId: "agos", amountMinor: 500, currency: "EUR", bankReference, paidAt: "2026-11-10T08:00:00Z" });
    assert.equal((await rc(W45, "TR-0002")).status, 201);
    assert.equal((await rc(W45, "TR-0002")).body.error, "duplicate_bank_reference");
    assert.equal((await rc("2026-W46", "TR-0002")).body.error, "duplicate_bank_reference");
  });

  it("A5.6 [RULE] the same bank receipt typed in a different letter case must be detected as a duplicate", async () => {
    const h = harness();
    h.setNow("2026-11-04T10:00:00Z");
    await h.shuttleJob({}, "sup-a", 5000); // owes agos 5 EUR, site 10 EUR
    h.setNow("2026-11-09T06:00:00Z");
    await h.close(W45);
    const rc = (bankReference: string) =>
      h.service.addReceipt({ weekId: W45, payerId: "sup-a", payeeId: "p-001", amountMinor: 1000, currency: "EUR", bankReference, paidAt: "2026-11-10T08:00:00Z" });
    assert.equal((await rc("TR-EFT-9001")).status, 201);
    const dup = await rc("tr-eft-9001");
    const ob = (await h.report(W45)).obligations.find((o: any) => o.creditor_id === "p-001");
    assert.deepEqual({ dup: dup.status, paid: ob.paid, status: ob.status }, { dup: 409, paid: 1000, status: "paid" }, "one 10 EUR transfer is counted as 20 EUR paid");
  });
});

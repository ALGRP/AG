// Area 10 — wrong site credited (spoofed siteId/origin, alanyagroup.com attribution, self-supply misuse).
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { ORIGIN, W45, harness, sumFor } from "./harness.ts";

const raw = (siteId: string, over: Record<string, unknown> = {}) => ({
  siteId,
  product: "shuttle",
  routeCode: "AYT-ALN",
  pickup: "AYT",
  dropoff: "Alanya",
  pickupAt: "2026-12-12T10:00",
  passengers: 2,
  customer: { name: "Attr", email: `attr-${Math.random().toString(36).slice(2)}@example.com`, phone: "+49 151 2222222", locale: "de" },
  consent: true,
  ...over,
});

describe("A10 attribution over HTTP", () => {
  const h = harness();
  before(() => h.start());
  after(() => h.stop());

  it("A10.1 a browser on site A cannot claim site B (origin must match the claimed site's domains)", async () => {
    const r = await h.httpPost("/v1/public/bookings", raw("partner-site"), { origin: ORIGIN["rival-site"]!, "idempotency-key": "qa-attr-key-00000001" });
    assert.deepEqual([r.status, r.body.error], [403, "origin_not_allowed"]);
    const http = await h.httpPost("/v1/public/bookings", raw("partner-site"), { origin: "http://www.partner.example", "idempotency-key": "qa-attr-key-00000002" });
    assert.deepEqual([http.status, http.body.error], [403, "origin_not_allowed"]);
    const none = await h.httpPost("/v1/public/bookings", raw("partner-site"), { "idempotency-key": "qa-attr-key-00000003" });
    assert.deepEqual([none.status, none.body.error], [403, "origin_not_allowed"]);
  });

  it("A10.2 [RULE] a non-browser client must not be able to credit an arbitrary site by forging the Origin header", { todo: "QA-F11 · Paket-02 (atıf kanıtı)" }, async () => {
    // Plain HTTP client (no browser): forge the Origin of partner-site; no site credential or signature is required.
    const r = await h.httpPost("/v1/public/bookings", raw("partner-site", { pickupAt: "2026-12-12T11:00" }), { origin: "https://www.partner.example", "idempotency-key": "qa-attr-key-00000004" });
    const row = await h.row(r.body.ref);
    assert.notEqual(
      `${r.status}:${row?.siteId}`,
      "201:partner-site",
      "forged Origin accepted: booking (and its future 20 % commission) attributed to partner-site / p-001",
    );
  });
});

describe("A10 attribution rules", () => {
  it("A10.3 alanyagroup.com is a selling site under the same 20/10/70 rule (party alanya-group)", async () => {
    const h = harness();
    h.setNow("2026-11-04T10:00:00Z");
    const ref = await h.shuttleJob({ siteId: "alanyagroup-com" }, "sup-a", 5000, "card_pos");
    h.setNow("2026-11-09T06:00:00Z");
    const w45 = (await h.close(W45)).body;
    const e = w45.entries.find((x: any) => x.booking_ref === ref);
    assert.deepEqual([e.selling_party_id, e.site_delta, e.agos_delta, e.supplier_delta], ["alanya-group", 1000, 500, 3500]);
  });

  it("A10.4 self-supply: verified site keeps 90 %, AGOS 10 %, no self-commission; unverified and case-variant ids refused", async () => {
    const h = harness();
    h.setNow("2026-11-04T10:00:00Z");
    const self = await h.shuttleJob({ siteId: "self-op-site" }, "p-002", 5000);
    const b = await h.book({ siteId: "partner-site" });
    await h.service.confirm(b.body.ref);
    const run = await h.runOf(b.body.ref);
    assert.equal((await h.service.assignRun(run, "p-001")).body.error, "self_operation_not_verified");
    assert.equal((await h.service.assignRun(run, "P-001")).body.error, "supplierId_invalid");
    h.setNow("2026-11-09T06:00:00Z");
    const e = (await h.close(W45)).body.entries.find((x: any) => x.booking_ref === self);
    assert.deepEqual([e.self_supplied, e.site_delta, e.agos_delta, e.supplier_delta], [true, 0, 500, 4500]);
  });

  it("A10.5 mixed run: a verified self-operating site driving another site's customer gets 70 %, that site 20 %", async () => {
    const h = harness();
    h.setNow("2026-11-04T08:00:00Z");
    const own = await h.book({ siteId: "self-op-site", pickupAt: "2026-12-20T10:00" });
    const other = await h.book({ siteId: "partner-site", pickupAt: "2026-12-20T10:10" });
    await h.service.confirm(own.body.ref);
    await h.service.confirm(other.body.ref);
    const run = await h.runOf(own.body.ref);
    assert.equal(await h.runOf(other.body.ref), run);
    assert.equal((await h.service.assignRun(run, "p-002")).status, 200);
    await h.collect(own.body.ref, 5000);
    await h.collect(other.body.ref, 5000);
    await h.service.completeRun(run);
    h.setNow("2026-11-09T06:00:00Z");
    const entries = (await h.close(W45)).body.entries;
    const pick = (ref: string) => {
      const e = entries.find((x: any) => x.booking_ref === ref);
      return [e.selling_party_id, e.supplier_id, e.site_delta, e.agos_delta, e.supplier_delta];
    };
    assert.deepEqual(pick(own.body.ref), ["p-002", "p-002", 0, 500, 4500]);
    assert.deepEqual(pick(other.body.ref), ["p-001", "p-002", 1000, 500, 3500]);
  });

  it("A10.6 [RULE] a self-operation 'verification' dated in the future must not unlock 90/10 today", { todo: "QA-L6 · Paket-02" }, async () => {
    const h = harness();
    h.setNow("2026-11-04T10:00:00Z");
    const b = await h.book({ siteId: "future-verified" });
    await h.service.confirm(b.body.ref);
    const r = await h.service.assignRun(await h.runOf(b.body.ref), "p-009");
    assert.equal(r.body.error, "self_operation_not_verified", "selfOperationVerifiedAt=2099-01-01 is treated as verified in 2026");
  });

  it("A10.7 [RULE] dev origins must not let one origin book for every site (main.ts defaults AG_DEV_ORIGINS to localhost:4321 outside NODE_ENV=production)", { todo: "QA-L7 · Paket-02" }, async () => {
    const h = harness({ devOrigins: ["http://localhost:4321"] });
    const r = await h.book({ siteId: "rival-site" }, undefined, "http://localhost:4321");
    const r2 = await h.book({ siteId: "alanyagroup-com" }, undefined, "http://localhost:4321");
    assert.notDeepEqual([r.status, r2.status], [201, 201], "a single dev origin is accepted for every registered site");
    void sumFor;
  });
});

describe("A10 QA-F11 marketing data is never attribution authority", () => {
  it("A10.8 utm/gclid/referrer/attribution fields in the body never move the sale to another site (QA-F11 guard)", async () => {
    const h = harness();
    await h.start();
    try {
      const r = await h.httpPost(
        "/v1/public/bookings",
        raw("partner-site", { pickupAt: "2026-12-20T10:00", utm_source: "rival-site", gclid: "Cj0KCQ-test", referrer: "https://www.rival.example/", attribution: { siteId: "rival-site" }, sellingSiteId: "rival-site" }),
        { origin: ORIGIN["partner-site"]!, "idempotency-key": "qa-attr-key-00000099" },
      );
      assert.equal(r.status, 201);
      assert.equal((await h.row(r.body.ref)).siteId, "partner-site");
    } finally {
      await h.stop();
    }
  });
});


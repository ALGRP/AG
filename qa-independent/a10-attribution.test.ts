// Area 10 — wrong site credited (spoofed siteId/origin, alanyagroup.com attribution, self-supply misuse).
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { ORIGIN, W45, harness, sumFor } from "./harness.ts";
import { devOriginsForEnvironment, localHumanToken } from "../apps/api/src/human.ts";

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

  it("A10.2 [RULE] a non-browser client must not be able to credit an arbitrary site by forging the Origin header", async () => {
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
        raw("partner-site", { pickupAt: "2026-12-20T10:00", humanToken: localHumanToken("www.partner.example", "marketingCase0001"), utm_source: "rival-site", gclid: "Cj0KCQ-test", referrer: "https://www.rival.example/", attribution: { siteId: "rival-site" }, sellingSiteId: "rival-site" }),
        { origin: ORIGIN["partner-site"]!, "idempotency-key": "qa-attr-key-00000099" },
      );
      assert.equal(r.status, 201);
      assert.equal((await h.row(r.body.ref)).siteId, "partner-site");
    } finally {
      await h.stop();
    }
  });
});



describe("A10 QA-F11 site-bound challenge and header-forgery guards (LOCAL_ONLY)", () => {
  const partner = (nonce: string) => localHumanToken("www.partner.example", nonce);
  const rival = (nonce: string) => localHumanToken("www.rival.example", nonce);

  it("A10.9 rival-site challenge cannot credit partner-site", async () => {
    const h = harness();
    await h.start();
    try {
      const result = await h.httpPost("/v1/public/bookings",
        raw("partner-site", { humanToken: rival("rivalSpoof0001") }),
        { origin: ORIGIN["partner-site"]!, "idempotency-key": "qa-f11-host-00000001" });
      assert.deepEqual([result.status, result.body.error], [403, "attribution_not_verified"]);
    } finally { await h.stop(); }
  });

  it("A10.10 site-matching challenge + booking action credits only that site", async () => {
    const h = harness();
    await h.start();
    try {
      const result = await h.httpPost("/v1/public/bookings",
        raw("partner-site", { humanToken: partner("partnerMatch001") }),
        { origin: ORIGIN["partner-site"]!, "idempotency-key": "qa-f11-host-00000002" });
      assert.equal(result.status, 201, JSON.stringify(result.body));
      assert.equal((await h.row(result.body.ref)).siteId, "partner-site");
    } finally { await h.stop(); }
  });

  it("A10.11 Host / forwarded host / Referer headers never override verified site or Origin CORS rule", async () => {
    const h = harness();
    await h.start();
    try {
      const result = await h.httpPost("/v1/public/bookings",
        raw("partner-site", { humanToken: partner("headerForged001") }),
        {
          origin: ORIGIN["partner-site"]!,
          host: "www.rival.example",
          "x-forwarded-host": "www.rival.example",
          referer: "https://www.rival.example/",
          "idempotency-key": "qa-f11-headers-000001",
        });
      assert.equal(result.status, 201, JSON.stringify(result.body));
      assert.equal((await h.row(result.body.ref)).siteId, "partner-site");

      const rivalOrigin = await h.httpPost("/v1/public/bookings",
        raw("partner-site", { humanToken: partner("headerForged002") }),
        { origin: ORIGIN["rival-site"]!, "idempotency-key": "qa-f11-headers-000002" });
      assert.deepEqual([rivalOrigin.status, rivalOrigin.body.error], [403, "origin_not_allowed"]);
    } finally { await h.stop(); }
  });

  it("A10.12 a failed verifier (provider offline / timeout) denies the booking and does not store a lead", async () => {
    const h = harness({ humanVerifier: async () => { throw new Error("siteverify unavailable"); } });
    const result = await h.book({ humanToken: partner("networkFailure001") });
    assert.deepEqual([result.status, result.body.error], [403, "human_check_failed"]);
    assert.equal((await h.store.listBookings()).length, 0);
  });

  it("A10.13 replayed challenge under a new idempotency key cannot open another booking", async () => {
    const h = harness();
    await h.start();
    try {
      const token = partner("replayAttempt001");
      const input = raw("partner-site", { humanToken: token });
      const first = await h.httpPost("/v1/public/bookings", input,
        { origin: ORIGIN["partner-site"]!, "idempotency-key": "qa-f11-replay-000001" });
      const second = await h.httpPost("/v1/public/bookings", input,
        { origin: ORIGIN["partner-site"]!, "idempotency-key": "qa-f11-replay-000002" });
      assert.equal(first.status, 201);
      assert.deepEqual([second.status, second.body.error], [403, "human_check_failed"]);
      assert.equal((await h.store.listBookings()).length, 1);
    } finally { await h.stop(); }
  });

  it("A10.14 development origins are empty in every nonlocal environment", async () => {
    for (const mode of ["production", "prod", "Production", "", "preview"]) {
      assert.deepEqual(devOriginsForEnvironment(mode, "http://localhost:4321"), []);
    }
    assert.deepEqual(devOriginsForEnvironment("development", "http://localhost:4321"), ["http://localhost:4321"]);
    const h = harness({ devOrigins: [] });
    const attempt = await h.book({ siteId: "partner-site", humanToken: partner("noDevOrigin001") }, undefined, "http://localhost:4321");
    assert.deepEqual([attempt.status, attempt.body.error], [403, "origin_not_allowed"]);
  });

  it("A10.16 concurrent uses of the same challenge make exactly one booking", async () => {
    const h = harness();
    await h.start();
    try {
      const body = raw("partner-site", { humanToken: partner("concurrentToken01") });
      const requests = Array.from({ length: 8 }, (_, i) => h.httpPost("/v1/public/bookings", body, {
        origin: ORIGIN["partner-site"]!,
        "idempotency-key": `qa-f11-concurrent-${String(i).padStart(6, "0")}`,
      }));
      const replies = await Promise.all(requests);
      assert.deepEqual(replies.map((r) => r.status).sort(), [201, ...Array(7).fill(403)]);
      assert.equal((await h.store.listBookings()).length, 1);
    } finally { await h.stop(); }
  });

  it("A10.17 a token spent on a wrong site's booking cannot later be reused for its actual site", async () => {
    const h = harness();
    await h.start();
    try {
      const token = partner("wrongSiteSpent01");
      const attempt = await h.httpPost("/v1/public/bookings", raw("rival-site", { humanToken: token }),
        { origin: ORIGIN["rival-site"]!, "idempotency-key": "qa-f11-wrongsite-0001" });
      assert.deepEqual([attempt.status, attempt.body.error], [403, "attribution_not_verified"]);
      const replay = await h.httpPost("/v1/public/bookings", raw("partner-site", { humanToken: token }),
        { origin: ORIGIN["partner-site"]!, "idempotency-key": "qa-f11-wrongsite-0002" });
      assert.deepEqual([replay.status, replay.body.error], [403, "human_check_failed"]);
    } finally { await h.stop(); }
  });

  it("A10.15 wrong action or missing hostname is never treated as a valid booking challenge", async () => {
    for (const bad of [
      { ok: true, hostname: "www.partner.example", action: "login" },
      { ok: true, action: "booking" },
      { ok: false, hostname: "www.partner.example", action: "booking" },
    ]) {
      const h = harness({ humanVerifier: async () => bad });
      const result = await h.book();
      assert.equal(result.status, 403);
      assert.equal((await h.store.listBookings()).length, 0);
    }
  });
});

describe("A10 QA-F11 idempotent retry after a lost response", () => {
  it("A10.18 [RULE] a retry with the same idempotency key and a fresh challenge returns the original booking, not 409", async () => {
    const h = harness();
    h.setNow("2026-11-04T08:00:00Z");
    const key = "qa-retry-key-0000000001";
    const same = { pickupAt: "2026-12-21T10:00", customer: { name: "Retry Guest", email: "retry@example.com", phone: "+49 151 7777777", locale: "de" } };
    const first = await h.book({ ...same, humanToken: localHumanToken("www.partner.example", "retryNonce0001") }, key);
    assert.equal(first.status, 201);
    // The browser never saw the response (network drop); form.js resets Turnstile and resubmits with the SAME key.
    const retry = await h.book({ ...same, humanToken: localHumanToken("www.partner.example", "retryNonce0002") }, key);
    assert.deepEqual([retry.status, retry.body.ref], [first.status, first.body.ref], `retry returned ${retry.status} ${retry.body.error ?? ""}`);
  });
});


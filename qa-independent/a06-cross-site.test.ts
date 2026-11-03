// Area 6 — cross-site data access (public + admin endpoints, tenant-scoped authorisation).
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { ADMIN_TOKEN, ORIGIN, W45, harness } from "./harness.ts";

describe("A6 cross-site access", () => {
  const h = harness();
  let a: any;
  let b: any;
  before(async () => {
    await h.start();
    h.setNow("2026-11-04T08:00:00Z");
    a = (await h.book({ siteId: "partner-site" })).body;
    b = (await h.book({ siteId: "rival-site" })).body;
  });
  after(() => h.stop());

  it("A6.1 public lookup: site A's token never opens site B's booking; missing/garbage tokens -> 404", async () => {
    const get = (ref: string, token?: string) => fetch(`${h.base}/v1/public/bookings/${ref}`, { headers: token ? { "x-lookup-token": token } : {} });
    assert.equal((await get(a.ref, a.lookupToken)).status, 200);
    assert.equal((await get(b.ref, a.lookupToken)).status, 404);
    assert.equal((await get(b.ref)).status, 404);
    assert.equal((await get(b.ref, "0".repeat(64))).status, 404);
    const body = await (await get(a.ref, a.lookupToken)).json();
    assert.equal(JSON.stringify(body).includes("@"), false, "no customer e-mail in lookup output");
  });

  it("A6.2 no public endpoint exposes statements or admin data", async () => {
    for (const p of [`/v1/public/settlements/${W45}`, "/v1/public/bookings", "/v1/admin/bookings"]) {
      const r = await fetch(h.base + p);
      assert.ok([401, 404].includes(r.status), `${p} -> ${r.status}`);
    }
  });

  it("A6.3 [RULE] tenant isolation: a principal acting for site A must not read site B's bookings", async () => {
    // The only credential the API knows is the global static admin token. There is no site-/party-scoped principal,
    // so a "site A" operator necessarily holds the same token. We show the token is global, whatever site is claimed.
    const r = await h.adminGet("/v1/admin/bookings", { "x-site-id": "partner-site" });
    const sitesSeen = new Set((r.body as any[]).map((x) => x.siteId));
    assert.deepEqual([...sitesSeen].sort(), ["partner-site"], `credential sees: ${[...sitesSeen].join(", ")}`);
  });

  it("A6.4 [RULE] tenant isolation: a principal acting for site A must not change site B's booking", async () => {
    const r = await h.adminPost(`/v1/admin/bookings/${b.ref}/cancel`, {}, { "x-site-id": "partner-site" });
    assert.equal(r.status, 403, `cancel of rival-site booking returned ${r.status}`);
  });

  it("A6.5 [RULE] statements: a site sees only its own receivables", async () => {
    h.setNow("2026-11-04T10:00:00Z");
    await h.shuttleJob({ siteId: "partner-site" }, "sup-a", 5000);
    await h.shuttleJob({ siteId: "rival-site" }, "sup-a", 5000);
    const r = await h.adminGet(`/v1/admin/settlements/${W45}`, { "x-site-id": "partner-site" });
    const parties = (r.body.site_receivables as any[]).map((s) => s.site_party_id).sort();
    assert.deepEqual(parties, ["p-001"], `statement visible to the single admin credential: ${parties.join(", ")}`);
  });

  it("A6.6 admin endpoints without the token are closed", async () => {
    const r = await fetch(`${h.base}/v1/admin/settlements/${W45}`);
    assert.equal(r.status, 401);
    const wrong = await fetch(`${h.base}/v1/admin/bookings`, { headers: { authorization: `Bearer ${ADMIN_TOKEN}x` } });
    assert.equal(wrong.status, 401);
  });

  it("A6.7 [RULE] lookup tokens are stored only as hashes (idempotency record keeps the plaintext token)", async () => {
    const s = harness();
    const created = await s.book({ siteId: "partner-site" }, "qa-plain-token-0001");
    const stored = await s.store.getIdempotency("intake:partner-site:qa-plain-token-0001");
    assert.ok(stored);
    assert.equal(JSON.stringify(stored).includes(created.body.lookupToken), false, "plaintext lookup token persisted in the idempotency store");
  });
});

// Area 14 — PKG-F04b approved non-cash customer credit (Paket-02). Contract defined in docs/konsey/PKG-F04b-NAKITSIZ-KREDI.md.
// H-25 (who bears the credit) is OPEN: a credit only closes the customer's debt; it never creates party-to-party money.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MANAGER, SITE_TOKEN, W45, W46, harness, sumFor } from "./harness.ts";

type Credit = (actor: unknown, ref: string, input: Record<string, unknown>) => Promise<{ status: number; body: any }>;
const credit = (h: ReturnType<typeof harness>): Credit => {
  const fn = (h.service as any).approveCustomerCredit as Credit | undefined;
  return fn ? fn.bind(h.service) : async () => ({ status: 501, body: { error: "not_implemented" } });
};
const quad = (entries: any[], ref: string) => ["collected_delta", "site_delta", "agos_delta", "supplier_delta"].map((f) => sumFor(entries, ref, f));

describe("A14 PKG-F04b approved non-cash credit", () => {
  it("A14.1 [RULE] 30 EUR cash + approved 20 EUR credit: customer debt 0, shares stay on cash only (6/3/21), no party-to-party lines", async () => {
    const h = harness();
    h.setNow("2026-11-04T10:00:00Z");
    const ref = await h.shuttleJob({}, "sup-a", 3000);
    const c = await credit(h)(MANAGER, ref, { amountMinor: 2000, reason: "Gecikme nedeniyle hizmet kredisi", creditReference: "KRD-0001" });
    assert.equal(c.status, 201, `credit refused: ${c.status} ${c.body.error ?? ""}`);
    h.setNow("2026-11-09T06:00:00Z");
    const w45 = (await h.close(W45)).body;
    assert.deepEqual(
      {
        balance: (w45.customer_balances as any[]).filter((b) => b.booking_ref === ref).length,
        shares: quad(w45.entries, ref),
        creditLines: [...(w45.obligations as any[]), ...(w45.adjustments as any[])].filter((x) => JSON.stringify(x).includes("KRD-0001")).length,
      },
      { balance: 0, shares: [3000, 600, 300, 2100], creditLines: 0 },
    );
  });

  it("A14.2 [RULE] credit needs MFA manager, reason, unique reference (case-insensitive) and must not exceed the remaining debt", async () => {
    const h = harness();
    h.setNow("2026-11-04T10:00:00Z");
    const ref = await h.shuttleJob({}, "sup-a", 3000);
    const ok = { amountMinor: 1000, reason: "Gecikme nedeniyle hizmet kredisi", creditReference: "KRD-0002" };
    const f = credit(h);
    const got = [
      (await f({ ...MANAGER, mfa: false }, ref, ok)).body.error,
      (await f({ id: "op", role: "operator", mfa: true }, ref, ok)).body.error,
      (await f(MANAGER, ref, { ...ok, reason: "x" })).body.error,
      (await f(MANAGER, ref, { ...ok, amountMinor: 2001 })).body.error,
      (await f(MANAGER, ref, ok)).status,
      (await f(MANAGER, ref, { ...ok, creditReference: "krd-0002" })).body.error,
      (await f(MANAGER, ref, { ...ok, amountMinor: 1001, creditReference: "KRD-0003" })).body.error,
    ];
    assert.deepEqual(got, ["mfa_required", "role_not_allowed", "reason_required", "credit_exceeds_remaining", 201, "duplicate_credit_reference", "credit_exceeds_remaining"]);
  });

  it("A14.3 [RULE] the static admin token and a site credential cannot grant a credit over HTTP", async () => {
    const h = harness();
    await h.start();
    try {
      h.setNow("2026-11-04T10:00:00Z");
      const ref = await h.shuttleJob({}, "sup-a", 3000);
      const body = { amountMinor: 1000, reason: "Gecikme nedeniyle hizmet kredisi", creditReference: "KRD-HTTP-1" };
      const admin = await h.adminPost(`/v1/admin/bookings/${ref}/credit-note`, body);
      const site = await h.adminPost(`/v1/admin/bookings/${ref}/credit-note`, body, { authorization: `Bearer ${SITE_TOKEN.partner}` });
      assert.deepEqual([admin.status, admin.body.error, site.status], [403, "mfa_required", 403]);
    } finally {
      await h.stop();
    }
  });

  it("A14.4 [RULE] a credit after W45 is closed changes only later weeks; W45 stays frozen; cancelled bookings get no credit", async () => {
    const h = harness();
    h.setNow("2026-11-04T10:00:00Z");
    const ref = await h.shuttleJob({}, "sup-a", 3000);
    h.setNow("2026-11-09T06:00:00Z");
    const closed = (await h.close(W45)).body;
    h.setNow("2026-11-10T10:00:00Z");
    assert.equal((await credit(h)(MANAGER, ref, { amountMinor: 2000, reason: "Gecikme nedeniyle hizmet kredisi", creditReference: "KRD-0004" })).status, 201);
    const again = await h.report(W45);
    const w46 = await h.report(W46);
    assert.deepEqual(again.customer_balances, closed.customer_balances, "closed week changed");
    assert.equal((w46.customer_balances as any[]).filter((b) => b.booking_ref === ref).length, 0);
    const b = await h.book({});
    await h.service.cancel(b.body.ref);
    assert.equal((await credit(h)(MANAGER, b.body.ref, { amountMinor: 100, reason: "Iptal sonrasi kredi denemesi", creditReference: "KRD-0005" })).status, 409);
  });
});


describe("A14.5 customer credit boundary checks (LOCAL_ONLY)", () => {
  it("rejects reused global credit reference even on another booking, and site-scoped callers cannot approve", async () => {
    const h = harness();
    h.setNow("2026-11-04T10:00:00Z");
    const first = await h.shuttleJob({}, "sup-a", 3000);
    const second = await h.shuttleJob({}, "sup-a", 3000);
    const approve = credit(h);
    const request = { amountMinor: 1000, reason: "Gecikme nedeni ile kredi", creditReference: "KRD-GLOBAL-001" };
    assert.equal((await approve(MANAGER, first, request)).status, 201);
    assert.deepEqual(
      [(await approve(MANAGER, second, { ...request, creditReference: "krd-global-001" })).status,
       (await approve({ ...MANAGER, scope: { kind: "site", siteId: "partner-site", partyId: "p-001" } }, second, { ...request, creditReference: "KRD-GLOBAL-002" })).status],
      [409, 403],
    );
    const row = await h.row(first);
    assert.equal(row.creditNotes.length, 1);
    assert.equal(row.creditNotes[0].reference, "KRD-GLOBAL-001");
    assert.equal(row.creditNotes[0].amountMinor, 1000);
    assert.equal(row.creditNotes[0].mfaVerified, true);
    const audit = (await h.store.listOutbox()).filter((e) => e.type === "audit.customer_credit_approved");
    assert.equal(audit.length, 1);
    assert.equal(audit[0]!.payload.creditId, row.creditNotes[0].id);
  });

  it("credit granted after week end does not rewrite even an unclosed earlier week's customer balance", async () => {
    const h = harness();
    h.setNow("2026-11-04T10:00:00Z");
    const ref = await h.shuttleJob({}, "sup-a", 3000);
    h.setNow("2026-11-10T10:00:00Z");
    assert.equal((await credit(h)(MANAGER, ref, { amountMinor: 2000, reason: "Gecikme nedeniyle kredi", creditReference: "KRD-WEEK-01" })).status, 201);
    const earlier = await h.report(W45);
    const later = await h.report(W46);
    assert.deepEqual((earlier.customer_balances as any[]).filter((x) => x.booking_ref === ref).map((x) => x.remaining), [2000]);
    assert.equal((later.customer_balances as any[]).filter((x) => x.booking_ref === ref).length, 0);
    assert.equal(later.entries.filter((x: any) => x.booking_ref === ref).length, 1,
      "unclosed prior week collection should first settle in the earliest closed week; no credit-only payment entry");
  });

  it("credit reason PII is redacted and no credit creates money events or manual adjustments", async () => {
    const h = harness();
    h.setNow("2026-11-04T10:00:00Z");
    const ref = await h.shuttleJob({}, "sup-a", 3000);
    const beforeEvents = (await h.row(ref)).moneyEvents.length;
    const body = { amountMinor: 2000, reason: "Musteri jane@example.com +90 555 123 4567 aradi", creditReference: "KRD-REDACT-01" };
    assert.equal((await credit(h)(MANAGER, ref, body)).status, 201);
    const row = await h.row(ref);
    assert.equal(row.moneyEvents.length, beforeEvents);
    assert.ok(!row.creditNotes[0].reason.includes("jane@example.com"));
    assert.ok(!row.creditNotes[0].reason.includes("555 123"));
    assert.equal((await h.store.listAdjustments()).length, 0);
  });
});

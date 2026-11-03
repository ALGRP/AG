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
  it("A14.1 [RULE] 30 EUR cash + approved 20 EUR credit: customer debt 0, shares stay on cash only (6/3/21), no party-to-party lines", { todo: "PKG-F04b · Codex Paket-02 (H-25 açık)" }, async () => {
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

  it("A14.2 [RULE] credit needs MFA manager, reason, unique reference (case-insensitive) and must not exceed the remaining debt", { todo: "PKG-F04b · Codex Paket-02" }, async () => {
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

  it("A14.3 [RULE] the static admin token and a site credential cannot grant a credit over HTTP", { todo: "PKG-F04b · Codex Paket-02" }, async () => {
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

  it("A14.4 [RULE] a credit after W45 is closed changes only later weeks; W45 stays frozen; cancelled bookings get no credit", { todo: "PKG-F04b · Codex Paket-02" }, async () => {
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

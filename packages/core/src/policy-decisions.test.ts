// Karar kaydı ↔ kod: tek kaynak kontrolü.
// config/policy-decisions.json, V2 paketindeki policies/decisions.json'un birebir kopyasıdır
// (SHA-256 d4639e2b…, paket manifestiyle aynı). Kayıt bir inceleme anlık görüntüsüdür, canlı tarife değildir.
// Kod sabiti ya da örnek yapılandırma kayıttan saparsa bu test kırılır; düzeltme önce kararda yapılır.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { DECK_V3_PARTNER_COSTS, FORBIDDEN_SHUTTLE_ROUTES, SHUTTLE_SPLIT_V1, parseShuttleTariff, privateSplit, shuttleSplit } from "./index.ts";

const ROOT = resolve(import.meta.dirname, "../../..");
const register = JSON.parse(readFileSync(resolve(ROOT, "config/policy-decisions.json"), "utf8"));
const tariff = parseShuttleTariff(JSON.parse(readFileSync(resolve(ROOT, "config/shuttle-tariff.example.json"), "utf8")));

describe("Karar kaydı ↔ kod (tek kaynak)", () => {
  it("kapsam konsorsiyum; shuttle 1–4 kişi toplamları kayıtla aynı ve 5. otomatik fiyat yok", () => {
    assert.equal(register.commercial.scope, "CONSORTIUM_SAAS");
    const totals = register.commercial.group_total_minor as Record<string, number>;
    assert.deepEqual(Object.keys(totals).map(Number), [1, 2, 3, 4]);
    assert.deepEqual(tariff.totalsMinor, [totals["1"], totals["2"], totals["3"], totals["4"]]);
  });

  it("pay oranları: site 2000, AGOS 1000, tedarikçi 7000 baz puan", () => {
    const bps = register.commercial.share_bps;
    assert.deepEqual([SHUTTLE_SPLIT_V1.partnerBps, SHUTTLE_SPLIT_V1.platformBps, SHUTTLE_SPLIT_V1.carrierBps], [bps.site, bps.agos, bps.supplier]);
  });

  it("aynı doğrulanmış taraf satıp taşırsa: %90 kendisinde, %10 AGOS, kendine komisyon yok", () => {
    const s = shuttleSplit(10000, "EUR", "party-x", "party-x");
    const same = register.commercial.same_party_economic_bps;
    assert.deepEqual([s.supplier_entitlement, s.agos_fee_amount, s.site_commission_amount], [same.seller_supplier, same.agos, 0]);
  });

  it("private/VIP'de AGOS işlem payı 0; abonelik 200 € ayrı", () => {
    assert.equal(register.commercial.private_vip_agos_fee_bps, 0);
    assert.equal(privateSplit(8000, 4750, "site-x", "sup-x").agos_fee_amount, 0);
    assert.equal(register.commercial.subscription_monthly_minor, DECK_V3_PARTNER_COSTS.subscriptionMinor);
    assert.equal(register.commercial.ads_payer, "SITE_OWNER");
    assert.equal(register.commercial.ads_reference_is_mandatory, false);
  });

  it("yasak hatlar kod ile aynı", () => {
    assert.deepEqual([...FORBIDDEN_SHUTTLE_ROUTES].sort(), [...register.forbidden_routes].sort());
  });

  it("açık kararlar açık kalır: onaylı 5+ sınırı yok, tarife önerilmiş durumda, canlı kapılar kapalı", () => {
    assert.equal(register.open.manual_5plus_bounds, null);
    assert.ok(Object.values(tariff.manualPriceBounds).every((b) => b.status !== "approved"));
    assert.equal(tariff.approval, "proposed");
    assert.ok(Object.values(register.live_gate).every((v) => v === false));
  });
});

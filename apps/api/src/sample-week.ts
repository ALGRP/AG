import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { SHUTTLE_SPLIT_V1, parseShuttleTariff, parseSiteRecord, type SiteRecord, type WeeklyReport } from "@ag/core";
import { renderWeeklyReportHtml } from "./report-html.ts";
import { BookingService, type Actor } from "./service.ts";
import { MemoryStore } from "./store.ts";

// Örnek haftalık rapor: SENTETİK verilerle 2026-W45 haftasını uçtan uca çalıştırır ve kapatır.
// Gerçek müşteri verisi, canlı ödeme veya banka işlemi YOKTUR.
// Kullanım: npm run report:sample  →  docs/ornek-hafta-2026-W45.html

const root = resolve(import.meta.dirname, "../../..");
let now = new Date("2026-11-02T06:00:00Z");
let seq = 0;

const sites = new Map<string, SiteRecord>(
  [
    { id: "ege-transfer", ownership: "partner", partnerId: "p-ege", domains: ["www.ege-transfer.example"], ownerEmail: "o@ege.example", status: "live", salePrices: { private: 8000, vip: 12000 }, saleCurrency: "EUR", collectionMethods: ["cash", "card_pos", "bank_transfer"] },
    { id: "side-tur", ownership: "partner", partnerId: "p-side", domains: ["www.side-tur.example"], ownerEmail: "o@side.example", status: "live", selfOperationVerifiedAt: "2026-10-20T00:00:00Z", collectionMethods: ["cash"] },
    { id: "alanyagroup-com", ownership: "ag_brand", domains: ["www.alanyagroup.example"], ownerEmail: "ops@ag.example", status: "live", collectionMethods: ["cash", "card_pos", "bank_transfer"] },
  ].map((raw) => {
    const s = parseSiteRecord(raw);
    return [s.id, s] as const;
  }),
);
const ORIGIN: Record<string, string> = Object.fromEntries([...sites.values()].map((s) => [s.id, `https://${s.domains[0]}`]));

const service = new BookingService({
  store: new MemoryStore(),
  sites,
  shuttleTariff: parseShuttleTariff({
    id: "shuttle-sample",
    approval: "approved",
    publishedAt: "2026-11-01",
    currency: "EUR",
    routes: ["AYT-ALN", "ALN-AYT", "AYT-SID", "SID-AYT"],
    routeInfo: {
      "AYT-ALN": { active: true, coverage: "AYT → Alanya merkez ve oteller" },
      "ALN-AYT": { active: true, coverage: "Alanya → AYT" },
      "AYT-SID": { active: true, coverage: "AYT → Side / Manavgat" },
      "SID-AYT": { active: true, coverage: "Side / Manavgat → AYT" },
    },
    // SENTETİK sınır (gerçek sınırlar Owner fiyat tablosunda kesinleşecek)
    manualPriceBounds: { "AYT-ALN": { minMinor: 8000, maxMinor: 14000, status: "approved" } },
    validFrom: "2026-11-01",
    maxPassengers: 10,
    totalsMinor: [3000, 5000, 6000, 7000],
  }),
  shuttlePolicy: SHUTTLE_SPLIT_V1,
  pool: { slotMinutes: 60, vehicleCapacity: 10 },
  devOrigins: [],
  clock: () => now,
  random: { id: () => `id-${String(++seq).padStart(4, "0")}`, index: (m) => (seq++ * 11) % m, token: () => `tok-${++seq}` },
  verifyHuman: async () => true,
});

function must<T>(r: { ok: boolean; status: number; body: T }, what: string): T {
  if (!r.ok) throw new Error(`${what}: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}

let n = 0;
async function book(siteId: string, over: Record<string, unknown>) {
  const body = must(
    await service.submit({
      raw: {
        siteId,
        product: "shuttle",
        routeCode: "AYT-ALN",
        pickup: "Antalya Havalimanı (AYT)",
        dropoff: "Alanya",
        pickupAt: "2026-11-03T10:00",
        passengers: 2,
        customer: { name: `Örnek Misafir ${++n}`, email: `misafir${n}@example.com`, phone: `+90 500 000 00${String(n).padStart(2, "0")}`, locale: "tr" },
        consent: true,
        ...over,
      },
      origin: ORIGIN[siteId],
      ip: "127.0.0.1",
      idempotencyKey: `sample-booking-${String(n).padStart(4, "0")}`,
    }),
    "book",
  ) as { ref: string };
  return body.ref;
}

async function runOf(ref: string): Promise<string> {
  const list = must(await service.listBookings(), "list") as Array<{ ref: string; shuttleRunId: string }>;
  return list.find((b) => b.ref === ref)!.shuttleRunId;
}

// Yönetim girişi + 2FA (SEL-332) geldiğinde oluşacak kimliği temsil eder; HTTP'deki geçici anahtar 2FA taşımaz.
const financeManager: Actor = { id: "ornek-finans-yoneticisi", role: "finance_manager", mfa: true };
let refN = 0;
const ref = (p: string) => `${p}-${String(++refN).padStart(4, "0")}`;

async function collect(bookingRef: string, method: string, amountMinor: number) {
  must(await service.recordCollection(bookingRef, { method, collector: "supplier", amountMinor, reference: ref("SLIP") }), "collect");
}

async function shuttle(siteId: string, over: Record<string, unknown>, supplierId: string, pay?: { method: string; amountMinor?: number }) {
  const bookingRef = await book(siteId, over);
  const price = { 1: 3000, 2: 5000, 3: 6000, 4: 7000 }[(over.passengers as number) ?? 2] ?? 0;
  must(await service.confirm(bookingRef), "confirm");
  const run = await runOf(bookingRef);
  must(await service.assignRun(run, supplierId), "assign");
  if (pay) await collect(bookingRef, pay.method, pay.amountMinor ?? price);
  must(await service.completeRun(run), "complete");
  return bookingRef;
}

// ---- Hafta içi (2026-W45) ----
now = new Date("2026-11-03T12:00:00Z");
await shuttle("ege-transfer", { passengers: 1, pickupAt: "2026-11-03T09:00" }, "sup-yildiz", { method: "cash" });
const refundLater = await shuttle("ege-transfer", { passengers: 2, pickupAt: "2026-11-03T13:00" }, "sup-yildiz", { method: "card_pos" });
await shuttle("alanyagroup-com", { passengers: 4, pickupAt: "2026-11-04T09:00" }, "sup-yildiz", { method: "cash" });
await shuttle("alanyagroup-com", { passengers: 3, pickupAt: "2026-11-04T12:00", routeCode: "ALN-AYT" }, "sup-akdeniz", { method: "bank_transfer" });
await shuttle("side-tur", { passengers: 2, pickupAt: "2026-11-05T10:00", routeCode: "AYT-SID" }, "p-side", { method: "cash" }); // kendi aracı
// T2: 50 € işten 30 € tahsil edildi → bu hafta 6/3/21; kalan 20 € sonraki hafta tahsil edilecek
const partial = await shuttle("ege-transfer", { passengers: 2, pickupAt: "2026-11-05T15:00" }, "sup-akdeniz", { method: "cash", amountMinor: 3000 });
// T1: 30 € işte yanlışlıkla 35 € alındı → pay 30 € üzerinden; 5 € müşteriye iade edilecek
await shuttle("ege-transfer", { passengers: 1, pickupAt: "2026-11-06T11:00" }, "sup-yildiz", { method: "cash", amountMinor: 3500 });
const disputed = await shuttle("alanyagroup-com", { passengers: 1, pickupAt: "2026-11-06T09:00" }, "sup-akdeniz", { method: "cash" });
must(await service.dispute(disputed, { reason: "Müşteri bekleme süresine itiraz etti" }), "dispute");
const cancelled = await book("ege-transfer", { pickupAt: "2026-11-07T10:00" });
must(await service.cancel(cancelled), "cancel");

// K17: 5+ kişi — 2FA'lı yetkili, hattın onaylı sınırı içinde, gerekçeyle
const big = await book("ege-transfer", { passengers: 6, pickupAt: "2026-11-06T14:00" });
must(await service.approveShuttlePrice(financeManager, big, { amountMinor: 9000, currency: "EUR", reason: "6 kişi, tek Sprinter, AYT-Alanya standart sefer" }), "approve");
must(await service.confirm(big), "confirm-big");
const bigRun = await runOf(big);
must(await service.assignRun(bigRun, "sup-akdeniz"), "assign-big");
await collect(big, "cash", 9000);
must(await service.completeRun(bigRun), "complete-big");

// Private: site hak edişi belirler (47,50 €), müşteri tedarikçiye öder
const priv = await book("ege-transfer", { product: "private", routeCode: undefined, pickupAt: "2026-11-07T08:00", dropoff: "Alanya, Mahmutlar" });
must(await service.assignPrivate(priv, { mode: "pass", supplierId: "sup-akdeniz", supplierEntitlementMinor: 4750 }), "assign-priv");
must(await service.confirm(priv), "confirm-priv");
must(await service.recordCollection(priv, { method: "cash", collector: "supplier", amountMinor: 8000, reference: ref("SLIP") }), "collect-priv");
must(await service.completePrivate(priv), "complete-priv");

// ---- Kapanış: Pazartesi sabahı ----
now = new Date("2026-11-09T05:00:00Z");
must(await service.closeWeek("2026-W45"), "close");
for (const party of ["sup-yildiz", "sup-akdeniz", "p-side", "p-ege", "alanya-group"]) must(await service.recordStatementSent("2026-W45", { partyId: party }), "sent");

// ---- Dekontlar (Salı) ----
now = new Date("2026-11-10T09:00:00Z");
const receipt = (payerId: string, payeeId: string, amountMinor: number, bankReference: string, purpose = "settlement") =>
  service.addReceipt({ weekId: "2026-W45", payerId, payeeId, amountMinor, currency: "EUR", bankReference, paidAt: "2026-11-10T08:30:00Z", purpose });
must(await receipt("sup-yildiz", "p-ege", 2200, "TR-EFT-1001"), "r1"); // tam: 6 + 10 + 6
must(await receipt("sup-yildiz", "agos", 1000, "TR-EFT-1002"), "r2"); // kısmi (borç 18 €)
must(await receipt("sup-yildiz", "alanya-group", 1400, "TR-EFT-1003"), "r3"); // tam
must(await receipt("p-side", "agos", 500, "TR-EFT-1004"), "r4"); // kendi aracı: yalnız AGOS
must(await receipt("sup-akdeniz", "alanya-group", 1200, "TR-EFT-1005"), "r5"); // tam
must(await receipt("sup-akdeniz", "agos", 1900, "TR-EFT-1006"), "r6"); // fazla ödeme: borç 18 €, 19 € gönderildi
must(await receipt("agos", "sup-akdeniz", 100, "TR-EFT-1008", "overpayment_refund"), "r6b"); // T1: fazla 1 € ödeyene iade
must(await receipt("sup-bilinmeyen", "p-ege", 2500, "TR-EFT-1007"), "r7"); // borçla eşleşmez
must(await receipt("p-ege", "agos", 20000, "TR-SAAS-1101", "subscription"), "saas"); // abonelik: komisyonla eşleşmez

// ---- T3: ekstre itirazı (süresinde) ----
now = new Date("2026-11-12T09:00:00Z");
const dsp = must(await service.raiseStatementDispute("2026-W45", { raisedBy: "p-ege", reason: "AG-tahsilat farkı: özel transfer satış farkı eksik hesaplandı iddiası", category: "calculation_error" }), "raise") as { id: string };
must(await service.decideStatementDispute(financeManager, dsp.id, { decision: "rejected", reason: "Dekont ve tahsilat kaydı karşılaştırıldı; satış farkı 32,50 € doğru hesaplanmış" }), "decide");

// ---- Rapor zamanı: Salı 20:00 İstanbul (son tarih geçti) ----
now = new Date("2026-11-10T17:00:00Z");
const w45 = must(await service.weekReport("2026-W45"), "report") as WeeklyReport;

// ---- Sonraki hafta: kalan tahsilat + kapanmış işe iade ----
now = new Date("2026-11-11T09:00:00Z");
await collect(partial, "cash", 2000); // T2: kalan 20 € → ilave 4 / 2 / 14
must(await service.refund(refundLater, { amountMinor: 5000, refundReference: "IADE-2026-0001" }), "refund");
now = new Date("2026-11-16T05:00:00Z");
must(await service.closeWeek("2026-W46"), "close-w46");
const w46 = must(await service.weekReport("2026-W46"), "report-w46") as WeeklyReport;

const html = renderWeeklyReportHtml(w45, {
  title: "AGOS · Haftalık hesap kapanışı · 2026-W45 (örnek)",
  nextWeek: w46,
  synthetic: true,
  subscriptions: [
    { site_id: "ege-transfer", period: "2026-11", amount: 20000, status: "paid" },
    { site_id: "side-tur", period: "2026-11", amount: 20000, status: "open" },
  ],
});
mkdirSync(resolve(root, "docs"), { recursive: true });
writeFileSync(resolve(root, "docs/ornek-hafta-2026-W45.html"), html);
writeFileSync(resolve(root, "docs/ornek-hafta-2026-W45.json"), JSON.stringify({ w45, w46 }, null, 2) + "\n");
console.log(
  `W45: ${w45.entries.length} fark kaydı, ${w45.exceptions.length} istisna, ${w45.customer_balances.length} açık müşteri borcu, ` +
    `${w45.debts_and_disputes.length} borç/ihtilaf · W46: ${w46.entries.map((e) => `${e.kind}:${e.collected_delta}`).join(" ")}`,
);

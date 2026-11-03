import type { WeeklyReport } from "@ag/core";

// Haftalık hesap kapanışı raporu — tek HTML dosyası (yazdırılabilir, bağımlılıksız).
// Bölümler Owner'ın istediği teslimlerle birebir: tedarikçi ekstresi, site komisyon alacakları,
// AGOS sistem payları, ödeme–dekont eşleştirme, borç ve ihtilaf listesi, istisnalar, düzeltmeler,
// ve shuttle komisyonlarından AYRI tutulan SaaS abonelikleri.

export interface SubscriptionRow {
  readonly site_id: string;
  readonly period: string;
  readonly amount: number;
  readonly status: "paid" | "open" | "overdue";
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const eur = (minor: number) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "EUR" }).format(minor / 100);
const ist = (iso: string) =>
  new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Istanbul" }).format(new Date(iso));

const STATUS_TR: Record<string, string> = {
  paid: "Ödendi",
  partially_paid: "Kısmi",
  unpaid: "Ödenmedi",
  overpaid: "Fazla ödeme",
  nothing_due: "Borç yok",
  credit_due: "Geri ödenecek",
  credit: "Alacaklı (iade)",
  settled: "Kapandı",
  open: "Açık",
  late: "Gecikmiş",
  overdue: "Gecikmiş",
};
const REASON_TR: Record<string, string> = {
  cancelled: "İptal (tahsilat yok)",
  cancelled_after_collection: "Tahsilat sonrası iptal — iade gerekli",
  refunded: "İade edildi",
  short_collected: "Eksik tahsilat",
  not_collected: "Tahsil edilemedi",
  disputed: "İtiraz",
  completed_without_collection_record: "Tamamlandı, tahsilat kaydı yok",
  partially_refunded: "Kısmi iade — karar bekliyor",
  overcollected: "Fazla tahsilat — müşteriye iade",
  suspected_duplicate: "Mükerrer şüphesi — inceleme bekliyor",
};
const DEBT_TR: Record<string, string> = {
  late_payment: "Geciken ödeme",
  missing_payment: "Eksik ödeme (son tarih bekleniyor)",
  partial_payment: "Kısmi ödeme",
  overpayment: "Fazla ödeme (ödeyene iade)",
  statement_dispute: "Ekstre itirazı",
  paid_late: "Geç ödendi",
  credit_due: "Tedarikçiye geri ödenecek",
  unmatched_receipt: "Eşleşmeyen dekont",
  booking_dispute: "Rezervasyon itirazı",
};
const METHOD_TR: Record<string, string> = { cash: "Nakit", card_pos: "Kart (POS)", bank_transfer: "Havale/EFT" };
const CATEGORY_TR: Record<string, string> = { calculation_error: "Maddi hesap hatası", legal_right: "Yasal hak", fraud_suspicion: "Sahtecilik şüphesi", other: "Diğer" };
const KIND_TR: Record<string, string> = {
  manual: "Elle düzeltme",
  site_commission: "Site komisyonu (shuttle %20)",
  site_sale_share: "Site satış farkı (private/VIP)",
  agos_fee: "AGOS sistem payı",
  supplier_entitlement: "Tedarikçi hak edişi",
};

function pill(status: string) {
  return `<span class="pill ${esc(status)}">${esc(STATUS_TR[status] ?? status)}</span>`;
}

function table(head: string[], rows: string[][], foot?: string[]) {
  const th = head.map((h) => `<th>${esc(h)}</th>`).join("");
  const body = rows.length ? rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${head.length}" class="empty">Kayıt yok</td></tr>`;
  const tf = foot ? `<tfoot><tr>${foot.map((c) => `<td>${c}</td>`).join("")}</tr></tfoot>` : "";
  return `<div class="tw"><table><thead><tr>${th}</tr></thead><tbody>${body}</tbody>${tf}</table></div>`;
}

export function renderWeeklyReportHtml(r: WeeklyReport, opts: { title: string; nextWeek?: WeeklyReport; subscriptions?: readonly SubscriptionRow[]; synthetic: boolean }): string {
  const w = r.week;
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

  const statements = r.supplier_statements
    .map((s) => {
      const lines = r.entries.filter((l) => l.supplier_id === s.supplier_id);
      const rows = lines.map((l) => [
        esc(l.booking_ref),
        esc(l.service_type),
        esc(l.selling_site_id),
        l.kind === "collection" ? "Tahsilat" : l.kind === "cancellation_reversal" ? '<span class="pill overpaid">İptal ters kaydı</span>' : '<span class="pill overpaid">İade düzeltmesi</span>',
        `${eur(l.base_before)} → ${eur(l.base_after)}`,
        eur(l.collected_delta),
        eur(l.supplier_delta),
        eur(l.collector === "supplier" ? l.site_delta : 0),
        eur(l.collector === "supplier" ? l.agos_delta : 0),
        esc(l.payment_reference ?? "—"),
        l.self_supplied ? "Kendi aracı" : "",
      ]);
      return `<section class="card"><h3>Tedarikçi: ${esc(s.supplier_id)} ${pill(s.status)}</h3>
<div class="kpis"><div><b>${s.jobs}</b><span>iş</span></div><div><b>${eur(s.collected)}</b><span>bu hafta hesaplanan tahsilat</span></div><div><b>${eur(s.entitlement)}</b><span>hak ediş (kendisinde kalır)</span></div><div><b>${eur(s.total_owed)}</b><span>ödeyeceği toplam</span></div><div><b>${eur(s.outstanding)}</b><span>kalan borç</span></div>${s.overpaid ? `<div><b>${eur(s.overpaid)}</b><span>fazla ödeme (iade edilir)</span></div>` : ""}${s.credits ? `<div><b>${eur(-s.credits)}</b><span>geri alacağı (iade)</span></div>` : ""}</div>
${table(
  ["Rezervasyon", "Hizmet", "Satış sitesi", "Tür", "Hesaplanan tahsilat", "Fark", "Hak ediş", "Siteye", "AGOS'a", "Ödeme dekontu", ""],
  rows,
  ["Toplam", "", "", "", "", eur(sum(lines.map((l) => l.collected_delta))), eur(s.entitlement), eur(sum(lines.map((l) => (l.collector === "supplier" ? l.site_delta : 0)))), eur(sum(lines.map((l) => (l.collector === "supplier" ? l.agos_delta : 0)))), "", ""],
)}
<p class="note">Ödeme son tarihi: <b>${esc(ist(w.payment_due_utc))}</b> (önerilen, Salı 18:00). Pay yalnız gerçekleşen tahsilat üzerinden hesaplanır; kalan müşteri borcu tahsil edildiğinde ilave pay oluşur.</p></section>`;
    })
    .join("");

  const siteRows = r.site_receivables.flatMap((s) =>
    s.by_supplier.map((b) => [esc(s.site_party_id), esc(b.supplier_id), eur(b.amount), eur(b.paid), eur(b.amount - b.paid)]),
  );
  const agosRows = r.agos_fees.by_supplier.map((a) => [esc(a.supplier_id), eur(a.amount), eur(a.paid), eur(a.amount - a.paid)]);
  const recRows = r.obligations.map((o) => [
    esc(o.debtor_id),
    esc(o.creditor_id),
    esc(KIND_TR[o.kind] ?? o.kind),
    eur(o.amount),
    eur(o.paid),
    eur(o.outstanding),
    o.receipt_refs.length ? esc(o.receipt_refs.join(", ")) : "—",
    pill(o.status) + (o.late ? ' <span class="pill late">Gecikmiş</span>' : "") + (o.paid_late ? ' <span class="pill overpaid">Geç ödendi</span>' : ""),
  ]);
  const unmatched = r.unmatched_receipts.map((x) => [esc(x.bank_reference), esc(x.payer_id), esc(x.payee_id), eur(x.amount), esc(ist(x.paid_at))]);
  const debts = r.debts_and_disputes.map((d) => [
    esc(DEBT_TR[d.kind] ?? d.kind) + (d.late ? ' <span class="pill late">Gecikmiş</span>' : ""),
    esc(d.obligation_kind ? KIND_TR[d.obligation_kind] ?? d.obligation_kind : "—"),
    esc(d.debtor_id ?? "—"),
    esc(d.creditor_id ?? "—"),
    eur(d.amount),
    esc(d.detail),
  ]);
  const exc = r.exceptions.map((e) => [esc(e.booking_ref), esc(e.supplier_id === "unassigned" ? "atanmadı" : e.supplier_id), esc(e.selling_site_id), esc(REASON_TR[e.reason] ?? e.reason), eur(e.final_booking_price), eur(e.collected_amount), e.customer_refund_due ? eur(e.customer_refund_due) : "—", esc(e.note ?? "")]);
  const bal = r.customer_balances.map((c) => [esc(c.booking_ref), esc(c.supplier_id), eur(c.final_booking_price), eur(c.collected_amount), eur(c.remaining)]);
  const disputes = r.statement_disputes.map((d) => [
    esc(d.id),
    esc(d.raised_by),
    esc(CATEGORY_TR[d.category] ?? d.category),
    esc(ist(d.raised_at)),
    d.timing.deadline ? esc(ist(d.timing.deadline)) : "—",
    esc(d.timing.note),
    pill(d.status),
    esc(d.decided_by ? `${d.decided_by} (${d.decided_role})` : "—"),
    esc(d.decision_reason ?? ""),
  ]);
  const adjSource = opts.nextWeek ?? r;
  const adj = adjSource.adjustments.map((a) => [esc(a.adjustment_reference), esc(a.kind === "offset" ? "Mahsup (yazılı onay)" : "İtiraz kararı"), esc(a.original_week_id), esc(a.week_id), esc(a.debtor_id), esc(a.creditor_id), eur(a.amount), esc(a.written_approval_reference ?? "—"), esc(a.reason)]);
  const corrections = (opts.nextWeek ?? r).entries.filter((e) => e.kind !== "collection").map((e) => [esc(e.booking_ref) + (e.kind === "cancellation_reversal" ? " (iptal)" : ""), esc(e.week_id), esc(e.supplier_id), eur(e.collected_delta), eur(e.site_delta), eur(e.agos_delta), eur(e.supplier_delta)]);
  const subs = (opts.subscriptions ?? []).map((s) => [esc(s.site_id), esc(s.period), eur(s.amount), pill(s.status)]);
  const subReceipts = r.subscription_receipts.map((x) => [esc(x.bank_reference), esc(x.payer_id), eur(x.amount), esc(ist(x.paid_at))]);

  const totalCollected = sum(r.entries.filter((l) => l.collector === "supplier").map((l) => l.collected_delta));
  const totalSite = sum(r.site_receivables.map((s) => s.total));
  const totalAgos = r.agos_fees.total_by_currency.EUR ?? 0;
  const totalEnt = sum(r.entries.filter((l) => l.collector === "supplier").map((l) => l.supplier_delta));

  return `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(opts.title)}</title>
<style>
:root{--ink:#14213d;--muted:#5c6577;--line:#dfe3ea;--soft:#f5f7fa;--ok:#1f7a4d;--warn:#a15c00;--bad:#b42318;--accent:#0b5ed7}
*{box-sizing:border-box}body{margin:0;font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:#fff}
.wrap{max-width:1180px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:1.6rem;margin:0 0 4px}h2{font-size:1.15rem;margin:36px 0 8px;padding-top:8px;border-top:2px solid var(--line)}h3{font-size:1rem;margin:0 0 8px}
.banner{background:#fff4e5;border:1px solid #f5c26b;border-radius:8px;padding:10px 12px;margin:12px 0}
.card{border:1px solid var(--line);border-radius:10px;padding:14px;margin:12px 0}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin:8px 0 12px}
.kpis div{background:var(--soft);border-radius:8px;padding:8px 10px}.kpis b{display:block;font-size:1.05rem}.kpis span{color:var(--muted);font-size:.85rem}
.tw{overflow-x:auto}table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}
th,td{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left;white-space:nowrap}th{background:var(--soft);font-weight:600}
tfoot td{font-weight:700;border-top:2px solid var(--ink)}td.empty{color:var(--muted);text-align:center}
.pill{display:inline-block;border-radius:999px;padding:1px 8px;font-size:.8rem;background:var(--soft)}
.pill.paid,.pill.settled{background:#e3f4ea;color:var(--ok)}.pill.partially_paid,.pill.open,.pill.overpaid{background:#fff4e5;color:var(--warn)}
.pill.unpaid,.pill.late,.pill.overdue{background:#fde8e7;color:var(--bad)}
.note{color:var(--muted);margin:6px 0 0}.check{color:var(--ok);font-weight:600}
@media print{.wrap{padding:0}h2{break-before:auto}.card{break-inside:avoid}}
</style></head><body><div class="wrap">
<h1>${esc(opts.title)}</h1>
<p>Hesap dönemi <b>${esc(w.week_id)}</b>: ${esc(ist(w.start_utc))} – Pazar 23:59 (Europe/Istanbul) · Önerilen ödeme son tarihi: <b>${esc(ist(w.payment_due_utc))}</b> · Rapor: ${esc(ist(r.generated_at))}</p>
${opts.synthetic ? '<div class="banner"><b>SENTETİK ÖRNEK.</b> Gerçek müşteri, tedarikçi veya ödeme verisi içermez. Canlı ödeme, banka transferi ve otomatik borç tahsilatı kapalıdır (Owner GO gerekir). Fatura, vergi ve tahsilatın hukuki sorumlusu mali müşavir/hukuk incelemesine tabidir.</div>' : ""}
<div class="kpis"><div><b>${new Set(r.entries.map((e) => e.booking_id)).size}</b><span>hesaplanan iş</span></div><div><b>${eur(totalCollected)}</b><span>tedarikçilerin tahsilatı</span></div><div><b>${eur(totalEnt)}</b><span>tedarikçi hak edişleri</span></div><div><b>${eur(totalSite)}</b><span>site komisyon alacakları</span></div><div><b>${eur(totalAgos)}</b><span>AGOS sistem payları</span></div><div><b>${r.exceptions.length}</b><span>istisna</span></div><div><b>${eur(sum(r.customer_balances.map((c) => c.remaining)))}</b><span>kalan müşteri borcu</span></div></div>
<p class="${totalCollected === totalEnt + totalSite + totalAgos ? "check" : ""}">Denklik kontrolü: tahsilat ${eur(totalCollected)} = hak ediş ${eur(totalEnt)} + site ${eur(totalSite)} + AGOS ${eur(totalAgos)} ${totalCollected === totalEnt + totalSite + totalAgos ? "✓" : "✗ UYUMSUZ"}</p>

<h2>1. Haftalık tedarikçi hesap ekstreleri</h2>
${statements || '<p class="note">Bu hafta hesaplanan iş yok.</p>'}

<h2>2. Site komisyon alacakları</h2>
${table(["Site (alacaklı)", "Tedarikçi (borçlu)", "Alacak", "Ödenen", "Kalan"], siteRows, ["Toplam", "", eur(totalSite), eur(sum(r.site_receivables.map((s) => s.received))), eur(sum(r.site_receivables.map((s) => s.outstanding)))])}

<h2>3. AGOS sistem payları</h2>
${table(["Tedarikçi (borçlu)", "AGOS payı", "Ödenen", "Kalan"], agosRows, ["Toplam", eur(totalAgos), eur(r.agos_fees.received_by_currency.EUR ?? 0), eur(totalAgos - (r.agos_fees.received_by_currency.EUR ?? 0))])}

<h2>4. Ödeme ve dekont eşleştirme</h2>
${table(["Ödeyen", "Alacaklı", "Tür", "Borç", "Ödenen", "Kalan", "Dekont", "Durum"], recRows)}
<h3 style="margin-top:14px">Eşleşmeyen dekontlar</h3>
${table(["Banka referansı", "Ödeyen", "Alıcı", "Tutar", "Tarih"], unmatched)}

<h2>5. Borç ve ihtilaf takip listesi</h2>
${table(["Tür", "Kalem", "Borçlu", "Alacaklı", "Tutar", "Açıklama"], debts)}

<h2>6. İstisna listesi</h2>
<p class="note">İptal, itiraz ve mükerrer şüphesi hesaplamayı durdurur. Fazla tahsilatta pay satış fiyatına kadar hesaplanır; fazlası müşteriye iade edilir.</p>
${table(["Rezervasyon", "Tedarikçi", "Satış sitesi", "Neden", "Satış", "Tahsil edilen", "Müşteriye iade", "Not"], exc)}
<h3 style="margin-top:14px">Kalan müşteri borçları (tahsil edilmemiş tutar ödemeye dahil edilmez)</h3>
${table(["Rezervasyon", "Tedarikçi", "Satış", "Tahsil edilen", "Kalan"], bal)}

<h2>7. Düzeltmeler</h2>
<p class="note">Eski haftanın kayıtları silinmez ve değişmez. İade olursa paylar otomatik yeniden hesaplanır ve fark içinde bulunulan haftaya yazılır; itiraz kararları ve yazılı onaylı mahsuplar elle düzeltme olarak sonraki açık döneme yazılır.</p>
<h3>İade sonrası yeniden hesaplama${opts.nextWeek ? ` (${esc(opts.nextWeek.week.week_id)})` : ""}</h3>
${table(["Rezervasyon", "Hafta", "Tedarikçi", "Tahsilat farkı", "Site farkı", "AGOS farkı", "Hak ediş farkı"], corrections)}
<h3 style="margin-top:14px">Elle düzeltmeler (itiraz kararı / yazılı onaylı mahsup)</h3>
${table(["Düzeltme ref.", "Tür", "Orijinal hafta", "Yazıldığı hafta", "Borçlu", "Alacaklı", "Tutar", "Yazılı onay", "Neden"], adj)}

<h2>7b. Ekstre itirazları</h2>
<p class="note">İtiraz süresi: ekstrenin tarafa iletilmesinden itibaren 7 takvim günü. Yasal hak, sahtecilik şüphesi ve maddi hesap hatası süre nedeniyle otomatik reddedilmez.</p>
${table(["Kayıt no", "İtiraz eden", "Kategori", "Tarih", "Son gün", "Süre", "Durum", "Karar veren", "Gerekçe"], disputes)}

<h2>8. SaaS abonelikleri (shuttle komisyonlarından AYRI)</h2>
<p class="note">Aylık 200 € abonelik ayrı takip edilir; komisyon borç/alacaklarıyla mahsup edilmez.</p>
${table(["Site", "Dönem", "Tutar", "Durum"], subs)}
<h3 style="margin-top:14px">Bu haftanın abonelik dekontları (komisyonlarla eşleştirilmez)</h3>
${table(["Banka referansı", "Ödeyen", "Tutar", "Tarih"], subReceipts)}
</div></body></html>
`;
}

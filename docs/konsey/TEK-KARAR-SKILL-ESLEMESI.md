# Tek karar / skill / test eşlemesi

**Durum:** V2.5 · 03.11.2026 · PR #9 dalı (`ccr-8f5e31db-2omg3h`).
**Kanoniklik:** Bu dosya kanonik eşlemedir. B belgesindeki eski tablo tarihseldir; çelişki olursa bu dosya geçerlidir. Owner kararlarının resmî kaydı Linear'dır (SEL-442). Repo'daki makine okunur ayna [`config/policy-decisions.json`](../../config/policy-decisions.json) dosyasıdır: V2 paketinin birebir kopyası, SHA-256 `d4639e2b…`. Kod sabitleri bu aynaya karşı [`policy-decisions.test.ts`](../../packages/core/src/policy-decisions.test.ts) ile denetlenir.

## 1. Kimlik şeması (tek)

| Önek | Anlamı | Kaynak |
| -- | -- | -- |
| `QA-F1`…`QA-F14` | Bağımsız AI okumasının bulguları | E §3, `qa-independent/` |
| `QA-L1`…`QA-L8` | Aynı okumanın düşük önemli bulguları (bu dosyada numaralandı) | aşağıdaki tablo |
| `PKG-F01`…`PKG-F18` | V2 paketinin bulguları | paket `docs/ARASTIRMA_VE_EKSIKLER.md` |
| `D-F02`…`D-F06` | Devir belgesinin finans regresyonları; **`PKG-F02`…`PKG-F06` ile aynı** | `settlement.regression.test.ts` |
| `H-n` | Açık Owner kararları | H belgesi |

**Politika kapsamları:** paketin adları kanoniktir: `CONSORTIUM_SAAS` (alt kapsamları `CONSORTIUM_SHUTTLE` ve `CONSORTIUM_PRIVATE_VIP`), `LEGACY_BID_MARKUP` ve `EXTERNAL_B2B_RESELLER`. V2 devrinde önerdiğim kimlikler bunların takma adıdır:

| Benim önerdiğim kimlik | Kanonik kapsam |
| -- | -- |
| `legacy-shuttle-tariff-2026-08` | Tarihsel kayıt; etkin kapsam değil (alanyagroup.com da konsorsiyum sitesidir) |
| `b2b-distributor-2026-11-02` | `EXTERNAL_B2B_RESELLER` |
| `pool-offer-markup-1.30` | `LEGACY_BID_MARKUP` |
| `pool-ledger-auto-netting-legacy` | `LEGACY_BID_MARKUP` (havuz cari) |
| `central-card-collection-legacy` | `LEGACY_BID_MARKUP` |

## 2. Karar → kanonik skill → kod → PR testi

Durum değerleri:
- **KESİN:** Owner ticari kararı.
- **YEREL QA:** yerel QA için onaylı, canlı değil.
- **AÇIK:** karar veya girdi bekliyor.
- **todo:** testin bugün kırmızı olduğu, bulgu kimliğiyle işaretli olduğu anlamına gelir.

| # | Karar | Kayıt anahtarı | Kanonik skill (tek sahip) | Kod | PR testleri | Durum |
| -- | -- | -- | -- | -- | -- | -- |
| 1 | Shuttle rezervasyon toplamı 1–4 kişi: 30/50/60/70 € | `commercial.group_total_minor` | agos-pricing-matrix (org; konsorsiyum ekiyle) | `shuttle.ts` `priceShuttle`, `config/shuttle-tariff.example.json` | `core.test`, `policy-decisions.test` | KESİN |
| 2 | 5+ kişi: onaylı hat sınırı + 2FA + gerekçe + denetim; 80 € / +10 € yok | `local_qa_accepted: K17_*`, `open.manual_5plus_bounds` | agos-pricing-matrix | `checkManualPrice`, `approveShuttlePrice` | `settlement.test` K17, `api.test` K17, A12.1–A12.4; **todo:** A12.5 (QA-F12), A12.6 (QA-L8) | YEREL QA; sayısal sınırlar AÇIK |
| 3 | Pay %20 site / %10 AGOS / %70 tedarikçi; alanyagroup.com dahil | `commercial.share_bps` | agos-consortium-policy (kural); agos-consortium-settlement (hesap) | `commission.ts` `SHUTTLE_SPLIT_V1`, `shuttleSplit` | `settlement.test`, `policy-decisions.test`, A10.3 | KESİN |
| 4 | Aynı doğrulanmış taraf satıp taşırsa %90 / %10 | `commercial.same_party_economic_bps` | agos-consortium-policy | `shuttleSplit` (kendi aracı), `selfOperationVerifiedAt` | `settlement.test`, `api.test`, A10.4; **todo:** A10.6 (QA-L6) | KESİN |
| 5 | Private/VIP: hak edişi site belirler, AGOS 0 | `commercial.private_vip_agos_fee_bps` | agos-consortium-policy | `privateSplit` | `settlement.test`, `api.test`, A11.1–A11.6 | KESİN; kısmi tahsilat orantısı AÇIK (`open.private_vip_pro_rata`) |
| 6 | Tahsilatı tedarikçi yapar | `commercial.collection_owner` | agos-consortium-settlement | `recordCollection`; DB `booking` CHECK | `api.test` tahsilat kuralları; **todo (DB):** Q13 (QA-F4) | KESİN; DB defter katmanı eksik |
| 7 | T2: komisyon yalnız tahsil edilmiş ve tamamlanmış işte | `local_qa_accepted: T2_*` | agos-consortium-settlement | `weeklyReport` | `settlement.test` T2, `settlement.regression.test`, A2.1–A2.5; **todo:** A2.6 (QA-F1), A2.7 (QA-F14) | YEREL QA |
| 8 | T1: fazla tahsilat müşteriye iade; otomatik mahsup yok; brüt yönlü kalemler | `local_qa_accepted: T1_*` | agos-consortium-settlement | `weeklyReport` borç kalemleri, `createOffset` | D-F03, D-F04, A3.1–A3.7, A3.10–A3.12; **todo:** A3.8 (QA-F2), A3.9 (QA-L3), PKG-F04b | YEREL QA |
| 9 | T3: itiraz, ekstre iletiminden itibaren 7 takvim günü; otomatik ret yok | `local_qa_accepted: T3_*` | agos-consortium-settlement | `disputeTiming` | `settlement.test` T3, `api.test` T3, A4.10; **todo:** A4.11 (QA-L4) | YEREL QA; gün tanımı AÇIK (H-20) |
| 10 | Hafta Pzt 00:00 – Paz 23:59 İstanbul; son ödeme Salı 18:00 | `open.payment_due_tuesday_18` | agos-consortium-settlement | `settlementWeekId`, `weekBounds`, `closeWeek` | `settlement.test`, A4.1–A4.3, A4.7, A4.8; **todo:** A4.4 / A1.3 (QA-F7), A4.5 (QA-L2), A1.4 (QA-L1) | Salı 18:00 sözleşme teyidi AÇIK |
| 11 | Kapanmış hafta değişmez; düzeltme sonraki açık haftaya | T1 ve T3 kapsamı | agos-consortium-settlement | Dondurulmuş görüntü; DB yalnız ekleme | `api.test`, A4.6, A4.9, A3.12; **todo (DB):** Q05, Q14, Q18 (QA-F4) | YEREL QA; DB defter katmanı eksik |
| 12 | İptal ters kaydı; dondurulmuş politika; küsurat | V2 devir | agos-consortium-settlement | `cancellation_reversal`, `policyFor`, `PriceSnapshot.splitPolicyId` | D-F06, D-F05, `policy-freeze.test`; **todo:** PKG-F05b, D-F02 (PKG-F02) | Küsurat AÇIK (H-23); pay farkı AÇIK (H-24) |
| 13 | Her yön ayrı hat kodu; AYT-GZP yasak; kapsam ve tarih | `forbidden_routes`, `open.route_coverage_and_live_dates` | agos-pricing-matrix; agos-transfer-yield-planning (Mac; ek) | `FORBIDDEN_SHUTTLE_ROUTES`, `routeInfo` | `core.test`, `settlement.test` K8, `policy-decisions.test`; **todo (DB):** Q27, Q28 | Yasak KESİN; kapsam ve tarih AÇIK |
| 14 | SaaS 200 €/ay; reklam gideri site sahibine; 40 €/gün yalnız örnek | `commercial.subscription_monthly_minor`, `ads_payer`, `ads_reference_*` | agos-consortium-policy; agos-ads-budget-control | `economics.ts` (iç); reklam kodu yok | `policy-decisions.test` | KESİN; uygulama yok |
| 15 | Eski kurallar ayrı kapsamda (80 €, +10 €/kişi, ×1,30, otomatik mahsup, merkeze kart tahsilatı) | Kapsamlar: `LEGACY_BID_MARKUP`, `EXTERNAL_B2B_RESELLER` | agos-consortium-policy; agos-pool-finance ve agos-pricing-matrix ekleri | Kod yalnız konsorsiyum kapsamında | **todo:** A12.5 (QA-F12) | Ayrım KESİN; B2B 80 € çakışması AÇIK (H-8) |
| 16 | K1: ana site Next.js; uydular statik; build aracı | `open.satellite_build_tool` | agos-consortium-policy (mimari); ag-domain-network-seo | `packages/ssg` | `ssg.test` | Build aracı AÇIK |
| 17 | Canlıya geçiş 8 koşulu | `live_gate.*` (hepsi `false`) | agos-release-preflight (Mac; ek) | `apps/api/src/main.ts` kapısı | A13.1, A13.2, A13.4, A13.5; **todo:** A13.3 (QA-F13) | KAPALI |
| 18 | Kimlik, 2FA, kiracı izolasyonu | SEL-332 | agos-governance (org); agos-code-quality-gate (Mac; ek) | `#requireMfa`, HTTP statik anahtar, DB RLS | `api.test`, A8.1, A8.2, A6.1, A6.2, A6.6; **todo:** A8.3–A8.5 (QA-F10), A6.3–A6.5 (QA-F3), A6.7 (QA-L5), A10.2 (QA-F11), A10.7 (QA-L7), RLS (QA-F3, DB) | AÇIK |
| 19 | Vergi ve fatura modeli | `open.tax_invoice_model` | — (mali müşavir ve hukuk) | — | — | AÇIK |

## 3. Owner'ın 10 alanı → tek skill

| Alan | Kanonik skill | Destek / yönlendirme | Değişen |
| -- | -- | -- | -- |
| 1 Konsorsiyum kuralları ve partner yönetimi | **agos-consortium-policy** (paket adayı) | — | — |
| 2 Shuttle fiyat ve komisyon | **agos-pricing-matrix** (fiyat; org, yönetilen) | Komisyon kuralı consortium-policy'de, hesap consortium-settlement'ta | — |
| 3 Private/VIP pass ve havuz | **agos-consortium-policy** (konsorsiyum) | agos-pool-finance: yalnız `LEGACY_BID_MARKUP` havuz ürünü (org; ek) | — |
| 4 Tahsilat ve haftalık kapanış | **agos-consortium-settlement** (tek yetkili) | agos-weekly-settlement = takma ad; agos-booking-payment-refund-controls (Mac) buraya yönlenir | Repo taslağı ile paket adayı tek dosyada birleşecek (§4) |
| 5 Google Ads / MCC | **agos-tenant-ads-onboarding** (paket adayı) | agos-google-platform-audit (Mac; ek) | — |
| 6 Meta Business | **agos-tenant-ads-onboarding** | — | — |
| 7 Uydu site ve SEO | **ag-domain-network-seo** (org) | — | Paket bu skill'e ek getirmedi; B §3.7 önerileri geçerli |
| 8 Dönüşüm ve reklam ölçümü | **agos-ads-attribution** (paket adayı) | agos-consent-based-growth (Mac; ek) | — |
| 9 Kiracı izolasyonu, kimlik, güvenlik | **agos-governance** (org) | agos-code-quality-gate (Mac; ek) | — |
| 10 Bağımsız test, release, geri dönüş | **agos-release-preflight** (Mac; ek) | agos-agent-evaluations (ajan değerlendirmesi), agos-skill-release-governance (skill sürümü) | **B'deki yeni `agos-release-gate` önerisi geri çekildi** (mükerrerdi) |
| Ek: reklam bütçesi | **agos-ads-budget-control** (paket adayı) | — | — |
| Ek: skill alımı ve kaynak güvencesi | **agos-skill-intake** (Mac) | agos-skill-source-assurance (Mac) | — |

## 4. Senaryolar (tek yer)

- **Ajan davranış senaryoları** iki dosyada, aralarında tekrar yok:
  - [`skills/evals/cases.json`](../../skills/evals/cases.json): V2 paketinin 72 senaryosu, birebir (SHA-256 `eb537fc3…`).
  - [`skills/evals/cases.repo-ek.json`](../../skills/evals/cases.repo-ek.json): paketle çakışmayan 6 senaryo (POLICY-13…16, FINANCE-19, SECURITY-11).
- Önceki 22 klasör kaldırıldı: 16'sı paketteki bir senaryonun aynısıydı, 6'sı ek dosyaya taşındı. Eşleme V2.5 raporunda.
- `claude plugin eval` klasörleri gerekirse koşum anında bu iki dosyadan üretilir; repo'ya ikinci kopya yazılmaz.
- **Kod testleri** (yukarıdaki tablo) ajan senaryosu değildir; ayrı raporlanır.

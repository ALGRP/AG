# 01 — Sayfalar ve İçerik

**Lens:** SAYFALAR VE İÇERİK — site yapısı, sayfa tipleri, içerik durumu · **Tarih:** 2026-09-12 · **Mod:** dokümantasyon, `owner_go=false`

> **Durum**
> 1. **Kayıt ne kuruyor:** 906 yayımlanmış URL (273 `page` + 633 `post`, 906/906 HTTP 200; anlık görüntü 2026-06-24, SEL-123). 12 sayfa tipi (PT01–PT12) ve 10 silo modeli tanımlı; ancak 906 satırın **hiçbiri** PT'ye göre sınıflandırılmamış, Gate 3 (içerik sınıflandırma) ve Gate 4 (canonical) **HOLD**. — kaynak: `agos/AG_BOOKING_COVERAGE_SUMMARY.md#L4,L39-51,L71-76`; `agos/AGSEO_01_PAGE_TYPE_RULES.md#L8`; `agos/AGOS_DECISION_GATES.md#L48-67`
> 2. **Bugün ne yapılabiliyor:** Hiçbir canlı sayfa okunamıyor, ölçülemiyor, düzenlenemiyor — dört erişim kanalı da kapalı. Bu bölümdeki **her sayı kayıt türevidir**, canlı ölçüm değildir. — kaynak: `AG/reports/ALANYAGROUP_FULL_SITE_REMEDIATION_SPEC_V1/ACCESS_STATUS.md#L7-12,L23`
> 3. **Bu bölüm ne belirliyor:** Site yapısının kayıttaki resmi, sayfa tipi modeli, mevcut ve eksik sınıflandırma, dil kapsamı, içerik paketi gereksinimleri, `CLAUDE.md §4` ile çelişkiler ve kapı etiketli uygulama sırası. Uygulama içermez.

## 0. Okuma kuralları

- Depo kısaltmaları: `agos/` = `ALGRP/AGOS` (private) kökü · `platform/` = `ALGRP/alanyagroup-platform` (private) kökü · `AG/` = bu depo (public).
- İki ana fixture yalnızca `page_post_id` üzerinden birleştirilir: `url` ile birleştirme 64 satırda (yüzde-kodlu RU/AR slug'lar) başarısız olur, `page_post_id` ile 699/699 eşleşir. — kaynak: `agos/AG_BOOKING_PRIORITY_MATRIX.csv` × `agos/AG_BOOKING_COVERAGE_INVENTORY.csv` (`url` / `page_post_id` sütunları; python3 set farkı, bu oturumda yeniden üretildi)
- **Gizlilik:** Bu dosya yalnızca toplamlar ve sayfa-tipi yapısı taşır. Formsuz para sayfalarının URL bazlı listesi kasıtlı olarak yoktur; URL düzeyi için private fixture `agos/AG_BOOKING_PRIORITY_MATRIX.csv` kullanılır. — kaynak: `AG/CLAUDE.md §6`
- Kayıt ile `AG/CLAUDE.md §4` çeliştiğinde §4 geçerlidir; çelişki §7'de görünür satır olarak yazılır, sessizce çözülmez.

## 1. Envanter — site yapısı (kayıt türevi)

| Ölçü | Değer | Kaynak |
|---|---:|---|
| Satır (= farklı `page_post_id`) | 906 | `agos/AG_BOOKING_COVERAGE_INVENTORY.csv` (`page_post_id`) |
| Farklı URL yolu | **905** — `/gazipasa-transfer/` iki kez: satır 126 (`page`) ve satır 777 (`post`) | aynı dosya, `url` sütunu (`Counter(url)>1`) |
| `page_type` | `post` 633 · `page` 273 | `agos/AG_BOOKING_COVERAGE_SUMMARY.md#L71-76` |
| `http_status` = 200 | 906 / 906 | `agos/AG_BOOKING_COVERAGE_SUMMARY.md#L40` |
| `final_url ≠ url` (200 ile envanterdeki başka sayfaya yönlenen alias) | 13 — hepsi `post`, `engine=none`, `dfc=0`; farklı `final_url` = 892 | inventory CSV, `final_url` sütunu |
| `booking_engine` | `none` 699 · `agsc-v6` 192 · `ag_home` 13 · `c6` 2 | `agos/AG_BOOKING_COVERAGE_SUMMARY.md#L43-46` |
| `distinct_form_count` | 0 → 699 · 1 → 207 · ≥2 → **0** | `agos/AG_BOOKING_COVERAGE_SUMMARY.md#L42,L48` |
| `literal_shortcode_text` = none | 906 / 906 | `agos/AG_BOOKING_COVERAGE_SUMMARY.md#L49` |
| Anlık görüntü tarihi | 2026-06-24 (SEL-123); üç depoda daha sonraki yeniden tarama yok | `agos/AG_BOOKING_COVERAGE_SUMMARY.md#L4`; `AG/reports/ALANYAGROUP_SITE_FINAL_REMEDIATION_V1/EXECUTION_PLAN.md#L38` |

Notlar (görünüşte çelişen, aslında çözülmüş kayıtlar):

- "~14/906 inline shortcode" (`platform/AI_COMMAND_CENTER/MASTER_PROJECT_STATUS.md#L46`) ayrı bir sütundur (`stored_shortcode_present_sel117=true` ×14), `literal_shortcode_text` ile çelişmez.
- "`/gazipasa-transfer/` double-form decision" (`MASTER_PROJECT_STATUS.md#L50`) çözülmüştür: tek `agsc-v6` form render ediyor; SEL-123 overlay'i `distinct_form_count` için nihaidir. — kaynak: `agos/AG_BOOKING_OWNER_DECISION_01.md#L31`; `agos/TRANSFER_02_LOCAL_FIXTURE_PROJECTION_REPORT.md#L35`
- 699 formsuz satırın **13'ü alias'tır**, ayrı sayfa değildir; kapsam doldurma hedef sayısı hesaplanırken düşülmelidir (alias'ın kendi `dfc=0` değeri hedef sayfanın formunu yansıtmaz). — kaynak: inventory CSV `final_url` sütunu

## 2. Sayfa tipi modeli (AGSEO-01, 2026-06-30)

`PAGE_TYPE_COUNT=12`, `SILO_COUNT=10`, `INTERNAL_LINK_RULE_COUNT=14`. — kaynak: `agos/AGSEO_01_PAGE_TYPE_RULES.md#L8`; `agos/AGSEO_01_SILO_HIERARCHY.csv#L2-11`; `agos/AGSEO_01_INTERNAL_LINKING_MODEL.md#L8`

| PT | Tip | Öncelik (PT_RULES) | Zorunlu bağımlılık (Required Dependencies sütunu) | Min. medya (AGMEDIA-02) |
|---|---|---|---|---:|
| PT01 | Brand Home | P0 | brand entity, organization schema, media | 5 |
| PT02 | Destination Hub | P0 | destination entity, region map, media, schema | 5 |
| PT03 | Region Hub | P1 | region entity, transfer/tour links, supporting article plan | 5 |
| PT04 | Airport Transfer Hub | P0 | airport entity, route list, booking proof, FAQ | 5 |
| PT05 | Transfer Route Landing | P0 (bkz. çelişki b) | route entity, price matrix, booking proof, schema, media | 5 |
| PT06 | Hotel Transfer Landing | P1 (bkz. çelişki a) | hotel entity, route proof, unique demand evidence, media | 3 |
| PT07 | Tour Category Hub | P1 | category entity, activity list, internal links | 5 |
| PT08 | Activity/Tour Landing | P1 | activity entity, media, FAQ, schema, booking/enquiry proof | 7 |
| PT09 | Hotel Intent Landing | P2 | hotel classification, source proof, media | 3 |
| PT10 | Supporting Article | P2 | brief, source proof, internal links, media | 3 |
| PT11 | FAQ Page/Block | P2 | FAQ package, source proof, schema dependency | 1 |
| PT12 | Campaign/Offer Landing | P3 | campaign entity, offer rules, expiry, noindex/canonical review | 5 |

— kaynak: `agos/AGSEO_01_PAGE_TYPE_RULES.md#L12-25`; `agos/AGMEDIA_02_PAGE_MEDIA_MATRIX.csv#L2-13` (`minimum_asset_count`)

Evrensel kurallar: bir intent = bir canonical owner; her tip bir AGENTITY entity'sine ve bir medya paketine bağlıdır; indexlenebilir her tip schema bağımlılığı taşır; tur URL'leri korunur; hotel/thin sayfalar sınıflandırılana kadar HOLD; AGSEO-01'de URL/slug/redirect/canonical/sitemap/Rank Math/parent-child değişikliği yoktur. — kaynak: `agos/AGSEO_01_PAGE_TYPE_RULES.md#L27-36`

Sayfa paketi (11 zorunlu alan): entity ID, canonical owner, page type, SEO intent, source brief, media package, FAQ package, schema package, internal link targets, migration classification, proof path. Medya paketi 11 alan (ID, source, rights, human-reviewed, AI flag, alt intent, caption/credit, WebP/AVIF, OG, duplicate risk, proof). Aday schema tipleri: Organization, LocalBusiness, Service, BreadcrumbList, FAQPage, Article, TouristAttraction, Offer (yalnızca policy review sonrası), ImageObject/VideoObject. FAQ yalnızca PT04/PT05/PT08/PT11'de zorunlu. — kaynak: `agos/AGSEO_01_MEDIA_SCHEMA_DEPENDENCIES.md#L8-24,L26-42,L44-58`; `agos/AGSEO_01_PAGE_TYPE_RULES.md#L17-25`

### 2.1 Kayıt içi çelişkiler — sayfa tipi öncelikleri (çözülmedi, §4'te karar yok)

| Konu | Kayıt A | Kayıt B | Durum |
|---|---|---|---|
| (a) PT06 Hotel Transfer Landing önceliği | **P1** — `agos/AGSEO_01_PAGE_TYPE_RULES.md#L19`; `agos/AGSEO_01_SILO_HIERARCHY.csv#L7` (S06) | **P2** "hotel transfer pages pending proof" — `agos/AGSEO_02_CANONICAL_OWNER_RULES.md#L69-72`; tek PT06 örnek satırı P2 — `agos/AGSEO_02_URL_DEPENDENCY_MATRIX.csv#L14` | Aynı tarihli iki belge; hepsi "pending proof" olduğundan AGSEO-02 fiilen tüm tipi P2'ye indirir. **Owner kararı gerekir.** |
| (b) PT05 Transfer Route Landing önceliği | Blanket **P0** — `agos/AGSEO_01_PAGE_TYPE_RULES.md#L18` | "highest-value" rotalar P0, "secondary transfer routes" **P1** — `agos/AGSEO_02_CANONICAL_OWNER_RULES.md#L56-64`; `agos/AGSEO_01_MASTER_SILO_MAP.md#L87` | PT05 kayıtta P0/P1 bölünmesidir; hangi rotanın P0 olduğu URL bazında yazılı değildir. |
| (c) "Flat tour URLs are preserved" | Düz tur slug'ı varsayımı — `agos/AGSEO_01_PAGE_TYPE_RULES.md#L34`; `agos/AGSEO_02_URL_DEPENDENCY_MATRIX.csv#L13` (`/tours/rafting/`, `live_status=live_reference_only`) | Envanterde tur sayfaları **iç içe** `/tours/<bölge>/<aktivite>/` (11 iç içe / 1 düz); düz kök-slug olanlar **otel-transfer** post'larıdır | Niyet (tur URL'si yeniden yapılandırılmaz — `agos/AGOS_MASTER_ROADMAP_2026_V2.md#L363-365`) çelişmiyor; "flat" kelimesi "existing" okunmalı. |
| (d) "Para sayfası" tanımı | AGSEO: transfer money pages = havalimanı hub + rota + private transfer + intent'i ayrık otel varyantı, "P0/P1 after classification" — `agos/AGSEO_01_MASTER_SILO_MAP.md#L83-96`; `agos/AGSEO_02_CANONICAL_OWNER_RULES.md#L81-91` | Booking katmanı: URL regex `transfer\|shuttle\|private\|vip\|airport\|havaalan\|havalimani\|flughafen\|chauffeur` → 587; ayrıca 51 tur sayfası MUST_HAVE_BOOKING — `AG/reports/ALANYAGROUP_SITE_FINAL_REMEDIATION_V1/BOOKING_ENGINE_MATRIX.md#L52-59`; `agos/AG_BOOKING_PRIORITY_SUMMARY.md#L47-55` | İki farklı eksen (SEO canonical vs. booking kapsamı). Spec ikisini ayrı sütun olarak taşır; "para sayfası = yalnızca PT04/05/06" okuması tur sayfalarını düşürür. |

Not: PT_RULES tablosunun kendi "Required Dependencies" sütunu PT03/PT04/PT07/PT11 için medya, altı tip için schema yazmaz; evrensel kurallar (L31-32) ve `agos/AGMEDIA_02_PAGE_MEDIA_MATRIX.csv#L2-13` bunları 12/12 için zorunlu kılar. Spec evrensel kuralı esas alır.

## 3. Sınıflandırma durumu — kayıtta ne var, ne yok

### 3.1 Var olan: AGSEO-02 URL bağımlılık matrisi — 16 satır, desen/şablon düzeyi

| Ölçü | Değer |
|---|---:|
| Satır | 16 (`MATRIX_ROW_COUNT=16`); 16/16 `manual_review_required=yes`, `owner_go_required=yes` |
| `action_candidate` | rebuild_from_intent 7 · preserve_intent_only 3 · keep_existing_local 2 · manual_review 1 · merge_candidate 1 · redirect_candidate 1 · noindex_candidate 1 · exclude_legacy 0 |
| `priority` | P0 5 · P1 7 · P2 3 · P3 1 |
| Kapsanan PT | PT01, 03, 04, 05, 06, 07, 08, 10, 12 (PT02, PT09, PT11 yok) |
| `live_url` envanterde **yok** | **9 / 16** — örn. `/tours/rafting/` (envanterde `/tours/alanya/rafting/`), `/alanya/` (envanterde `/destinations/alanya/`), `/hotels/example-hotel-transfer/` (placeholder), `/blog/...`, `/tag/...` (envanterde `/blog/` ve `/tag/` altında 0 satır) |

— kaynak: `agos/AGSEO_02_URL_DEPENDENCY_MATRIX.csv#L2-17` (`action_candidate`, `priority`, `page_type`, `live_url` sütunları; python3 ile sayıldı ve inventory `url` ile kesiştirildi); `agos/AGSEO_02_CANONICAL_OWNER_MATRIX.md#L37,L41-47`

AGSEO-02 kendi beyanıyla URL düzeyinde sınıflandırma değil, **planlama/desen matrisidir**; tüm satırlar `live_status=live_reference_only`. — kaynak: `agos/AGSEO_02_CANONICAL_OWNER_MATRIX.md#L27-37`; `agos/AGSEO_02_NO_APPLY_CONFIRMATION.md#L28`

### 3.2 Var olan: booking-öncelik sınıflandırması — 699 formsuz satır (SEL-124)

| `priority_group` | Satır | post / page |
|---|---:|---|
| MUST_HAVE_BOOKING | 466 | 442 / 24 |
| SHOULD_HAVE_BOOKING | 124 | 105 / 19 |
| NO_BOOKING_NEEDED | 92 | 82 / 10 |
| EXCLUDE_SYSTEM | 17 | 0 / 17 |

| `proposed_batch` (SEL-124 şeması) | Satır | post / page | Kayıt destekli alt kırılım |
|---|---:|---|---|
| Batch 1 — Top revenue pages only | 94 | 88 / 6 | — |
| Batch 2 — Hotel transfer pages | 321 | 320 / 1 | `classification_reason`: 295 "Hotel/resort/property transfer intent" + 26 "Property-style transfer page" |
| Batch 3 — Tours & activities | 51 | 34 / 17 | — |
| Batch 4 — Destination guides | 16 | 12 / 4 | — |
| Batch 5 — Remaining optional pages | 108 | 93 / 15 | — |

— kaynak: `agos/AG_BOOKING_PRIORITY_MATRIX.csv` (`priority_group`, `proposed_batch`, `page_type`, `classification_reason`; python3 Counter, bu oturumda birebir yeniden üretildi); `agos/AG_BOOKING_PRIORITY_SUMMARY.md#L40-57`; `agos/AG_BOOKING_BATCHES.md#L15-19,L78-82,L141-145,L203-207,L230-234`

⚠ **Etiket çakışması:** aynı depodaki SEL-123 planı "Batch 1–4" etiketlerini farklı anlamla kullanır (Batch 1 = korunan `ag_home` 13; Batch 2 = `c6` migrasyon 2; Batch 3 = `agsc-v6` standardizasyon 192; Batch 4 = formsuz inceleme kuyruğu 699). Hiçbir kayıt iki şemayı uzlaştırmaz; bu spec **yalnızca SEL-124 şemasını** kullanır ve her batch atfını "SEL-124" ile niteler. — kaynak: `agos/AG_BOOKING_COVERAGE_BATCH_PLAN.md#L30-32,L52-54,L63-65,L92-94`

Bu matris **PT kodu taşımaz**; sütunlarında `page_type` yalnızca WP post tipidir. Registry projeksiyonu 906 satır üzerinde beşinci bir grup (`COVERED_REVIEW` 207) ekler; "4 grup" yalnızca 699 formsuz satır için doğrudur. — kaynak: `agos/AG_ADMIN_CMS_04_PROJECTION_VALIDATION.json#L118`; `agos/TRANSFER_01_DATA_MODEL.md#L66`

### 3.3 Olmayan: 906 satırlık PT + Gate 3 eylem sınıflandırması

- Gate 3 PASS koşulu: **her** canlı page/post/attachment için rebuild / preserve intent / merge / noindex candidate / redirect candidate / exclude / manual review sınıfı; LOCAL-CONTENT-05'ten insan incelemesiz otomatik karar yok; P0 para sayfaları belirlenmiş. Durum: **HOLD**. — kaynak: `agos/AGOS_DECISION_GATES.md#L48-56`
- Gate 3 eylem sınıfları ile PT01–PT12 **iki ayrı eksendir**; ikisi de 906 satır için mevcut değildir.
- Kayıt, Gate 3 girdisi olarak bir "LOCAL-CONTENT-05 classification attempt"in **var olduğunu** söyler ("exists but needs human review"; R20 "attempt, not authority"; korpus 269 page + 634 post ≈ envanterin canlı kümesi), ancak dosya **hiçbir depoda yoktur**. — kaynak: `agos/AGOS_DECISION_GATES.md#L32`; `agos/AGOS_RISK_REGISTER_V2.md#L27` (R20), `#L8` (R1); `agos/AGSEO_02_CANONICAL_OWNER_MATRIX.md#L25`
- **Spec kararı:** İlk çıktı, 906 satırlık envanter üzerinde hem PT01–PT12 hem Gate 3 eylem sınıfı taşıyan bir matristir; bu, depoda bulunmayan LOCAL-CONTENT-05'in **ikamesidir**, R20 uyarınca insan incelemesi gerektirir ve mevcut 699 satırlık booking-öncelik sınıflandırmasını girdi olarak alır. Çıktı **private** depoya yazılır (URL bazlı).
- Not: `agos/indexes/proof/PROOF-INDEX.md#L150` `AGSEO_02_PROOF.md`'yi listeler; dosya diskte yoktur.

## 4. Yapısal bulgular (envanterden deterministik olarak yeniden üretilenler)

### 4.1 Transfer kümeleri — AYT ↔ GZP birebir ayna

| Ölçü | `/antalya-transfer/` | `/gazipasa-transfer/` |
|---|---:|---:|
| Toplam URL | 97 | 98 |
| Derinlik 1 / 2 / 3 / 4 | 1 / 8 / 22 / 66 | **2** / 8 / 22 / 66 |
| Ortak alt-yol kuyruğu (derinlik ≥2) | 96 / 96 | 96 / 96 |
| Derinlik-4 otel slug'ı her ikisinde de var | 66 / 66 | 66 / 66 |
| Derinlik-2 ilçe listesi | alanya, demre, finike, kas, kemer, kumluca, manavgat, serik | aynı |
| Engine (derinlik ≥2, 192 URL) | `agsc-v6` 188 + `ag_home` 4 (Antalya kümesinde) · formsuz **0** | |

— kaynak: `agos/AG_BOOKING_COVERAGE_INVENTORY.csv` (`url`, `booking_engine`; python3 yol derinliği + set kesişimi); kayıt notu "same hotels repeated across Antalya + Gazipaşa" ve "Gazipaşa cluster needs separate GZP km data" — `platform/AI_COMMAND_CENTER/MASTER_PROJECT_STATUS.md#L20-22,L59`; R7 — `agos/AGOS_RISK_REGISTER_V2.md#L14`

Çıkarım: 96 ayna sayfa Gate 4'ün "duplicate/cannibal pairs identified" koşulunun (`agos/AGOS_DECISION_GATES.md#L59-66`) doğrudan girdisidir. Gazipaşa kümesinin batı ilçeleri (Kaş, Demre, Finike, Kumluca, Kemer) için GZP km/fiyat verisi kayıtta yoktur; hangilerinin gerçek rota niyeti taşıdığı karar bekler.

### 4.2 Tek permalink, iki kayıt

`/gazipasa-transfer/` envanterde hem `page` (satır 126) hem `post` (satır 777) olarak vardır; ikisi de `agsc-v6`, `dfc=1`. Bu, PT04 Gazipaşa hub'ı için "one intent equals one canonical owner" kuralını ihlal eder ve envanterdeki tek çift URL'dir; hiçbir belge bunu not etmemiştir. — kaynak: inventory CSV (`url`, `page_post_id`, `page_type`); `agos/AGSEO_01_PAGE_TYPE_RULES.md#L29`

### 4.3 Düz (derinlik-1) otel-transfer sayfaları

| Ölçü | Değer | Kaynak |
|---|---:|---|
| Slug'ı `(hotel\|otel)-transfer/` ile biten düz URL | **141** (140 post + 1 page), 141/141 `engine=none` | inventory CSV `url` regex |
| SEL-124 "Batch 2 — Hotel transfer pages" (düz, formsuz, otel/resort/property niyeti) | **321** — bunların 180'i `-hotel-transfer/` ile bitmez (resort/property/marka slug'ları) | `agos/AG_BOOKING_PRIORITY_MATRIX.csv` (`proposed_batch`); `agos/AG_BOOKING_BATCHES.md#L78-82` |
| Küme derinlik-4 otel slug'larıyla ≥2 isim token'ı paylaşan düz sayfa | 16–18 (token kuralına bağlı; tek sayı verilmez) | inventory CSV, kaba kanibal ölçüsü |

Kayıt bu 141/321 sayfa için **iki farklı disiplin** taşır ve uzlaştırmaz:

| Katman | Disiplin | Kaynak |
|---|---|---|
| Booking kapsamı (SEL-124) | MUST_HAVE_BOOKING, `priority_score` 92, "Candidate for later exact-URL coverage fill after OWNER GO" — yalnızca OWNER GO kapısı | `agos/AG_BOOKING_PRIORITY_MATRIX.csv` (`owner_review_action`); `agos/AG_BOOKING_COVERAGE_BATCH_PLAN.md#L99` |
| SEO canonical (AGSEO/AGHOTEL) | "Hotel/thin pages remain HOLD until classified"; her otel-transfer niyeti altı sınıftan birine sokulur (canonical landing / route variant under parent / supporting mention / noindex / redirect / manual review); AGHOTEL canonical review olmadan redirect yasak, AGHOTEL'in kendi seti dört başlıklıdır (canonical / merge / noindex candidate / supporting route intent) | `agos/AGSEO_01_PAGE_TYPE_RULES.md#L35`; `agos/AGSEO_01_MASTER_SILO_MAP.md#L98-109`; `agos/AGSEO_02_CANONICAL_OWNER_RULES.md#L93-95`; `agos/AGOS_MASTER_ROADMAP_2026_V2.md#L367-378` |

Spec kuralı: düz otel-transfer sayfasına **form eklemek** (booking katmanı) ile onu **rebuild/redirect etmek** (SEO katmanı) ayrı kapılardır; ikincisi altı-sınıf ayrımı ve AGHOTEL canonical review olmadan yapılamaz. Hiçbir kayıt düz post'ları PT06'ya açıkça eşlemez; bu eşleme çıkarımdır.

### 4.4 Engine × yapı (para sayfaları)

| Ölçü | Değer |
|---|---:|
| Para sayfası (kayıt regex'i, URL) | 587 → `none` **384 (%65)** · `agsc-v6` 191 · `ag_home` 10 · `c6` 2 |
| Formsuz 384'ün yapısı | **hepsi derinlik-1** (377 post + 7 page); hiyerarşik küme içinde formsuz = **0** |
| Para seti dışındaki tek `agsc-v6` URL | `/booking-form/` (yardımcı sayfa) |
| `ag_home` 13: para dışı 3 | marka ana sayfası `/`, bir tur landing'i, bir restoran rehberi post'u |
| `c6` 2 | `/alanya-transfer/`, `/antalya-alanya-transfer/` |

— kaynak: inventory CSV (`booking_engine` × `url`; python3, bu oturumda yeniden üretildi); `AG/reports/ALANYAGROUP_SITE_FINAL_REMEDIATION_V1/BOOKING_ENGINE_MATRIX.md#L25-34,L52-59,L92,L98-99`

Kayıt-içi tutarsızlık: 384'ün 4'ü (DE/TR "hoteltransfer" / "havalimanindan…transferler" slug'ları) SEL-124'te NO_BOOKING_NEEDED'dır, başlıkları otel/havalimanı transferidir (regex kaçağı); ayrıca 3 yüzde-kodlu RU/AR VIP-transfer post'u para regex'ine görünmez. — kaynak: `agos/AG_BOOKING_PRIORITY_MATRIX.csv` (`priority_group`, `title`)

### 4.5 Sayfa tipi büyüklükleri — neyin yeniden üretildiği, neyin tahmin olduğu

| Kova | Sayı | Statü |
|---|---:|---|
| PT01 kök `/` | 1 (+2 "ana sayfa adayı" page — kayıt bunları Batch 5 SHOULD_HAVE_BOOKING sayar, çift-anasayfa demez) | deterministik |
| PT02 `/destinations/` derinlik 1 · PT03 derinlik 2 | 1 · 1 | deterministik |
| PT04 hub (derinlik-1 `/antalya-transfer/`, `/gazipasa-transfer/`) | 3 satır (2 URL; §4.2) | deterministik |
| PT05 küme rota (derinlik 2–3) | **60** (56 `agsc-v6` + 4 `ag_home`) | deterministik |
| PT06 küme otel (derinlik 4) | **132** (66 + 66; 133 değil), 132/132 `agsc-v6` | deterministik |
| PT07 `/tours/` derinlik ≤2 · derinlik-3 tur sayfası | 2 · 12 | deterministik |
| PT11 `/faq/` | 1 | deterministik |
| Yüzde-kodlu RU/AR URL | 64 (46 RU post + 17 AR post + 1 RU yardımcı page), 64/64 `engine=none` | deterministik |
| Düz `hotel/otel + transfer` post | 205–207 (geniş konaklama regex'i 262; SEL-124 Batch 2 = 321) — **270 türetilemez** | kurala bağlı |
| "PT03-guide 20, PT04 18, PT05F 112, PT08 47, PT09 8, PT10 74, sistem 18, off-vertical 127, PT06 toplam 403" | — | **yeniden üretilemedi**; hiçbir depoda üreten betik yok; "PT05F" tanımlı bir tip değil. Yalnızca büyüklük sırası olarak, insan incelemesi şartıyla kullanılabilir |

— kaynak: `agos/AG_BOOKING_COVERAGE_INVENTORY.csv` (`url`, `page_type`; python3 yol/derinlik kuralı); `agos/AGSEO_01_PAGE_TYPE_RULES.md#L14-25` (PT01–PT12 dışında kod yok); `agos/AGSEO_01_MASTER_SILO_MAP.md#L100-110` (otel sayfaları tek tek sınıflandırılır — toplu PT06 kovası kayıt onaylı üyelik değildir)

## 5. Dil ve çok dillilik

### 5.1 Ölçülebilenler

| Ölçü | Değer | Kaynak |
|---|---:|---|
| Envanterde dil/WPML sütunu | **yok** | `agos/AG_BOOKING_COVERAGE_INVENTORY.csv` sütun listesi |
| "EN 439" | yalnızca tek satırda; hiçbir sütundan/sezgiselden yeniden üretilemez | `platform/AI_COMMAND_CENTER/MASTER_PROJECT_STATUS.md#L19` |
| `language_scope_note` (699 formsuz) | EN_OR_ASCII_OR_UNKNOWN 521 · NON_EN_OR_ENCODED_REVIEW_WPML_SCOPE 178 — **dil alanı değil**, yüzde-kodlu/ASCII-dışı sezgiseli (54'ü tam ASCII kelime-eşlemesi, ≥5'i yalnızca tire/kesme işaretiyle işaretlenmiş İngilizce başlık) | `agos/AG_BOOKING_PRIORITY_SUMMARY.md#L59-66`; `agos/AG_ADMIN_CMS_02_IMPORT_MAPPING.md#L106-109`; `agos/ag-platform-v2-admin-cms/includes/class-registry-projector.php#L147-150` |
| Kiril slug (yüzde-kodlu) · Arapça slug | 47 · 17 — 64/64 `engine=none` | inventory CSV `url` (`%d0\|%d1`, `%d8\|%d9`) |
| Transfer-niyetli RU · AR (decoded url+title regex) | **20** · 9 (transliterasyon dahil 10; 10.'su SEL-124'te NO_BOOKING_NEEDED) — hepsi formsuz; RU'nun 4'ü yalnızca site-adı başlık ekinden eşleşir | inventory CSV; `agos/AG_BOOKING_PRIORITY_MATRIX.csv` (`classification_reason`) |
| İskandinav (NO/DA/SV) para sayfası | 12 (slug taraması; yalnızca 6'sı `flyplass/pendelbuss`, 6'sı `overføring` kökü) | `AG/reports/ALANYAGROUP_SITE_FINAL_REMEDIATION_V1/BOOKING_ENGINE_MATRIX.md#L124-131` |
| Slug/başlık regex'iyle EN-dışı toplam | 125 (123 post + 2 page; RU 47 · TR 31 · DE 18 · AR 17 · SCAND 12), 125/125 `engine=none`; matris ile birleşim ~178–181 | inventory CSV url+title regex (bu oturumda yeniden üretildi); `page_post_id` join |
| SEL-124 batch × NON_EN | Batch 1: **58 / 94** (EN 36) · Batch 2: 39 / 321 · Batch 3: 5 / 51 · Batch 4: 1 / 16 · Batch 5: 35 / 108 | `agos/AG_BOOKING_PRIORITY_MATRIX.csv` (`proposed_batch` × `language_scope_note`; python3 Counter) |

Sonuç: en yüksek gelir batch'inin (SEL-124 Batch 1) **%62'si** "yalnızca İngilizce düzenleniyor" kapsamının dışındadır; RU katmanı önceki raporun "RU (latin slug) 0" satırının aksine **boş değildir** (20) — o satır bildirilen bir latin-slug kapsam sınırıdır, "RU yok" bulgusu değil; aynı satır `AG/handoff/HERMES_TASK_PACKET_01.md#L176` ve `AG/reports/ALANYAGROUP_SITE_FINAL_REMEDIATION_V1/TASK_STATUS.md#L82`'de tekrarlanır. Kesin dil dağılımı yalnızca WP REST / WPML dil alanıyla sabitlenebilir; hiçbir fixture bunu içermez.

### 5.2 Çok dilli mimari — kayıt-kayıt çelişkisi (çözülmedi; §4'te kilitli karar yok)

| Kaynak (tarih) | Beyan |
|---|---|
| `platform/AI_COMMAND_CENTER/MASTER_PROJECT_STATUS.md#L19` (2026-06-24) | "EN 439 / TR / DE / RU / AR", "Only English is being edited", TR/DE/RU/AR **WPML'e ayrılmış** |
| `agos/AGOS_MASTER_ROADMAP_2026_V2.md#L300-311` (2026-06-29, SEL-191) | **Alt alan adları, WPML birincil mimari değil**; `www` EN master, `de.`, `ru.`, `pl.` (Lehçe — envanterde Lehçe sayfa yok), `tr.` ve `ar.` "if needed"; "no WPML rollout"; her dil için ayrı sitemap/GSC/canonical/hreflang |
| `agos/AGOS_RISK_REGISTER_V2.md#L16` (R9); `agos/AGOS_ENTITY_FIRST_ARCHITECTURE_ADDENDUM.md#L265`; `agos/AGOS_LINEAR_SYNC_NOTES.md#L43,L50` | SEL-191 alt alan kararı tekrarlanır |
| `agos/AG_ADMIN_CMS_02_IMPORT_MAPPING.md#L115`; `agos/ag-platform-v2-admin-cms/includes/class-registry-projector.php#L69` | Veri modeli `wpml_hold` durumunu ve `..._WPML_SCOPE` etiketini **WPML varsayımıyla** gömer |
| `AG/CLAUDE.md §7` madde 4 | EN→TR→DE→RU kademesi (TR 2. sırada; yol haritası TR'yi "if needed" sayar); İskandinav 12 + Arapça kapsam kararı Hermes'te |

Hiçbir dil kümesi diğeriyle örtüşmez (WPML 5 dil / alt alan 6 dil + Lehçe / kademe 4 dil / envanter ≥6 dil + İskandinav). Hangi mimarinin geçerli olduğu **owner kararıdır**; hreflang/dil kapsamı işi bu karar olmadan başlayamaz.

## 6. İç bağlantı ve sayfa-tipi zinciri (model; mevcut durum ölçülmemiş)

IL01–IL14: Brand→Destination (IL01); Destination→Region, →Airport hub (IL02-03); Region→Route, →Activity (IL04-05); Airport hub→Route (IL06); Route→Hotel **yalnızca unique ise** (IL07); Hotel→Route/Region geri (IL08); Tour hub↔Activity (IL09-10); Supporting article→tek primary canonical owner (IL11), ikincil entity'ler (IL12); FAQ yalnızca bağlam destekliyorsa (IL13); medya/schema referansı navigasyon değil (IL14). Anchor kuralı: para sayfası linkleri birden çok canonical adaya bölünmez; otel linkleri sınıflandırmasız thin-page zinciri yaratmaz. — kaynak: `agos/AGSEO_01_INTERNAL_LINKING_MODEL.md#L14-27,L29-34`

Mevcut iç bağlantı grafiği (hangi sayfa hangisine link veriyor) hiçbir fixture'da yoktur; kural yalnızca modeldir.

## 7. `AG/CLAUDE.md §4` kilitli kararları ile kayıt çelişkileri (sayfa içeriğini etkileyenler)

| Konu | Owner kararı (§4) | Kayıt | Durum |
|---|---|---|---|
| İçeriğe yazılacak canonical shortcode | `[ag_booking_engine]`, renderer `ag_hlp_render_booking_engine()`; `[ag_home_booking]`, `[ag_transfer_booking_form]`, `[agp_booking_engine]` **alias** | Canonical = `ag_home_booking`; `[ag_transfer_booking_form]` ve `[agp_booking_engine]` "do not use / fictional" — `agos/AG_BOOKING_OWNER_DECISION_01.md#L51-54,L154-161`; `platform/AI_COMMAND_CENTER/MASTER_PROJECT_STATUS.md#L39,L47`; `[ag_booking_engine]` dört depoda 0 geçiş — `AG/reports/ALANYAGROUP_SITE_FINAL_REMEDIATION_V1/FINDINGS_AND_CONFLICTS.md#L46-71` | **§4 geçerli**, alias listesiyle uzlaşır. Ancak canonical shortcode canlıda **kayıtlı olmadan** sayfa içeriğine yazılırsa WordPress ham metin basar ve 906/906 geçen "literal shortcode = 0" kriteri bozulur → içerik ekleme `BASELINE_COMPLETE=YES` + renderer kaydı sonrasına ertelenir |
| Sayfa metnindeki shuttle fiyatı | 1=30 · 2=50 · **3=60 · 4=70** · 4+ kişi başı +10 | 1=€30, 2=€50, **3=€70, 4=€80** — `platform/AI_COMMAND_CENTER/MASTER_PROJECT_STATUS.md#L23` | **§4 geçerli**; sayfa içeriğinde görünen fiyat metni §4'e göre yazılır |
| "from €X" statik fiyatlar (PT05 şablon öğesi) | Fiyat yalnızca server-side authority; Alanya dışı taban 50 mi 40 mı Hermes doğrulayacak | Private €40 taban; from: Belek €43, Kemer €48, Side €52, Manavgat €55, Alanya €77 — `MASTER_PROJECT_STATUS.md#L23`; şablonda "from €X" öğesi — `#L56` | Statik "from" fiyatları dinamik kaynağa bağlanana ve taban teyit edilene kadar **yayımlanmaz** |
| TÜRSAB numarası (footer/güven bloğu) | 2165 (iki kez beyan); "ikisi de bugün yayımlanmayacak" | 12892 — `MASTER_PROJECT_STATUS.md#L18`; AGOS'ta TÜRSAB 0 geçiş — `AG/reports/ALANYAGROUP_SITE_FINAL_REMEDIATION_V1/FINDINGS_AND_CONFLICTS.md#L75-83` | İçerik düzeltmesi TÜRSAB alanını Hermes doğrulaması gelene kadar **placeholder** bırakır |
| AYT↔GZP shuttle | Her iki yönde **yasak**, server-side | Kayıt bunu sayfa-içerik düzeyinde ele almaz | §4 geçerli; PT04/PT05 sayfa metni bu rotayı shuttle olarak sunamaz (private/VIP serbest) |

## 8. Her içerik/form değişikliği için zorunlu ölçüm ve no-apply kuralları

- **DOM kuralı:** render edilmiş DOM form container'ları sayılır (asla `content.raw` shortcode metni); her URL için önce **ve** sonra; hedef durum her para sayfasında **tam 1** form. Kapsam doldurma için önce-DOM = 0 form, migrasyon için tam 1 eski form; sonra-DOM = HTTP 200 + tam 1 hedef form + literal shortcode yok + çift form yok. `agsc-v6` küme sayfasına içerik shortcode'u eklemek çift form yaratır (bugün 0 olan koşul). — kaynak: `agos/AG_BOOKING_COVERAGE_BATCH_PLAN.md#L194-203`; `AG/reports/ALANYAGROUP_SITE_FINAL_REMEDIATION_V1/BOOKING_ENGINE_MATRIX.md#L137-146`; `platform/AI_COMMAND_CENTER/MASTER_PROJECT_STATUS.md#L105`
- **Aksiyon etiketleri:** 8 etiketin (keep_existing_local, rebuild_from_intent, preserve_intent_only, merge_candidate, noindex_candidate, redirect_candidate, exclude_legacy, manual_review) 8'i `allowed_now=planning_only`, `requires_owner_go_before_apply=yes`. — kaynak: `agos/AGSEO_02_URL_ACTION_CANDIDATES.csv#L2-9`
- **Sprint yasakları (AGSEO-01/02, AGMEDIA-02):** slug, redirect, canonical, sitemap, Rank Math, parent-child, menü, medya upload/delete, toplu post/page/medya/WPML içe aktarımı yok. OWNER GO kaydı: "No live WordPress OWNER GO given". — kaynak: `agos/AGSEO_02_NO_APPLY_CONFIRMATION.md#L10-24`; `agos/AGSEO_01_PAGE_TYPE_RULES.md#L36`; `platform/AI_COMMAND_CENTER/OWNER_GO_LOG.md#L3`; `AG/CLAUDE.md §5`

## Uygulama adımları (sıralı; her adım kapı etiketli)

Kapılar: **[SERBEST]** bugün, yalnızca dokümantasyon · **[JETPACK]** Jetpack reconnect sonrası · **[BASELINE]** Hermes kaynağı + `BASELINE_COMPLETE=YES` · **[OWNER GO]** açık owner kararı · **[ERİŞİM YOK]** bugün hiçbir kanaldan yapılamaz

| # | Adım | Kapı | Çıktı / ölçüt |
|---|---|---|---|
| 0a | 906 satırlık **PT01–PT12 + Gate 3 eylem sınıfı** matrisi üret (LOCAL-CONTENT-05 ikamesi); girdi: inventory + SEL-124 matrisi (`page_post_id` join), §4.5 deterministik kovalar; sezgisel kovalar "insan incelemesi bekliyor" etiketli | [SERBEST] → private depo | Her satırda PT, eylem sınıfı, `review_status`; toplamlar bu dosyaya, URL'ler private'a |
| 0b | Gate 4 girdisi: kanibal/çift listesi — 96 AYT↔GZP ayna çifti, düz otel post ↔ derinlik-4 küme otel sayfası eşleşmeleri (token kuralı belgelenmiş), 2 ana-sayfa adayı, `/gazipasa-transfer/` page/post çakışması, 13 alias satırı | [SERBEST] → private depo | Çift listesi + "henüz redirect edilmeyecek" listesi (`AGOS_DECISION_GATES.md#L59-66`) |
| 0c | Owner kararları paketi: (i) PT06 P1/P2, (ii) hangi PT05 rotaları P0, (iii) çok dilli mimari (WPML / alt alan / kademe) ve İskandinav+AR kapsamı, (iv) off-vertical içeriğin iş kararı, (v) Gazipaşa batı-ilçe rotalarının niyeti | [OWNER GO] | Kararlar `OWNER_GO_LOG.md`'ye; bu bölüm §2.1 / §5.2 satırları kapatılır |
| 0d | Canlı doğrulama: 906 satırın yeniden taranması (HTTP, DOM form sayısı, WPML dil alanı, Rank Math meta, index/noindex, hreflang, iç link grafiği) | [ERİŞİM YOK] → [JETPACK] | Anlık görüntü 2026-06-24 yerine güncel fixture; 0a/0b'deki sezgisel kovalar kapanır |
| 1 | **P0 — PT01 / PT04 / PT05 (yüksek değerli rota):** PT01 `/` korunur (`ag_home`); PT04 hub'larda `/gazipasa-transfer/` çiftliği çözülür (merge/redirect adayı, Gate 4); `c6` 2 sayfa migrasyon; PT05 küme rota 60 → Kemer standardı şablonuna rebuild (Belek/Side/Manavgat/Alanya sırası kayıtta bekliyor — `MASTER_PROJECT_STATUS.md#L24`); şablon öğesi "from €X" §7 kuralına tabi | [BASELINE] + [OWNER GO] | Her sayfa: sayfa paketi 11 alan + medya ≥5 + FAQ + schema paketi (apply yok); DOM önce/sonra = tam 1 form |
| 2 | **P0/P1 — kapsam doldurma, SEL-124 Batch 1 (94):** 58 NON_EN satırı dil kararına (0c-iii) kadar ayrılır; 36 EN satırı canonical shortcode ile doldurulur — yalnızca renderer canlıda kayıtlı ise | [BASELINE] + [OWNER GO] | Önce-DOM 0 → sonra-DOM 1; literal shortcode 0/906 korunur |
| 3 | **P1 — PT02/PT03 hub + bölge rehberleri (SEL-124 Batch 4: 16), PT07/PT08 tur (Batch 3: 51):** preserve_intent_only / rebuild_from_intent; tur URL'leri değişmez; PT08 medya ≥7 | [OWNER GO] | Sayfa paketi tam; tur sayfaları enquiry/booking proof ile |
| 4 | **P1/P2 — PT06 küme otel (132, `agsc-v6`):** engine standardizasyonu ayrı iş paketidir (booking bölümü); içerik tarafında route proof + unique demand evidence olmayan derinlik-4 sayfa "route variant under parent" adayı olarak işaretlenir | [OWNER GO] (öncelik 0c-i'ye bağlı) | Altı-sınıf ayrımı tamamlanmadan redirect yok |
| 5 | **P1/P2 — düz otel-transfer sayfaları (SEL-124 Batch 2: 321):** iki ayrı kapı — (a) form kapsam doldurma [OWNER GO]; (b) rebuild/merge/redirect yalnızca AGHOTEL canonical review + altı-sınıf ayrımı sonrası [OWNER GO] | [BASELINE] (a) · [OWNER GO] (a, b) | Toplu otel import/redirect yok (R3/R7) |
| 6 | **P2 — PT10 destek makaleleri, PT09, PT11 FAQ:** her makale tek primary canonical owner'a bağlanır (IL11); rekabet edenler merge/noindex adayı; FAQ blokları paket olarak hazırlanır, schema apply yok | [SERBEST] (brief/paket) · [OWNER GO] (uygulama) | Paket dosyaları private depoda |
| 7 | **P3 — sistem/yardımcı (EXCLUDE_SYSTEM 17 + `/booking-form/` + marka sayfaları), off-vertical, PT12:** noindex review listesi ("3 internal panel pages" hangileri — kayıtta yok); off-vertical için exclude_legacy / noindex / manual_review adayları 0c-iv kararına göre | [OWNER GO] | Hiçbir sistem sayfasına form yok (`AG_BOOKING_BATCHES.md#L354-358`) |
| 8 | Sayfa gövdesi okunabilirlik düzeltmesi (Kadence içerik arka planı) — UX bölümüne ait, tüm sayfa tiplerini etkilediği için burada sıraya konur | [JETPACK] + [OWNER GO] | `MASTER_PROJECT_STATUS.md#L25,L118` |

Her adımda: OWNER GO **URL + ID listesi, eylem sınıfı, shortcode/config, backup/rollback adı** içerir (`agos/AG_BOOKING_COVERAGE_BATCH_PLAN.md#L194-203`); dokümantasyon güncellemesi yetki değildir (`AG/CLAUDE.md §5`).

## Kayıt bunu söylemiyor

1. 906 URL için PT01–PT12 ve Gate 3 eylem sınıfı — yok; AGSEO-02 yalnızca 16 desen satırı (9'u canlı değil). LOCAL-CONTENT-05 adı geçer, dosyası hiçbir depoda yok.
2. Dil alanı — envanterde yok; "EN 439" yeniden üretilemiyor; RU 47 / TR 31 / DE 18 / AR 17 / SCAND 12 slug sezgiselidir; kesin dağılım WP REST/WPML alanı ister.
3. Sayfa başına içerik kalitesi (kelime sayısı, thin-page, LOCAL-CONTENT-04 diff) — depoda yok (`agos/AGSEO_02_CANONICAL_OWNER_MATRIX.md#L24-29`).
4. Rank Math meta durumu URL bazında — yok; yalnızca toplamlar: 18 eksik focus keyword, ~36 uzun / ~20 eksik meta description, "3 internal panel pages to set noindex" (hangi 3 — yazmıyor); focus-keyword temizliği 164 (`#L57`) mi 182 (`#L77`) sayfa mı — iki sayı (`platform/AI_COMMAND_CENTER/MASTER_PROJECT_STATUS.md#L57-58,L77`).
5. Medya ↔ sayfa eşlemesi — canlıda 2636 ek dosya, lokalde 11; hangi asset hangi sayfaya bağlı, hak/kaynak kanıtı yok (`agos/AGOS_MASTER_ROADMAP_2026_V2.md#L50-52`).
6. Schema durumu (mevcut JSON-LD, Rank Math schema ayarları) — hiçbir sayfa için kayıtlı değil; Gate 6 HOLD.
7. 339 page (LOCAL-CONTENT-04) ile 273 page (SEL-117/123) arasındaki 66 sayfa farkı — açıklanmıyor; yayımlanmamış/özel/draft envanteri yok (`agos/AGOS_MASTER_ROADMAP_2026_V2.md#L50`; `agos/AG_BOOKING_COVERAGE_SUMMARY.md#L74-75`).
8. "4 Antalya küme sayfası rebuild edildi" — hangi 4'ü, URL bazında yazmıyor.
9. Gazipaşa kümesi batı ilçeleri için GZP km/fiyat verisi — yok; 96 ayna sayfanın hangilerinin gerçek rota niyeti taşıdığı karar verilmemiş.
10. İç bağlantı grafiği — ölçülmemiş; IL01–IL14 yalnızca model.
11. PT12 Campaign/Offer canlı örneği — tespit edilemedi; expiry/noindex kuralı uygulanacak sayfa listesi yok.
12. Sitemap içeriği, index/noindex durumu, hreflang etiketlerinin mevcut hali — kayıtta yok; Semrush `site_audit` birimi 0, doğrudan HTTPS 403 (`ACCESS_STATUS.md#L10-11`).
13. Off-vertical içerik (yatırım/emlak/sağlık/araç kiralama/restoran) için owner'ın iş kararı — yok; AGSEO silo modeli (S01–S10) bu içeriği kapsamıyor, SEL-124 ise bir kısmını Batch 3/4/5'e koyuyor — uzlaştırılmamış.
14. 2026-06-24 sonrası herhangi bir yeniden tarama — yok; her sayı 80 günlük anlık görüntüdür.

## Düzeltilen / elenen iddialar

Bu bölüm iki-lens doğrulamasından geçmiş bulgulara dayanır: **held 3** (PG-04, PG-08, PG-09), **corrected 11** (PG-01, 02, 03, 05, 06, 07, 10, 11, 12, 13, 14), **refuted 0**. Doğrulamada düzeltilip yukarıda düzeltilmiş haliyle kullanılanlar:

| İddia | Düzeltme |
|---|---|
| "906 farklı URL" | 906 satır / 905 farklı URL yolu; 13 satır alias (PG-01) |
| PT05 blanket P0; PT06 P1; "flat tour URLs" | P0/P1 bölünmesi; P1/P2 çelişkisi açık; tur URL'leri iç içe (PG-02, PG-03) |
| "906 satırlık PT sınıflandırması hiç üretilmedi" | LOCAL-CONTENT-05 attempt'i kayıtta anılır ama depoda yok; Gate 3 eylem sınıfı ≠ PT (PG-05) |
| PT06 = 403 (133 küme + 270 düz), PT04 18, PT05F 112, PT10 74, off-vertical 127 vb. | Yalnızca deterministik kovalar yeniden üretildi (132 küme, 60 rota, 64 kodlu, 141 suffix); kalanı üretilemeyen sezgisel — büyüklük sırası olarak etiketlendi (PG-06, PG-07, PG-11) |
| 64 RU/AR kodlu URL "off-vertical" | 25–29'u transfer/havalimanı niyetli, SEL-124'te MUST/SHOULD_HAVE (PG-06) |
| Düz otel-transfer = 141, kanibal 17 | 141 bir suffix alt kümesidir (SEL-124 düz otel batch'i 321); kanibal ölçüsü 16–18 kurala bağlı; AGHOTEL seti dört başlıklı, altı-sınıf liste silo map'e ait (PG-10) |
| EN-dışı 146 (RU 47 / TR 35 / DE 31 / AR 17 / SCAND 16) | Belirtilen regex 125 verir (TR 31 / DE 18 / SCAND 12); üst sınır ~178–181; `language_scope_note` dil alanı değil (PG-13) |
| Transfer-niyetli AR 10, SCAND 12, EN 549 / TR 24 / DE 13 | AR 9 (+1 transliterasyon, SEL-124'te NO_BOOKING_NEEDED); SCAND 12 slug taraması, transfer regex'iyle 6; EN/TR/DE dağılımı "PG-13 kuralı" hiçbir depoda yok → doğrulanamadı, kullanılmadı (PG-14) |
| "TR/DE/RU/AR WPML'e ayrılmış" | Beş gün sonraki SEL-191 alt-alan kararıyla çelişir; kayıt-kayıt çelişkisi olarak §5.2'ye alındı (PG-12) |

Doğrulama dışı (unverified / reader-only) bulgulardan yalnızca kaynak satırı bu oturumda doğrudan okunarak teyit edilenler kullanıldı: PG-15 (batch × NON_EN sayıları CSV'den birebir yeniden üretildi), PG-16 (§5.2 kaynak satırları), PG-17/19/20 (medya-schema-paket ve IL01–IL14 satırları), PG-21/32 (aksiyon etiketleri, no-apply, OWNER_GO_LOG), PG-24 (join kuralı), PG-25 (339/273 farkı), PG-27/28/29 (§4 çelişki tablosu; kaynak satırları okundu), PG-30 (DOM kuralı), PG-18 (medya asset sayıları CSV'den). PG-22/23/26/31/33 yalnızca yapı olarak alındı; sezgisel sayıları (sistem 18, off-vertical 127, PT dağılımlı sıra) kullanılmadı.

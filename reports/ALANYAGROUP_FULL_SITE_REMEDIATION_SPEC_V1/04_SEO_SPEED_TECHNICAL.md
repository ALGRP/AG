# 04 — SEO, Hız ve Teknik

> **Durum**
> 1. **Kayıt ne kuruyor:** SEO kural seti sabit — "bir intent = bir canonical owner", 9 canonical bağımlılığı (D01–D09), 18 toplam bağımlılık, Rank Math / canonical / redirect / sitemap değişikliği istisnasız **OWNER GO**. **Hız için ise tek bir ölçüm yok:** üç depoda Lighthouse, CWV, TTFB, CrUX verisi bulunmuyor; tek "hız" satırı Tours platformu için yazılmış bir tasarım hedefi. — kaynak: `agos/AGSEO_01_CANONICAL_DEPENDENCIES.md#L8,L30-39`; `agos/AGSEO_01_MEDIA_SCHEMA_DEPENDENCIES.md#L80`; `alanyagroup-platform/AI_COMMAND_CENTER/MASTER_PROJECT_STATUS.md#L34`
> 2. **Bugün ne yapılabilir:** canlı siteye **hiçbir şey** — dört kanal da kapalı (Jetpack `site_disconnected`, Semrush API birimi 0, HTTPS `403 policy denial`, Hermes 0 commit). Hız ölçümü, DOM doğrulaması, Rank Math denetimi bu oturumda **yapılmadı ve yapılamaz**. — kaynak: `AG/reports/ALANYAGROUP_FULL_SITE_REMEDIATION_SPEC_V1/ACCESS_STATUS.md#L7-12,L23`
> 3. **Bu bölüm ne belirliyor:** hız denetiminin *neyi gerektirdiğini* (kanal, sayfa-tipi örneklemi, eşik), kayıttaki teknik yığın / Cloudflare / medya bilgisinin sınırını, SEO değişikliklerinin gate'lerini, dil mimarisindeki üçlü çelişkiyi ve gate etiketli uygulama adımlarını. Canlı siteye dair her ifade **kayıt-türevlidir**.

Kurallar: `AG/CLAUDE.md#§4` owner kararları her eski kayda üstündür; çelişkiler §9'da görünür tabloda, sessizce çözülmez. `owner_go = false`. Bu belge **public** depoda yaşar: yalnızca toplu sayı ve sayfa-tipi yapısı; URL bazlı veri için özel fixture yolu gösterilir, satır kopyalanmaz.

Doğrulama düzeyi: bu bölüm **8 held + 6 corrected** bulguya dayanır (iki lensten geçmiş). Yalnızca tek lensten geçen (reader-only) kayıt notları §11'de ayrı ve etiketli tutulur; footer'da sayılır.

---

## 1. Hız — kayıt ne söylüyor

### 1.1 Ölçüm araması (`agos`, `alanyagroup-platform`, `AG`'nin önceki üç paketi)

| Arama | Eşleşen dosya (kayıt) | Ölçülmüş değer | Ne çıktı |
|---|---:|---:|---|
| `lighthouse\|core web vitals\|cwv\|ttfb\|pagespeed\|lcp\|web vitals` | **8** | **0** | 7 `agos` dosyası — tamamı "Golden Lighthouse Hotel" adlı otel satırı (5 CSV fixture + aynı satırı listeleyen 2 .md tablo; 9 satır). 1 `MASTER_PROJECT_STATUS.md` — 2 tasarım-hedefi satırı (`#L30`, `#L34`). AG'nin önceki üç paketinde 0. |
| genişletilmiş: `gtmetrix\|crux\|speed index\|fcp\|inp\|cls\|page speed\|load time\|webpagetest\|time to first byte` | — | **0** | yalnızca Python `cls` yanlış-pozitifleri (`agos/agcos-core` testleri) |

— kaynak: `alanyagroup-platform/AI_COMMAND_CENTER/MASTER_PROJECT_STATUS.md#L30,L34`; grep (bu oturum; `AG/reports/ALANYAGROUP_FULL_SITE_REMEDIATION_SPEC_V1/tools/reproduce_counts.py`). Not: aynı grep bugün 12 dosya döndürür; fazladan 4'ü bu oturumun kendi (git'te izlenmeyen) çıktılarıdır ve kayıt sayılmaz — bkz. §13 SEO-02.

**Sonuç:** Canlı site için ölçülmüş hiçbir hız verisi (Lighthouse skoru, CWV, TTFB, CrUX, GTmetrix, WebPageTest) kayıtta yoktur. "Sitenin hızı" sorusunun kayıttan cevabı **yok**; yalnızca ölçümle cevaplanabilir.

### 1.2 Kayıttaki tek performans referansı — tasarım hedefi, ölçüm değil

| Satır | İfade | Bağlam |
|---|---|---|
| `#L30` | "lightweight vanilla-JS/Alpine booking widget (avoid heavy booking plugins for speed/LCP)" | §2 **Tours Platform** — "no live tours booking system shipped yet" (`#L35`) |
| `#L34` | "AVIF/WebP, deferred audio/map JS; **target LCP < 2.5s on 4G**" | aynı bölüm, ileriye dönük tasarım hedefi |

— kaynak: `alanyagroup-platform/AI_COMMAND_CENTER/MASTER_PROJECT_STATUS.md#L30,L34,L35`. Bu iki satır **henüz yayınlanmamış** bir sistem için yazılmıştır; mevcut canlı WordPress sitesinin hızı hakkında hiçbir şey söylemez.

### 1.3 Bir hız denetimi neyi gerektirir (bu bölümün spesifikasyonu)

**Kanal** (bugün üçü de kapalı — `ACCESS_STATUS.md#L10-11,L17-18`):

| Kanal | Ne verir | Kim açar | Gate |
|---|---|---|---|
| Semrush `site_audit` | crawl bazlı teknik sorunlar: broken/redirect zinciri, hreflang, canonical, duplicate title/meta, büyük görsel, JS/CSS boyutu | Owner (API birimi) | [ERİŞİM YOK] |
| PageSpeed Insights API (Lighthouse lab) + CrUX (alan p75) | LCP / INP / CLS / TTFB, mobil öncelikli | Owner (ağ izin listesi) | [ERİŞİM YOK] |
| Tarayıcı içi Lighthouse (owner'ın Mac'i) | aynı lab metrikleri, kayıt ekran görüntüsü olarak | Hermes / Owner | [BASELINE] değil, erişimi olan herhangi bir ajan |

**Örneklem — sayfa TİPİ bazında, URL listesi değil** (min. 8 URL, her biri 3 tekrar, mobil + masaüstü):

| # | Sayfa tipi | Kayıttaki karşılığı |
|---|---|---|
| 1 | Ana sayfa (Brand Home, PT01) | `ag_home` canonical form |
| 2 | AYT hub `/antalya-transfer/` | küme ebeveyni |
| 3 | GZP hub `/gazipasa-transfer/` | küme ebeveyni |
| 4 | 1 rota landing (agsc-v6, küme altı) | şablon-enjekte form |
| 5 | 1 düz otel transfer sayfası (formsuz) | `MUST_HAVE_BOOKING` grubu |
| 6 | 1 tur/aktivite sayfası (formsuz) | `MUST_HAVE_BOOKING` grubu |
| 7 | 1 DE sayfa | `NON_EN_OR_ENCODED_REVIEW_WPML_SCOPE` |
| 8 | 1 post (destek makalesi) | 633 post kümesi |

— kaynak: sayfa tipleri `agos/AGSEO_01_PAGE_TYPE_RULES.md#L14-25`; engine dağılımı `agos/AG_BOOKING_COVERAGE_INVENTORY.csv` sütun `booking_engine`; öncelik grubu `agos/AG_BOOKING_PRIORITY_MATRIX.csv` sütun `priority_group`. Tekil URL seçimi private fixture'dan yapılır; bu belgeye yazılmaz.

**Geçiş eşiği önerisi** — yalnızca ilk satır kayıttan gelir; diğerleri Google "good" eşikleridir ve **owner onayı gerektirir**:

| Metrik | Eşik | Kaynak |
|---|---|---|
| p75 mobil LCP | ≤ 2.5 s | `MASTER_PROJECT_STATUS.md#L34` (tek kayıtlı hedef) |
| INP | ≤ 200 ms | kayıtta yok — Google "good"; owner onayı |
| CLS | ≤ 0.1 | kayıtta yok — Google "good"; owner onayı |
| TTFB | ≤ 800 ms | kayıtta yok — Google "good"; owner onayı |
| Lighthouse Performance skoru | **belirlenmedi** | kayıtta hiçbir eşik yok — owner belirlemeli |

Hiçbir AGOS gate'inde sayısal performans eşiği tanımlı değildir; AGQA gate'i yalnızca "render checks pass on mobile widths and desktop" der. — kaynak: `agos/AGOS_MASTER_ROADMAP_2026_V2.md#L106`; `agos/AGOS_NEXT_30_SPRINTS.md#L343-351` (Sprint 29 planlı).

### 1.4 Staging, canlı sitenin yerine ölçülemez — kayıt ve çıkarım ayrı

Kayıt: AGDEPLOY `STAGING_INFRA_EXISTS`; Hetzner + Docker; Caddy `app.alanyagroup.com` rotasını `agos-wordpress`'e yönlendirir; bir WordPress staging ortamı vardır; Sprint 22 booking paketi yalnızca staging'e yüklendi (PHP lint PASS). — kaynak: `agos/AGOS_MODULE_STATUS_MATRIX.csv` satır `AGDEPLOY`; `agos/AGOS_MASTER_ROADMAP_2026_V2.md#L44,L275-294`.

Kayıt-türevi çıkarım: AGOS "not a direct clone of the old WordPress site"; canlı DB'nin staging'e toplu içe aktarımı yasak; "broader staging sync" henüz yapılmadı — dolayısıyla staging canlı içeriğin kopyası değildir. — kaynak: `agos/AGOS_MASTER_ROADMAP_2026_V2.md#L10,L25,L434`; `agos/AGOS_RISK_REGISTER_V2.md#L9` (R2).

**Bu oturumun çıkarımı (kayıtta yok):** içerik kopyası olmayan bir staging, canlı sitenin hız/SEO ölçümü yerine geçemez.

**Kayıt-içi çelişki (çözülmedi, görünür bırakıldı):**

| Kaynak | İfade | Durum |
|---|---|---|
| `AG/reports/ALANYAGROUP_FINAL_COMPLETION_V1/BLOCKERS_AND_CONFLICTS.md#L22` (B5); `AG/reports/ALANYAGROUP_SITE_FINAL_REMEDIATION_V1/FINDINGS_AND_CONFLICTS.md#L41` (B3′) | "No staging environment is recorded to exist" | eski |
| `agos/AGOS_MODULE_STATUS_MATRIX.csv` satır `AGDEPLOY`; roadmap `#L275-294` | staging altyapısı var, Sprint 22 keşfi, Caddy rotası | **daha geç ve daha özgül — üstün sayılır; ancak B5/B3′ düzeltilmedi** |

---

## 2. Teknik yığın ve teknik borç — kayıt ne kadarını biliyor

### 2.1 Booking-engine borcu (906 URL, hepsi HTTP 200)

| Engine | URL | page / post | Konum |
|---|---:|---|---|
| `none` | **699** | — | tüm site |
| `agsc-v6` (şablon-enjekte) | 192 | 191 / 1 | 190'ı `/antalya-transfer/` (92) + `/gazipasa-transfer/` (98) altında; kalan 2'si bir chauffeur-service sayfası ve bir booking-form sayfası; 132'si 4 seviye derinlikte |
| `ag_home` (canonical) | 13 | — | 5'i iki kümenin altında |
| `c6` (legacy) | 2 | — | "neither is broken today" |

İki küme altındaki 195 URL'nin 190'ı `agsc-v6`, 5'i `ag_home`. — kaynak: `agos/AG_BOOKING_COVERAGE_INVENTORY.csv` sütunlar `booking_engine`,`page_type`,`url` (python3 sayımı, `tools/reproduce_counts.py`); `AG/reports/ALANYAGROUP_SITE_FINAL_REMEDIATION_V1/EXECUTION_PLAN.md#L47,L50`.

`agsc-v6` standardizasyonu içerik düzenlemesi değil **mühendislik sürümüdür**: staging build, PHP lint, checksum, rollback, AYT/GZP ebeveyn + çocuk DOM doğrulaması; "highest blast radius — do last, alone". AGOS özeti de bu 192 satırı Option C / engine-standardization planlamasına koyar, shortcode eklemeye değil. — kaynak: `AG/reports/ALANYAGROUP_SITE_FINAL_REMEDIATION_V1/EXECUTION_PLAN.md#L50`; `agos/AG_BOOKING_COVERAGE_SUMMARY.md#L106`.

### 2.2 Plugin envanteri — YOK

| Sorulan | Kayıt |
|---|---|
| Aktif plugin listesi, sürümler | yok |
| Cache / minify / görsel optimizasyon eklentisi | yok |
| WPCode snippet içeriği | yalnızca "Rank Math meta REST'e `register_post_meta` ile açıldı" (`MASTER_PROJECT_STATUS.md#L54`) |
| "Çift plugin" iddiası | `duplicate.{0,40}plugin` grep = **0 eşleşme**; hiçbir belgede kanıtlanmıyor |

Kanıtlı olan: **üç form implementasyonu** (`ag_home_booking` / legacy `ag_booking_form` c6 / şablon-enjekte `agsc-v6`) ve roadmap'in "Legacy booking plugins or duplicate booking engines" toplu-import yasağı. Plugin/tema güncellemesi migrasyon boyunca yasak (R12) ve her zaman OWNER GO ister. — kaynak: `alanyagroup-platform/AI_COMMAND_CENTER/MASTER_PROJECT_STATUS.md#L42-45`; `agos/AGOS_MASTER_ROADMAP_2026_V2.md#L28,L462`; `agos/AGOS_RISK_REGISTER_V2.md#L19` (R12); `agos/AGOS_DECISION_GATES.md#L150`.

---

## 3. Cloudflare ve cache — üç rol, sıfır performans ayarı

| Rol | Kayıt | Kaynak |
|---|---|---|
| (a) Dış/otomatik fetch engeli | WebFetch → 403; public `/wp-json` GET'lerine izin var; logged-in same-origin REST çalışıyor. **Mutlak değil:** "blocks **some** external fetches"; SEL-123 906/906 public statik HTML GET başarılı | `MASTER_PROJECT_STATUS.md#L55,L63,L106`; `agos/AG_ADMIN_CMS_01_CURRENT_STATE_AUDIT.md#L42`; `agos/AG_BOOKING_COVERAGE_SUMMARY.md#L28` |
| (b) DNS/cutover ve route gate'i | R13 "Cloudflare/DNS cutover could point traffic to incomplete staging"; Gate 10 "Cloudflare/DNS checklist approved"; "Cloudflare rule" değişikliği AGCANONICAL/AGMIG gate'inden önce yasak | `agos/AGOS_RISK_REGISTER_V2.md#L20`; `agos/AGOS_DECISION_GATES.md#L136`; `agos/AGOS_GOV_01_EVIDENCE_GATE.md#L245` |
| (c) AGDEPLOY altyapı bileşeni | "Hetzner / Caddy / Cloudflare / Staging / Production"; "Document Cloudflare and DNS boundaries" | `agos/AGOS_MASTER_ROADMAP_2026_V2.md#L275,L291`; `agos/AGOS_MODULE_STATUS_MATRIX.csv` satır `AGDEPLOY` |

**Cache:** yalnızca doğrulama riski olarak kayıtlı — CMS-R12 "Cache or Cloudflare behavior hides verification failures → cache-busting verification"; "Cloudflare/cache can make external evidence incomplete". — kaynak: `agos/AG_ADMIN_CMS_01_RISK_REGISTER.md#L26,L65`.

**Performans ayarı:** APO, Polish, Mirage, Rocket Loader, minify, Brotli, page/cache rule — private kayıtta **0 satır**. Tek "Polish" eşleşmesi `pl.alanyagroup.com` Lehçe dil alt alanıdır (`agos/AGOS_MASTER_ROADMAP_2026_V2.md#L307`). Hangi cache katmanının (Cloudflare / WP eklentisi / host) aktif olduğu kayıttan bilinemez.

---

## 4. Görsel / medya — politika var, envanter yok

| Konu | Kayıt | Kaynak |
|---|---|---|
| Canlı attachment | **2636**; local 11; local'de eksik 2635 | `agos/AGOS_MASTER_ROADMAP_2026_V2.md#L50-52` |
| Toplu import | eski medyanın toplu import'u yasak; "reference only until classified" (R1, R3) | `agos/AGOS_RISK_REGISTER_V2.md#L8,L10`; `agos/AGMEDIA_01_ENTERPRISE_MEDIA_LIBRARY.md#L112-116` |
| Format politikası | WebP web-teslim varyantları için zorunlu; AVIF hero/gallery/card/thumbnail/OG/schema image için "future-ready" bayrak; AGMEDIA-01 dönüştürmez/sıkıştırmaz; dönüşüm ayrı owner-onaylı sprint (source, target, backup, proof, rollback) | `agos/AGMEDIA_01_ASSET_TYPE_RULES.md#L27-32` |
| Boyut / srcset / CDN-cache / responsive kuralları | **yazılmamış** — Sprint 9 "AGMEDIA Optimization and Responsive Strategy" planlı (docs only; output: image optimization standard); agos kökünde 22 `AGMEDIA_*` dosyanın hepsi 01/02/03 öneki | `agos/AGOS_NEXT_30_SPRINTS.md#L103-113`; agos kök listesi |
| Görsel envanteri | `AGMEDIA_03_MEDIA_CLASSIFICATION_MATRIX.csv` 33 sütun / **0 veri satırı** — "intentionally header-only" | `agos/AGMEDIA_03_MEDIA_INVENTORY_CLASSIFICATION_TEMPLATE.md#L27,L52-54` |

Sonuç: canlıda WebP/AVIF sunulup sunulmadığı, görsel boyutları, lazy-load, `srcset` — hiçbiri ölçülmemiş; 2636 attachment'ın format/boyut dağılımı kayıtta yok.

---

## 5. SEO kural seti — kayıt ne kilitlemiş

| Kural | İçerik | Kaynak |
|---|---|---|
| Canonical | "One intent equals one canonical owner." Apply öncesi D01 (canlı/local URL envanteri) … D07 (Rank Math metadata review), D08 (sitemap dependency review), D09 (Owner GO packet) zorunlu | `agos/AGSEO_01_CANONICAL_DEPENDENCIES.md#L8,L14-27` |
| HOLD koşulları | envanter eksik; sınıflandırma incelenmemiş; owner tartışmalı; URL değişimi ima ediliyor; **Rank Math metadata değişecek**; **sitemap değişecek**; production dokunulacak; owner GO yok | `agos/AGSEO_01_CANONICAL_DEPENDENCIES.md#L30-39` |
| Rank Math kısıtı (3 yer) | "Redirect, canonical, sitemap, slug, menu, parent-child, or Rank Math change" → her zaman OWNER GO; "Rank Math metadata without canonical review" asla toplu import; gate öncesi "No Rank Math canonical update, `.htaccess`, Caddy redirect, Cloudflare rule, or WordPress redirect plugin change" | `agos/AGOS_DECISION_GATES.md#L148,L161`; `agos/AGOS_GOV_01_EVIDENCE_GATE.md#L245`; `agos/AGSEO_02_NO_APPLY_CONFIRMATION.md#L17`; `AG/CLAUDE.md#§5` ile tutarlı |
| Toplam bağımlılık | `DEPENDENCY_COUNT=18` (D01–D18); D17 staging QA "render, links, schema concept, booking dependencies"; D18 production gate (backup, rollback, Owner GO, release gate'e kadar DNS/cutover yok). **Performans/hız kriteri listede yok** | `agos/AGSEO_01_MEDIA_SCHEMA_DEPENDENCIES.md#L62-80` |

Sayısal çerçeve (tek lensten, satır varlığı bu oturumda teyit edildi — ayrıntı §11): 14 iç bağlantı kuralı, 10 silo, 12 sayfa tipi, 16 satırlık canonical owner matrisi (hepsi `manual_review_required=yes`). — kaynak: `agos/AGSEO_01_INTERNAL_LINKING_MODEL.md#L8`; `agos/AGSEO_01_SILO_HIERARCHY.csv`; `agos/AGSEO_01_PAGE_TYPE_RULES.md#L14-25`; `agos/AGSEO_02_URL_DEPENDENCY_MATRIX.csv`.

---

## 6. Dil mimarisi — üç kaynak, üç farklı gerçek

### 6.1 Kaynaklar

| Kaynak | Ne diyor | Durum |
|---|---|---|
| Owner (`AG/CLAUDE.md#§7` madde 4; üç depoda aynı brifing) | Kademe **EN→TR→DE→RU**; İskandinav 12 + Arapça için kapsam kararı Hermes'e devredildi | **owner beyanı — üstün** |
| AGOS SEL-191 (`agos/AGOS_MASTER_ROADMAP_2026_V2.md#L296-311`) | Çok dilli **alt alan adı** mimarisi: `www` EN master, `de.`, `ru.`, `pl.` (Lehçe), `tr.` "if needed", `ar.` "if needed"; gate: otomatik IP/dil yönlendirmesi yok, **WPML rollout yok**, her dil kendi sitemap + GSC property + canonical + hreflang + içerik planı | matriste `DECISION_RECORDED` (`agos/AGOS_MODULE_STATUS_MATRIX.csv` satır `AGINTL`); **Linear anchor'ı SEL-191 hâlâ `Todo`** (`agos/AGOS_LINEAR_SYNC_NOTES.md#L35`; `#L41-43` senkron olmadığını kabul eder) |
| AGOS CMS kaydı (`agos/AG_ADMIN_CMS_01_ARCHITECTURE.md#L24,L32`) + platform (`MASTER_PROJECT_STATUS.md#L19`) | WPML **bugünkü** dil katmanı ve "current source of truth"; "Only English is currently being edited; TR/DE/RU/AR reserved for WPML"; site EN 439 / TR / DE / RU / AR | mevcut durum |

### 6.2 Çelişkiler — çözülmedi

| # | Çelişki | Kaynaklar |
|---|---|---|
| a | Owner kademesi **Lehçe içermez** ve TR'yi 2. sıraya koyar; SEL-191 TR/AR'ı "if needed" sayar ve **PL ekler** — oysa PL için hiçbir depoda içerik kaydı yok (tek Lehçe eşleşmesi roadmap `#L307`), TR ve AR içeriği ise kayda göre canlıda zaten var | `AG/CLAUDE.md#§7`; roadmap `#L296-311`; `AG_ADMIN_CMS_01_ARCHITECTURE.md#L32`; `MASTER_PROJECT_STATUS.md#L19` |
| b | SEL-191 WPML'i **gelecek** birincil mimari olarak reddeder ve rollout'u yasaklar; AGOS'un kendi CMS kaydı WPML'i **bugünkü** katman sayar. "AGOS WPML'i reddediyor" eksik bir ifadedir; uyumsuzluk gelecek mimari ile mevcut WPML gerçeği arasındadır | `roadmap#L300,L311`; `AG_ADMIN_CMS_01_ARCHITECTURE.md#L24,L32`; `agos/AG_BOOKING_PRIORITY_SUMMARY.md#L66`; `agos/AG_BOOKING_BATCHES.md#L13` |
| c | İskandinav diller AGOS kaydında **hiç geçmez**; karar Hermes'te (GÖREV 4) ve boş | `AG/CLAUDE.md#§7` madde 4 |
| d | INTL-02 uygulama planı (subdomain plan, hreflang modeli, dil başına sitemap kuralı) **yazılmamış** — Sprint 23 planlı; iki özel depoda INTL-01/INTL-02 adlı dosya yok | `agos/AGOS_NEXT_30_SPRINTS.md#L271-281`; `agos/AGOS_RISK_REGISTER_V2.md#L16` (R9) |

Hiçbir kayıt hreflang'in uygulandığını söylemez ("no DNS, WPML rollout, or hreflang apply yet" — `agos/AGOS_LINEAR_SYNC_NOTES.md#L50`).

### 6.3 Kademelerin dışında kalan canlı sayfalar — yalnızca toplu sayılar

Formsuz 699 URL: **521** `EN_OR_ASCII_OR_UNKNOWN` / **178** `NON_EN_OR_ENCODED_REVIEW_WPML_SCOPE` (CSV'den birebir yeniden üretildi). — kaynak: `agos/AG_BOOKING_PRIORITY_MATRIX.csv` sütun `language_scope_note`.

| Grup | URL | Formsuz | Not |
|---|---:|---:|---|
| İskandinav slug (transfer sözlüğü) | **12** | 12 | 11'i `MUST_HAVE_BOOKING` + transfer-intent; 1'i `NO_BOOKING_NEEDED` post ("General post without explicit transfer/tour/destination booking intent", `EN_OR_ASCII_OR_UNKNOWN`) — yani 12'nin **11'i** 178'lik kümede |
| DE slug | 21 | 21 | önceki paketin tablosu; bu oturumda yeniden türetilmedi |
| TR slug | 14 | 14 | önceki paketin tablosu; bu oturumda yeniden türetilmedi |
| RU-latin slug | 0 | — | — |
| URL-kodlu (ASCII dışı) slug — 906 envanter | **64** | **64** | 47 Kiril (RU) + 17 Arap harfli; hepsinde `booking_engine=none` |

— kaynak: `AG/reports/ALANYAGROUP_SITE_FINAL_REMEDIATION_V1/BOOKING_ENGINE_MATRIX.md#L120-135` (§7); `agos/AG_BOOKING_PRIORITY_MATRIX.csv` sütunlar `priority_group`,`classification_reason`,`language_scope_note`; `agos/AG_BOOKING_COVERAGE_INVENTORY.csv` sütun `url` (regex sayımı, `tools/reproduce_counts.py`).

Yeniden üretim notu: İskandinav 12, ASCII token seti `overf[oø]r|flyplass|pendelbuss|lufthavn|flygplats` ile çıkar — slug'larda "ø" değil "o" kullanılır ("overfør" yazımı yalnızca 6 eşleşir; `lufthavn`/`flygplats` 0 eşleşir, yani etiket fiilen Norveççe slug'lara dayanır). 12 sayısı "tüm İskandinav sayfalar" değildir: transfer sözlüğü dışındaki en az 8 Norveççe `SHOULD_HAVE_BOOKING` slug (bilutleie/feriehus ailesi) 178'in içinde ama 12'nin dışındadır. Tekil URL'ler private fixture'dadır; burada listelenmez.

**hreflang yeniden kurulumu yalnızca EN/TR/DE/RU üretirse 12 İskandinav + 17 Arap-harfli + 47 Kiril sayfa öksüz kalır.** Owner kararı (Hermes GÖREV 4) beklemede.

---

## 7. hreflang / robots.txt / sitemap — canlı durum yakalanmamış

- `hreflang|robots|sitemap_index|sitemap.xml` araması üç depoda 46 satır; `agos`'taki her "hreflang" eşleşmesi model/gate/plan metni (entity model, modül matrisi, roadmap gate, sprint çıktısı, risk kaydı, Linear notu). Canlı hreflang etiketi, robots.txt veya XML sitemap index içeriği **hiçbir depoda yok**. — kaynak: grep; `agos/AGOS_LINEAR_SYNC_NOTES.md#L50`.
- AG_GM_13 "sitemap quality review … completed" der; bu incelemeye ait dosya üç depoda yok. — kaynak: `alanyagroup-platform/AI_COMMAND_CENTER/MASTER_PROJECT_STATUS.md#L80`.
- **Belgelenmiş boşluk:** `agos/indexes/proof/PROOF-INDEX.md#L199` bir sitemap kanıt klasörünü isimle listeler (`SEL-214-DB-CLEANUP-SITEMAP-…`) ve `#L3` kanıt gövdesinin kasıtlı olarak "local-only (git-ignored)" tutulduğunu belirtir. SEL-214'ün AG_GM_13'teki inceleme ile aynı iş olup olmadığı kayıttan **kurulamaz** (SEL-### Linear/AGOS numarası, AG_GM_## owner track log'u).
- Envanter fixture'ı yalnızca HTML `/sitemap/` sayfasını (HTTP 200) yakalar, XML sitemap index'i değil. Tek canlı noindex gözlemi: "3 internal panel pages to set noindex" (`MASTER_PROJECT_STATUS.md#L58`).

---

## 8. Erişim ve Semrush — bugünkü tek ölçülebilir kanal

Semrush aboneliği aktif, **API birimi 0**; `domain_overview` ve `site_audit` reddedildi. Hız denetiminin bu oturumdaki tek ölçülebilir kaynağı Semrush olarak kaydedilmiş ve owner'ın ek API birimi almasına bağlanmıştır. Dört kanalın dördü kapalı. — kaynak: `AG/reports/ALANYAGROUP_FULL_SITE_REMEDIATION_SPEC_V1/ACCESS_STATUS.md#L10-11,L17`.

---

## 9. Owner kararı ↔ kayıt — görünür çelişki tablosu (`AG/CLAUDE.md#§4`)

Bu bölümün SEO snippet'lerini ("from €X", başlık, meta) ve dil kapsamını etkileyen çelişkiler. **Hiçbiri burada çözülmez.**

| Konu | Owner kararı (`AG/CLAUDE.md#§4/§7`) | Kayıt | Durum |
|---|---|---|---|
| TÜRSAB numarası (schema `Organization`/`LocalBusiness` ve footer'a girer) | **2165** | **12892** — `alanyagroup-platform/AI_COMMAND_CENTER/MASTER_PROJECT_STATUS.md#L18` | çözülmedi; Hermes doğrulayacak; **ikisi de yayımlanmaz** |
| Shuttle 3 / 4 kişi ("from €X" snippet'leri) | 60 / 70 | 70 / 80 — `MASTER_PROJECT_STATUS.md#L23` | **owner kararı geçerli**; kayıt düzeltilmedi |
| Alanya dışı fiyat tabanı (site geneli "from €X") | `max(50, 50 + …)` | kayıtlı "from" fiyatları daha düşük (Belek €43 … Manavgat €55 — `MASTER_PROJECT_STATUS.md#L23`); formül farkı +€10…+€22 — `AG/reports/ALANYAGROUP_FINAL_COMPLETION_V1/BLOCKERS_AND_CONFLICTS.md#L100-113` | çözülmedi; taban ölü kod; Hermes doğrulayacak — **snippet yeniden yazımı bu karara bağlı** |
| Dil kademesi | EN→TR→DE→RU; İskandinav + AR kararı Hermes'te | SEL-191: `www/de/ru/pl` + `tr/ar` "if needed" — roadmap `#L296-311` | çözülmedi (§6.2) |
| Jetpack | — (karar yok) | `ACCESS_STATUS.md#L16` "1. öncelik, tek tık" ↔ `alanyagroup-platform/AI_COMMAND_CENTER/RISK_REGISTER.md#L5` "Do not use Jetpack just for Claude WordPress connection unless needed"; `CURRENT_STATUS.md#L10` "Jetpack: not needed now" | **owner kararı gerekir**; eski kural revize edilmeden "tek tık" olarak sunulmamalı |

---

## 10. Uygulama adımları (sıralı, gate etiketli)

| # | Adım | Gate |
|---|---|---|
| 1 | Bu bölümü ve §9 çelişki tablosunu owner'a sun; TÜRSAB / fiyat tabanı / dil kademesi / Jetpack için karar iste. Dokümantasyon, production dokunuşu yok. | [SERBEST] |
| 2 | Hız eşiklerini (INP/CLS/TTFB, Lighthouse skoru) owner'a onaylat; LCP ≤ 2.5 s dışındakiler kayıtta yok. | [OWNER GO] |
| 3 | Sayfa-tipi örneklemini (§1.3, 8 tip) private fixture'dan tekil URL'lere bağla; listeyi **yalnızca private depoya** yaz. | [SERBEST] (private depo) |
| 4 | Semrush API birimi geldiğinde `site_audit` çalıştır; crawl bulgularını (hreflang, canonical, duplicate meta, büyük görsel) sayfa-tipi bazında rapor et; çıktı private depoya, public'e yalnızca toplu sayı. | [ERİŞİM YOK] |
| 5 | Ağ izin listesi açıldığında PageSpeed Insights + CrUX ölçümü (8 URL × 3 tekrar × mobil/masaüstü); eşiklere göre PASS/FAIL, olduğu gibi raporla. | [ERİŞİM YOK] |
| 6 | Jetpack yeniden bağlanırsa (owner kararı sonrası): canlı plugin listesi, tema/PHP/WP/Rank Math sürümleri, cache/görsel-optimizasyon eklentisi var/yok, robots.txt, XML sitemap index, hreflang çıktısı ve noindex durumu **salt-okunur** envanterlenir. | [JETPACK] |
| 7 | Rank Math metadata backlog'u (eksik focus keyword, uzun/eksik meta description, iç panel noindex) — her satır ayrı OWNER GO; snippet'lerdeki "from €X" değerleri §9 fiyat kararı çözülmeden yazılmaz. | [OWNER GO] |
| 8 | Cloudflare performans ayarlarının (cache rule, APO, minify, Polish) ve cache katmanının belgelenmesi — salt-okunur panel envanteri; değişiklik yok. | [OWNER GO] (panel erişimi owner'da) |
| 9 | Sprint 9 "image optimization standard" (boyut/srcset/CDN-cache/responsive) yazılır; docs only. Dönüşüm sprint'i ayrı OWNER GO. | [SERBEST] (docs) → [OWNER GO] (uygulama) |
| 10 | INTL-02: owner kademesi ile SEL-191 uzlaştırıldıktan sonra hreflang modeli + dil başına sitemap kuralı yazılır; İskandinav/AR/RU-kiril kapsamı karara bağlanır. DNS/hreflang apply yok. | [OWNER GO] |
| 11 | `agsc-v6` şablon standardizasyonu: kaynak (child theme şablonu) private depoda olmadan başlamaz; staging build + PHP lint + checksum + rollback + DOM doğrulaması; en son, tek başına. | [BASELINE] → [OWNER GO] |
| 12 | Canonical / redirect / sitemap / Rank Math canonical değişikliği: D01–D09 tamamlanmadan ve `AGSEO_01_CANONICAL_DEPENDENCIES.md#L30-39` HOLD koşulları kalkmadan **hiçbiri**. | [OWNER GO] |

Sıralama gerekçesi: 1–3 bugün mümkün ve hiçbir erişim gerektirmez; 4–6 erişim kanallarına, 7–12 owner kararlarına ve Hermes baseline'ına bağlıdır. **`BASELINE_COMPLETE=YES` gelene kadar 11 başlamaz** (`AG/CLAUDE.md#§7`).

---

## 11. Tek doğrulamalı (reader-only) kayıt notları — ikinci lensten geçmedi

Aşağıdakiler bu bölümün ana iddialarına dayanak yapılmadı; satır varlıkları bu oturumda teyit edildi, içerik ikinci doğrulamadan geçmedi. Verifier açıp kontrol edebilsin diye kaynakla bırakıldı.

| ID | Not | Kaynak |
|---|---|---|
| SEO-04 | Yığın WordPress + Kadence + Rank Math; child theme `alanyagroup-child` ve `page-transfer-generic.php` "current proven files" listesinde; şablon `agsc-v6`'ya açıkça bağlanmıyor | `MASTER_PROJECT_STATUS.md#L18`; `agos/AG_ADMIN_CMS_01_ARCHITECTURE.md#L30`; `agos/AGOS_MASTER_ROADMAP_2026_V2.md#L177` |
| SEO-05 | Kadence gövde arka planı hatası (rgb 12,13,11); düzeltme `#f7fafc`, owner seçti, **pending** | `MASTER_PROJECT_STATUS.md#L25,L118` |
| SEO-18 | Rank Math backlog: 18 eksik focus keyword, ~36 uzun / ~20 eksik meta description, 3 iç panel noindex; focus-keyword temizliği **164** (`#L57`) ↔ **182** (`#L77`, AG_GM_09) — kayıt-içi tutarsızlık, çözülmedi | `MASTER_PROJECT_STATUS.md#L57-59,L77` |
| SEO-12/13/14/16 | 14 iç bağlantı kuralı (IL01–IL14); 12 sayfa tipi P0–P3; schema aday tipleri (Organization … ImageObject), AGSEO-01'de üretilmez/enjekte edilmez; AGSEO-02 matrisi 16 satır, hepsi manuel inceleme + OWNER GO | `agos/AGSEO_01_INTERNAL_LINKING_MODEL.md#L14-27`; `agos/AGSEO_01_PAGE_TYPE_RULES.md#L14-25,L34-35`; `agos/AGSEO_01_MEDIA_SCHEMA_DEPENDENCIES.md#L28-42`; `agos/AGSEO_02_URL_DEPENDENCY_MATRIX.csv` |
| SEO-19 | "Kanıtlanmış sayfa şablonu" (form hero altında → keyword → H2 → harita → "from €X" → … → 600+ kelime); "from €X" §9 fiyat kararına bağlı | `MASTER_PROJECT_STATUS.md#L56` |
| SEO-24/25 | Önceki paketlerde SEO testleri BLOCKED (Rank Math audit, canonical 200-check, duplicate schema, sitemap hygiene fetch gerektirir); "no bulk permalink change — protect DE organic" — GSC/GA verisi kayıtta yok, iddia ölçülmemiş | `AG/reports/ALANYAGROUP_FINAL_COMPLETION_V1/TASK_STATUS.md#L60-64`; `AG/reports/ALANYAGROUP_SITE_FINAL_REMEDIATION_V1/EXECUTION_PLAN.md#L52` |
| SEO-29 | Kayıtta adı geçen runtime dosyaları (`mu-plugins/ag-booking-core.php`, `plugins/ag-platform-phase1-mvp/…`, `mu-plugins/ag-homepage-live-pilot/plugin.php`, child theme şablonu) — hiçbirinin kaynağı beş depoda yok | `agos/AGOS_MASTER_ROADMAP_2026_V2.md#L174-177`; `AG/CLAUDE.md#§3` |
| SEO-31 | Semrush yalnızca n8n SEO command center dry-run'da "still unconfigured"; GA4/GTM durumu belgelenmemiş | `MASTER_PROJECT_STATUS.md#L66,L70`; `AG/reports/ALANYAGROUP_SITE_FINAL_REMEDIATION_V1/TASK_STATUS.md#L98-99` |
| SEO-34 | Ölçek tutarsızlığı: envanter 906 = 273 page + 633 post ↔ roadmap "339 pages, 634 posts" — 339 vs 273 farkı açıklanmamış | `agos/AG_BOOKING_COVERAGE_INVENTORY.csv` sütun `page_type`; `agos/AGOS_MASTER_ROADMAP_2026_V2.md#L50` |
| SEO-35 | "Cache purge" OWNER GO olmadan yasak | `agos/AG_BOOKING_COVERAGE_BATCH_PLAN.md#L12-18` |
| SEO-36 | `alanyagroup-platform/SEO/README.md` 3 satırlık başlık taslağı; SEO'nun owner-doğrulanmış tek kaynağı `MASTER_PROJECT_STATUS.md` §4 | `alanyagroup-platform/SEO/README.md#L1-3` |

---

## 12. Kayıt bunu söylemiyor

1. **Ölçülmüş hız verisi yok.** Lighthouse, CWV, TTFB, CrUX, GTmetrix, WebPageTest — hiçbiri. Gerekli ölçüm ve eşikler §1.3'te.
2. **Plugin envanteri yok:** aktif plugin listesi, sürümler, cache/minify/görsel-optimizasyon eklentisi, WPCode snippet içeriği. "Çift plugin" iddiası doğrulanamıyor.
3. **Sürümler yok:** tema / PHP / WordPress / Rank Math; Kadence Pro olup olmadığı; hosting katmanı (yalnızca cPanel olduğu kayıtlı).
4. **Cloudflare yapılandırması yok:** plan, cache kuralı, APO, Polish/Mirage, Rocket Loader, minify — hiçbiri belgelenmemiş; performans katkısı ölçülemiyor.
5. **Canlı hreflang, robots.txt, XML sitemap index, noindex durumu yakalanmamış;** AG_GM_13 sitemap incelemesinin çıktısı depoda yok (SEL-214 kanıtı git-ignored).
6. **Organik trafik verisi yok (GSC/GA4):** "DE organic strong" ve "no bulk permalink change" gerekçesi ölçüme dayanmıyor; hangi dil/URL'nin trafik aldığı bilinmiyor.
7. **Dil kapsamı kararı yok:** 12 İskandinav, 17 Arap-harfli, 47 Kiril-slug'lı sayfanın indexlenme/trafik durumu bilinmiyor; Hermes GÖREV 4 boş; Lehçe (`pl.`) için owner beyanı hiç yok.
8. **`agsc-v6` şablonunun hangi dosya olduğu** kayıtta açıkça bağlanmamış; kaynağı depoda yok.
9. **Schema mevcut durumu ölçülmemiş:** Rank Math ↔ tema/plugin schema çakışması ("duplicate schema") yalnızca denetim kalemi.
10. **Görsel teslim durumu ölçülmemiş:** canlı WebP/AVIF, boyut, lazy-load, `srcset`; 2636 attachment'ın format/boyut dağılımı yok.
11. **Rank Math cleanup sayısı** 164 mü 182 mi uzlaştırılmamış.
12. **INTL-02 yazılmamış;** owner kademesi ile SEL-191 arasındaki çelişki owner tarafından çözülmemiş.
13. **Hız ölçümü için canlı WordPress'in staging kopyası yok;** AGDEPLOY staging'i içerik kopyası değil (§1.4 — çıkarım olarak etiketli).

---

## 13. Düzeltilen / elenen iddialar (doğrulama izi)

Kullanılan: **8 held** (SEO-01, 03, 07, 09, 11, 17, 26, 28) + **6 corrected** (aşağıda). **Refuted: 0.** Reader-only 22 bulgu ana iddialara dayanak yapılmadı; §11'de etiketli.

| ID | Düzeltme |
|---|---|
| SEO-02 | Dosya sayısı "9" yeniden üretilmedi: kayıtta **8** dosya (7 agos otel-adı eşleşmesi + 1 MPS); fazlası bu oturumun kendi izlenmeyen çıktısı. Özün (0 ölçüm) değişmedi. |
| SEO-06 | "Yalnızca iki rol" ve "cache tek satır yok" fazla mutlaktı: üçüncü rol AGDEPLOY bileşeni (roadmap `#L275,L291`); cache CMS-R12 doğrulama riski olarak kayıtlı (`#L26,L65`). "Sadece logged-in REST çalışıyor" da mutlak değil: SEL-123 906/906 public GET başarılı. Performans ayarı = 0 satır ifadesi korundu. |
| SEO-21 | "AGOS WPML'i reddediyor" eksikti: SEL-191 WPML'i **gelecek** mimari olarak reddeder, AGOS CMS kaydı WPML'i **bugünkü** katman sayar (`AG_ADMIN_CMS_01_ARCHITECTURE.md#L24,L32`). `DECISION_RECORDED` ↔ Linear SEL-191 `Todo` (`AGOS_LINEAR_SYNC_NOTES.md#L35`). PL'nin içerik kaydı yok; TR/AR canlıda var. |
| SEO-22 | Token seti "overfør" 6 eşleşir; 12 yalnızca ASCII `overf[oø]r` ile çıkar. "12'nin tamamı transfer-intent" yanlış: 1'i `NO_BOOKING_NEEDED` post, `EN_OR_ASCII_OR_UNKNOWN`; 11'i 178'in içinde. DE 21 / TR 14 önceki paketten, yeniden türetilmedi. |
| SEO-23 | "Artefakt yok" mutlak değildi: `PROOF-INDEX.md#L199` SEL-214 sitemap kanıt klasörünü isimle listeler, `#L3` kanıt gövdesinin git-ignored olduğunu belirtir; AG_GM_13 ile aynı iş olup olmadığı kayıttan kurulamaz. |
| SEO-33 | "Staging hız/SEO ölçümü için kullanılamaz" kayıt değil çıkarım — öyle etiketlendi (§1.4). "Not a clone" dayanağı roadmap `#L10,L25,L434`. Önceki paketlerin "no staging exists" (B5/B3′) kaydıyla çelişki görünür yapıldı. |

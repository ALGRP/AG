# CODEX GÖREV PAKETİ 01 — Tam Site Düzeltmesi: Erişim, Sayfalar, Form, Hız, Rezervasyon

**TASK_NAME=** `AG_CODEX_FULL_SITE_REMEDIATION_01`
**ROLE=** EXECUTOR (Mac ve/veya canlı site erişimi olan ajan) / VERIFIER
**REQUESTED_BY=** Owner
**DATE=** 2026-09-13 (2026-09-12 taslağını, 03/04/05 bölümlerinin son hâline göre günceller ve onun yerine geçer)
**MODE=** READ_ONLY varsayılan · her canlı dokunuş **ayrı OWNER GO** ister
**PRODUCTION_WRITE=** NO (GO gelene kadar) · **DEPLOYMENT=** NO · **REAL_CUSTOMER_ACTION=** NO
**owner_go=** false (bu paket canlı mutasyon yetkisi vermez; §3)

---
## 0. Kimlik ve bağlam

**Codex kimdir:** Bu sistemde Codex, bu oturumun (Claude, code.claude.com konteyneri) sahip **olmadığı** erişime sahip
icracıdır: owner'ın Mac'i, canlı WordPress admin'i ve/veya oturum açık tarayıcı. Hermes'e 2026-09-03'te verilen paket
(`handoff/HERMES_TASK_PACKET_01.md`) bu tarihe kadar yanıtsızdır; Codex o dört görevi devralır ve üzerine owner'ın talebini
ekler: *"alanyagroup web sitesini en baştan sona kadar tüm sayfalarını ve tüm içeriklerini rezervasyon formunu ve ux ve ui
olarak düzenle ve yayına al sitenin hızını ve rezervasyon durumunu kontrol et ve yaptığımız her işi codexe bildir"* →
(1) tüm sayfa + içerik, (2) rezervasyon formu, (3) UX/UI, (4) yayına alma, (5) hız, (6) rezervasyon durumu, (7) Codex'e
rapor. **1–6 bugün bu oturumdan yapılamadı; 7 bu pakettir.**

**Bu oturum ne yaptı / yapamaz:** Siteye dört kanaldan erişmeyi denedi, dördü kapalı
(`reports/ALANYAGROUP_FULL_SITE_REMEDIATION_SPEC_V1/ACCESS_STATUS.md#L7-12`). Erişim olmadığı için üç depodaki
kaydı beş bağımsız okuyucuyla okudu, her iddiayı kaynak satırına karşı ikinci mercekle doğruladı ve beş bölümlük
sayfa-tipi bazlı düzeltme spesifikasyonunu yazdı (§1-B). Canlı DOM okuma, içerik yazma, PHP çalıştırma, hız ölçümü,
rezervasyon sorgusu — hiçbiri yapılamadı (§5). Booking runtime kaynağı beş depoda yok (`CLAUDE.md §3`). Canlı
siteye dair bu paketteki **her sayı kayıt-türevidir** (2026-06-24 anlık görüntüsü), ölçüm değildir.

**Tek cümle durum:** `owner_go = false` · site 4/4 kanaldan erişilemez · booking-core kaynağı hiçbir depoda yok · 24 testin
**0'ı** çalıştı · 587 para sayfasının **384'ü (%65)** formsuz (kayıt-türevi) · `OWNER_GO_LOG.md` **0 kayıt** (kayıtta 2 kullanılmış canlı GO).

---
## 1. Okuma sırası

**Depo:** `ALGRP/AG` (public) · **Branch:** `claude/alanyagroup-final-completion-me48z5` · PR #1

```
git clone -b claude/alanyagroup-final-completion-me48z5 https://github.com/ALGRP/AG
```

### A. Zemin — önce bunlar (10 dk)
```
CLAUDE.md                                                            ← beş depoda aynı; §4 kilitli kararlar, §5 yasaklar, §6 gizlilik
reports/ALANYAGROUP_FULL_SITE_REMEDIATION_SPEC_V1/ACCESS_STATUS.md   ← bu oturumun doğrudan ölçümü; "bugün ne yapılabilir"in zemini
handoff/HERMES_TASK_PACKET_01.md                                     ← devraldığın dört görev (baseline, TÜRSAB, fiyat, dil) + teslim biçimi
```

### B. Spesifikasyon — bu paketin dayandığı beş bölüm (sırayla)
```
reports/ALANYAGROUP_FULL_SITE_REMEDIATION_SPEC_V1/05_GATES_SEQUENCING_ROLLBACK.md   ← ÖNCE: merdiven (18 adım), OWNER GO biçimi, R-01/R-02/R-05/R-Prod
reports/ALANYAGROUP_FULL_SITE_REMEDIATION_SPEC_V1/01_PAGES_AND_CONTENT.md          ← PT01–PT12 modeli, envanter, dil, içerik paketi, adım 0a–8
reports/ALANYAGROUP_FULL_SITE_REMEDIATION_SPEC_V1/02_BOOKING_FORM_UX_UI.md         ← hedef form alan seti, akış, erişilebilirlik, 24 testin UI satırları
reports/ALANYAGROUP_FULL_SITE_REMEDIATION_SPEC_V1/03_RESERVATION_OPERATIONS.md     ← "rezervasyon durumu"nun dört anlamı, lifecycle, voucher gate, GO defteri
reports/ALANYAGROUP_FULL_SITE_REMEDIATION_SPEC_V1/04_SEO_SPEED_TECHNICAL.md        ← hız protokolü + eşikler, SEO gate'leri, dil mimarisi çelişkisi
reports/ALANYAGROUP_FULL_SITE_REMEDIATION_SPEC_V1/README.md                        ← indeks; 7 talebin durum tablosu; 13 çelişki tek tabloda
```
Her bölümün sonunda "Kayıt bunu söylemiyor" ve "Düzeltilen / elenen iddialar" vardır; bir sayıyı kullanmadan önce oradaki
düzeltmeyi kontrol et. Sayım betiği: `…/tools/reproduce_counts.py` (private CSV'ler üzerinde çalışır).

### C. Önceki paketler — kısmen aşıldı
```
reports/ALANYAGROUP_SITE_FINAL_REMEDIATION_V1/        ← booking matrisi, 906-URL analizi; hâlâ geçerli
reports/ALANYAGROUP_RECONCILED_BOOKING_CANDIDATE_V1/  ← durdurma gerekçesi + tools/preflight_baseline_check.sh
reports/ALANYAGROUP_FINAL_COMPLETION_V1/              ← İLK paket — KISMEN GEÇERSİZ (CLAUDE.md §8)
```
Uyarılar: (i) FINAL_COMPLETION'ın "envanter yok" ve telefon bulguları RECONCILED'da düzeltildi (`CLAUDE.md §8`).
(ii) SITE_FINAL `EXECUTION_PLAN.md#L46` SEL-121 pilotunu "yapılacak" sayar; kayıt **yapıldığını** gösterir (05 §2.2).
(iii) SITE_FINAL `EXECUTION_PLAN.md#L19-29` kapı sırası ACCESS_STATUS'un dört-kanal sırasıyla aşıldı (05 §1.1).
(iv) `[ag_home_booking]`'i "canonical" sayan her eski satır `CLAUDE.md §4` ile aşıldı: canonical `[ag_booking_engine]`,
`ag_home_booking` **alias**. (v) Hermes paketi `#L176` "RU (latin slug) 0" bir kapsam sınırıdır; Kiril slug'lı RU sayfa
**47** (01 §5.1). (vi) "Staging kayıtlı değil" (FINAL_COMPLETION B5, SITE_FINAL B3′) AGOS AGDEPLOY kaydıyla çelişir; daha
geç ve özgül olan AGOS üstün sayılır (04 §1.4).

### D. Private fixture'lar — URL bazlı detay yalnızca burada, AG'ye kopyalanmaz
```
ALGRP/AGOS → AG_BOOKING_COVERAGE_INVENTORY.csv (906) · AG_BOOKING_PRIORITY_MATRIX.csv (699; priority_group, proposed_batch, language_scope_note)
ALGRP/AGOS → AG_BOOKING_OWNER_DECISION_01.md · AG_BOOKING_BATCHES.md · AG_BOOKING_COVERAGE_BATCH_PLAN.md · AG_BOOKING_OPTION_B_{APPLY_01_REPORT,PILOT_MONITOR_01_REPORT,ROLLBACK_PLAN,OWNER_GO_TEMPLATE}.md
ALGRP/AGOS → AGOS_DECISION_GATES.md · AGOS_GOV_01_OWNER_GO_TEMPLATE.md · AGCP_01_OWNER_GO_CENTER.md · AGSYNC_OPS_01_*.{md,csv}
ALGRP/alanyagroup-platform → AI_COMMAND_CENTER/{MASTER_PROJECT_STATUS,OWNER_GO_LOG,RISK_REGISTER,CURRENT_STATUS,AI_OPERATING_RULES}.md
```
İki CSV yalnızca `page_post_id` üzerinden birleştirilir; `url` ile 64 satır (yüzde-kodlu RU/AR) düşer (01 §0).

---
## 2. GÖREVLER

Kapı etiketleri: **[ERİŞİM YOK]** bugün bloklu · **[JETPACK]** reconnect sonrası · **[BASELINE]** A4 tamam · **[OWNER GO]**
`OWNER_GO_LOG.md`'de açık kayıt · **[SERBEST]** yalnızca belge. Sıra bağlayıcıdır: A → (B1–B2 ∥ D/E okuma ∥ F karar listesi)
→ C → B'nin canlı kısmı. Hiçbir görev bir öncekinin kapısını atlayamaz. **B-09 varsayımı (görünür):** bu sıra **canonical-sonra**
dalını varsayar (C booking-core → B5 kapsam doldurma); bu bir owner kararı değil, yazım varsayımıdır (F6/B4, 05 §4.4). Owner
`B09_ORDER=alias-önce` derse B5 (Batch 1–3, SEL-121'de kanıtlı alias dizesi `[ag_home_booking …]` ile, [JETPACK] + ayrı [OWNER GO])
C'nin **önüne** alınır ve A4 baseline'ını beklemez; canonical-sonra dalında B5 `[ag_booking_engine]` ile C13 sonrasına kalır.

### GÖREV A — Dört kilidi owner ile açmak + Hermes baseline'ını devralmak (EN ÖNCELİKLİ)

**Amaç:** Siteyi ölçülebilir ve düzenlenebilir hale getirmek; booking-core kaynağını git'e almak. **Ön koşul:** yok — bugün
başlanabilir. **Geri alma:** A1 disconnect, A2/A3 kayıtta yazılı değil (05 §5); A4 = PR'ı merge etmeden kapatmak (R-05).
**Yasak:** hiçbir adım canlı içerik yazmaz; A4 salt-okunurdur.

| # | Kilit | Adımlar | Kabul kriteri |
|---|---|---|---|
| A1 | **Jetpack reconnect** | Owner'a **birlikte** sun: `ACCESS_STATUS.md#L16` (öncelik 1) **ve** `alanyagroup-platform/AI_COMMAND_CENTER/RISK_REGISTER.md#L3,L5` + `CURRENT_STATUS.md#L10` ("Jetpack: not needed now"). Owner iki risk maddesini bilinçli aşarsa: WP admin → Jetpack → Reconnect; `RISK_REGISTER.md` ve `CURRENT_STATUS.md` **aynı commit'te** revize edilir. Canlıda Jetpack'in kurulu/aktif olduğu kayıtta yok; "tek tık" doğrulanmamış (05 §1.1) | `JETPACK_CONNECTED=YES` + risk kaydı revize commit'i; reconnect **yazma yetkisi değildir** (05 §1 "Ne AÇMAZ") |
| A2 | **Semrush API birimi** | Owner: https://www.semrush.com/mcp-access → ek birim | `domain_overview` ve `site_audit` çağrısı reddedilmiyor |
| A3 | **Ağ izin listesi** | Owner: code.claude.com ortam ağ politikası → `alanyagroup.com`, `www.alanyagroup.com` | Konteynerden `CONNECT :443` 403 vermiyor. Yalnızca proxy egress'i açar; render edilmiş DOM için oturum açık tarayıcı gerekir (05 §1.2) |
| A4 | **Hermes baseline (devral)** | Mac'te salt-okunur `reports/ALANYAGROUP_RECONCILED_BOOKING_CANDIDATE_V1/tools/preflight_baseline_check.sh <MAC_WORKSPACE_ROOT>` çalıştır (kök = Mac'teki çalışma klasörü; 2026-09-13'ten beri betikte varsayılan yok — argüman veya `AG_WORKSPACE_ROOT` zorunlu, public kopyadan host yolu çıkarıldı; exit 0 tam · 1 eksik → **DUR** · 2 kök yok/verilmedi). Exit 0 → Görev 1B: 3 mu-plugin + `ag-homepage-live-pilot/` klasörü + CLE modülü → **private** depoya (`ALGRP/AGOS` seçilirse `sprint/<ID>` branch → PR → Owner merge, `agos/docs/git/BRANCH-STRATEGY.md#L5-7`). Commit öncesi secret taraması. Ayrıca raporla: `ag-platform-phase1-mvp.php`, child theme `page-transfer-generic.php`, `ag-voucher*` var mı (05 §4.1: üç kayıt üç farklı küme, betik yalnızca birini kontrol eder) ve `#agsc-v6-form`'u hangi dosya enjekte ediyor | Betik çıktısı **kısaltmadan** + exit kodu; `BASELINE_COMPLETE=YES/NO`; YES ise depo/branch/SHA/dosya listesi; `SECRET_SCAN_RESULT`. Exit ≠ 0 → eksikleri **uydurma**, nerede olduklarını araştır ve raporla |
| A5 | **GO defteri ve yedek onarımı** [SERBEST → OWNER GO kabulü] | `OWNER_GO_LOG.md#L3` "hiç GO verilmedi" der; kayıt iki kullanılmış GO gösterir (2026-06-21 tek sayfa, `MASTER_PROJECT_STATUS.md#L48`; 2026-06-24 SEL-121 iki sayfa, `agos/AG_BOOKING_OPTION_B_APPLY_01_REPORT.md#L3-5`). Geriye dönük iki kaydı ve bağlayıcı biçimi (05 §2.1 asgari birleşim: AGCP-01 18 alan + URL/ID listesi + Gate 9 bakım penceresi + stop condition) owner onayına sun. SEL-121 `AG_BOOKING_OPTION_B_APPLY_01_BACKUPS/` klasörü ve 2026-06-21 yedeği `.gitignore` ile git dışı, yalnızca Mac'te (03 §6) → secret taraması sonrası private depoya commit ettir | Log 2 geriye dönük kayıt + biçim; yedek klasörü git'te, `MANIFEST.json` checksum'ları `APPLY_01_REPORT.md#L48-60` ile eşleşiyor |

**Dönüş:** §4 bloğunun `JETPACK_CONNECTED / SEMRUSH_UNITS / NETWORK_ALLOWLIST / BASELINE_* / SOURCE_* / OWNER_GO_LOG_ENTRIES` satırları.

### GÖREV B — Sayfa + içerik + UX/UI düzeltmesi, sayfa tipi bazında (01, 02)

**Amaç:** 906 URL'yi PT01–PT12'ye sınıflandırıp 01 "Uygulama adımları" sırasıyla düzeltmek; formsuz 466 `MUST_HAVE_BOOKING`
sayfayı 5 batch ile doldurmak. **Ön koşul:** B1–B2 [SERBEST]; B3+ [JETPACK] veya eşdeğer oturum-açık yazma kanalı **+ her
adım için ayrı OWNER GO**; canonical ile doldurma [BASELINE] (B-09). **Geri alma:** R-01 sayfa içeriği (`content.raw` tarihli
backup → geri yükle → render edilmiş DOM yeniden doğrula); kapsam otoritesi "şablon/post-type injection" seçilirse R-02.
**Yasak:** slug/redirect/canonical/sitemap/Rank Math/menü/medya değişikliği bu görevde yok (ayrı GO); toplu otel import/redirect yok (R3/R7).

| # | Adım | Kapı | Kabul kriteri |
|---|---|---|---|
| B1 | 906 satırlık **PT01–PT12 + Gate 3 eylem sınıfı** matrisi (LOCAL-CONTENT-05 ikamesi; dosyası hiçbir depoda yok, 01 §3.3). Girdi: iki CSV `page_post_id` join. Deterministik kovalar sabit (01 §4.5: PT06 küme 132, PT05 rota 60, 64 kodlu RU/AR, 141 `-hotel-transfer` suffix); sezgisel kovalar `review_status=pending_human` | [SERBEST] → private depo | Her satırda PT + eylem sınıfı + review_status; AG'ye yalnızca toplamlar |
| B2 | Gate 4 girdisi: 96 AYT↔GZP ayna çifti, düz otel post ↔ derinlik-4 küme eşleşmeleri (token kuralı yazılı), `/gazipasa-transfer/` page/post çiftliği, 13 alias satırı, 2 ana-sayfa adayı → "henüz redirect yok" listesi | [SERBEST] → private depo | Çift listesi; hiçbir redirect uygulanmaz (`agos/AGOS_DECISION_GATES.md#L59-66`) |
| B3 | Canlı yeniden tarama (salt-okunur): 906 URL HTTP + **render edilmiş** DOM form sayısı + WPML dil alanı + Rank Math meta + index/noindex + hreflang. Envanter 2026-06-24 tarihli | [JETPACK] / [A3 + oturum açık tarayıcı] | Güncel fixture private depoda; B1'deki sezgisel kovalar kapanır; iki pilot + 2026-06-21 sayfası hâlâ tam 1 form |
| B4 | Owner karar paketi (F6 ile birlikte): PT06 P1/P2; hangi PT05 rotaları P0; **kapsam otoritesi** (injection mı sayfa-başı shortcode mu — 384 sayfa = 1 release mi 384 düzenleme mi); **GO birimi** (sayfa mı batch mi); **B-09 sıralaması** (alias `[ag_home_booking …]` ile **önce** mi, canonical `[ag_booking_engine]` ile baseline **sonra** mı); off-vertical içerik; Gazipaşa batı-ilçe rota niyeti; layout × PT (02 §4.10); tasarım sistemi (`MASTER_PROJECT_STATUS.md#L31` paleti vs artefakt) | [OWNER GO] | Kararlar `OWNER_GO_LOG.md`'de |
| B5 | Kapsam doldurma **Batch 1 (94)** → 2 (321) → 3 (51) — ham satır sayıları; 13 alias satırı (Batch 1'de 9, Batch 3'te 4; 05 §4.4 "Alias düzeltmesi") GO listesinden düşülür → düzenlenecek sayfa ≤ 85 / 321 / ≤ 47; Batch 1'in **58'i EN-dışı** → F4 dil kararına kadar ayrılır, 36 EN satırı önce. Her batch aynı 6-şartlı kapı (05 §4.4): envanter yenile → tam URL+ID listeli GO → önce-DOM **tam 0** → yalnızca REST `content` alanı → sonra-DOM HTTP 200 + **tam 1** form + literal shortcode 0 + çift form 0 → `owner_go` false + tarihli rapor. Batch 4 (16) / 5 (108) Batch 1–3 stabil olunca, ayrı GO | [OWNER GO] ayrı + [JETPACK] (+[BASELINE] canonical seçilirse) | Batch başına önce/sonra DOM tablosu; her backup/rollback artefaktı private depoya commit; başarısızlıkta derhal R-01 |
| B6 | P0 içerik: PT01 `/` korunur (`ag_home`); PT04 hub çiftliği çözümü (Gate 4); PT05 küme rota 60 → Kemer standardı şablonu; `c6` 2 sayfa migrasyonu (GO başına bir sayfa, canonical dize **kaynaktan**); sayfa paketi 11 alan + medya ≥5 + FAQ + schema **hazırlanır, apply edilmez**; "from €X" statik fiyat ve TÜRSAB alanı F1/F3 gelene kadar **placeholder** | [OWNER GO] (+[BASELINE] şablon ve c6) | Paket dosyaları private depoda; DOM önce/sonra = tam 1 form |
| B7 | P1/P2: PT02/03 hub + Batch 4 rehber (16); PT07/08 tur (Batch 3; tur URL'leri değişmez, PT08 medya ≥7); PT06 küme (132 `agsc-v6`) içerik tarafı; düz otel Batch 2 rebuild/redirect **yalnızca** AGHOTEL canonical review + altı-sınıf ayrımı sonrası; PT10/09/11 paketleri (IL11: makale tek canonical owner'a); P3 sistem/off-vertical/PT12 noindex listesi | [OWNER GO] | Toplu otel import/redirect yok; sistem sayfasına form yok |
| B8 | UX/UI: Kadence içerik arka planı okunabilirlik düzeltmesi (`MASTER_PROJECT_STATUS.md#L25,L118`); mobil sticky booking bar + WhatsApp FAB (`#L34`); form erişilebilirlik hedefleri 02 §4.11 (görünür `:focus-visible`, sayaç `aria-label`/`aria-live`, sekmelerde ok tuşu, ≥24 px hedef, dekoratif ikon `aria-hidden`, `dir="rtl"` desteği) — **canonical renderer üzerinde**, `agos/agbooking_hero_transfer_tour_final.html` artefaktı üzerinde değil (0 `<form>`, provenance 0; 02 §1.3–1.4) | [JETPACK] + [OWNER GO]; form kısmı [BASELINE] | 1366/390 px'de taşma 0, konsol hatası 0 (02 §5) |

**Asla:** 192 `agsc-v6` şablon sayfasına içerik shortcode'u eklenmez (çift form yaratır — bugün 0/906). Canonical
`[ag_booking_engine]` canlıda **kayıtlı değilken** hiçbir sayfaya yazılmaz (ham metin basar, "literal 0" kriterini bozar).
Kapsam, c6 migrasyonu ve `agsc-v6` standardizasyonu tek canlı işlemde birleştirilmez; `agsc-v6` **en son ve tek başına**,
enjekte eden dosya bulunduktan sonra (05 §4.5). **Dönüş:** `PT_MATRIX_ROWS`, `PAGES_DONE`, `FORM_COVERAGE`, `DOUBLE_FORMS`, `LITERAL_SHORTCODE`.

### GÖREV C — Booking-core değişiklikleri ve 24 testlik matris (02, 03, 05 §4.2)

**Amaç:** `CLAUDE.md §4` kilitli kararlarını koda uygulamak. **Ön koşul:** `BASELINE_COMPLETE=YES` + kaynak private depoda (A4)
+ staging OWNER GO. Sıra **staging → production**, asla doğrudan production (Gate 2 → 8 → 9 → 10). **Geri alma:** R-02 (dosya
backup + baseline checksum + ters yama + PHP lint + kontrol URL'lerinde DOM); production için **prova edilmiş** rollback + bakım
penceresi (Gate 9). **Barındırma:** booking core `ag-platform-v2-admin-cms` içinde yaşayamaz (`bin/safety-scan.php` 33 işaret,
`add_shortcode` görünce HOLD) — ayrı mu-plugin/plugin. Uygulanacak kararlar (kayıt ile çelişen her satırda §4 geçerli; çelişki F'de):

| # | Karar (`CLAUDE.md §4`) | Kabul kriteri (staging, sentetik veriyle) |
|---|---|---|
| C1 | Canonical `[ag_booking_engine]` → `ag_hlp_render_booking_engine()`; alias `[ag_home_booking]`, `[ag_transfer_booking_form]`, `[agp_booking_engine]` **aynı renderer'a**; `context/default_service/layout ∈ {inline,compact,hero}` öznitelikleri ve `ag-homepage-live-pilot` şablon çağrısı kırılmaz (02 §4.10); `ag_home_booking` "geçici"nin sonlandırılmasını hiçbir kayıt onaylamaz — 13 canlı sayfa taşınmaz (02 §3 satır 3) | 13 `ag_home` + 2 pilot + `single_hero` homepage dizesi render eder; literal metin 0; AGOS `AGOS-BOOKING-SURFACE-GATE-01` kapatılır |
| C2 | E-posta alanı **var ve opsiyonel** — UI/backend/API tutarlı; boş e-posta booking'i engellemez; voucher gate'i e-posta-bağımsız yazılır (`agos/AGSYNC_OPS_01_OPERATIONS_CENTER_ARCHITECTURE.md#L194-207` çelişir; aynı paketin `MASTER_SHEET_SCHEMA.csv#L14` `conditional` der — 03 Ç1) | empty → geçer; invalid → alan hatası; valid → geçer; e-postasız rezervasyon "Voucher Ready"de takılmaz |
| C3 | Manuel koltuk seçimi kaldırılır; `guest_count` koltuğu belirler; **kapasite doğrulaması backend'de korunur**; sayaç üst sınırı quote yanıtından (kapasite tablosu owner'dan — kayıtta değer yok, 02 §4.9) | Aşımda sunucu reddi, UI alan-içi hata; UI sınırı yetkili değil |
| C4 | Fiyat yalnızca server-side: shuttle **1=30 · 2=50 · 3=60 · 4=70 · 5=80 · 6=90** (4+ kişi başı +10); payload'daki fiyat yok sayılır; `price_snapshot` sunucuda. Kayıt 3=70/4=80 (`MASTER_PROJECT_STATUS.md#L23`) → **§4 geçerli** (F2). Canlı "Live price total"in client mı sunucu mu hesapladığı baseline'ın ilk sorusudur (02 §4.3) | 1/2/3/4/6 pax quote = 30/50/60/70/90; payload fiyatı değiştirilse sonuç değişmez |
| C5 | AYT↔GZP shuttle **her iki yönde** server-side ret, **dönüş bacağı dahil**; private/VIP etkilenmez; UI hata + private/VIP CTA (02 §4.4). Hangi kod yolunda yaşadığı baseline'da bulunur (03 Ç7) | Her iki yön + dönüş: red; private/VIP aynı rota: geçer |
| C6 | CLE received/confirmed e-posta davranışı regresyonsuz + **çift voucher önleme**: CLE tetikleyici/şablon/idempotency **kaynaktan** okunur, önce/sonra diff; homepage-pilot içindeki doğrudan `wp_mail()` yüzeyinin canlıda aktif olup olmadığı (`agos/master-status/AGOS-MASTER-STATUS.md#L168`, P0); submit-stage idempotency (`request_id` nonce + payload hash; AGOS-IDEMPOTENCY-GATE-01 gövdesi yok — 03 §2.3, adım 3) | double-click + retry → tek kayıt, tek bildirim, tek voucher; CLE diff'i raporda |
| C7 | 24 testlik matris (`…RECONCILED_BOOKING_CANDIDATE_V1/TASK_STATUS.md#L62-65`; tek tek maddeler kayıtta sıralanmamış) + SITE_FINAL 18'lik listenin 15 NOT RUN başlığı (`…SITE_FINAL_REMEDIATION_V1/TASK_STATUS.md#L108-112`): desktop/mobil, AYT/GZP, one-way/return, shuttle/private/VIP, bölge matrisi, 1/2/3/4/6 pax, e-posta üçlüsü, Places ok/fail, çift tık + retry, fiyat sınırları, konsol, taşma, tek booking/notification/voucher, **rollback provası** | `TESTS=n/24`, her madde PASS/FAIL/NOT_RUN **olduğu gibi**; madde listesi private depoda; başarısız test gizlenmez |

**Yasaklar:** gerçek müşteri/sürücü verisiyle test yok; gerçek WhatsApp/e-posta gönderimi yok (`example.invalid` + sahte
telefon — `agos/AGSYNC_OPS_02_DRY_RUN_PAYLOAD_BUILDER_SPEC.md#L41-42` fixture kuralı); n8n `fjqbCav0JYRFI5w7` pasif; production
apply yalnızca Gate 9 paketi + OWNER GO + listelenen dosyalar + backup sonrası + lint/proof/PASS-HOLD'da dur + `owner_go → false`.
**Dönüş:** `FORM_DONE`, `TESTS`, `PRODUCTION_CHANGED`.

### GÖREV D — Hız denetimi (04 §1.3, §10)

**Amaç:** "Sitenin hızını kontrol et" — kayıtta **sıfır ölçüm** var (04 §1.1); tek "LCP < 2.5s" satırı henüz inşa edilmemiş
Tours platformu için tasarım hedefi (`MASTER_PROJECT_STATUS.md#L34-35`). **Ön koşul:** A2 (Semrush crawl) ve/veya A3
(PageSpeed/CrUX) ya da owner Mac'inde tarayıcı Lighthouse; birbirinin yerine geçmez. Staging (`app.alanyagroup.com`) canlı
içeriğin kopyası değil, ölçüm yerine geçmez (04 §1.4). **Geri alma:** yok (salt-okunur). **Yasak:** cache purge, plugin/tema
güncellemesi (R12), Cloudflare rule/route değişikliği — sonuç ne olursa olsun.

| # | Adım | Kabul |
|---|---|---|
| D1 | Örneklem **sayfa tipi** bazında, URL listesi değil: ana sayfa · AYT hub `/antalya-transfer/` · GZP hub `/gazipasa-transfer/` · 1 rota landing (agsc-v6) · 1 düz otel-transfer (formsuz) · 1 tur (formsuz) · 1 DE sayfa · 1 post. **8 URL × 3 tekrar × mobil+desktop**, medyan; tekil URL'ler private fixture'dan | Ham JSON private depoya; AG'ye tip × metrik tablosu |
| D2 | Eşikler: p75 mobil LCP ≤ 2.5 s (kayıtta var — Tours hedefi, owner canlı site için onaylamalı); INP ≤ 200 ms, CLS ≤ 0.1, TTFB ≤ 800 ms, Lighthouse skoru — **kayıtta yok, öneri**; owner belirler | Eşik satırı `OWNER_GO_LOG.md`'de; PASS/FAIL olduğu gibi |
| D3 | Semrush `site_audit`: kırık/redirect zinciri, hreflang, canonical, çift title/meta, büyük görsel, JS/CSS boyutu — sayfa tipi bazında | Toplu sayılar AG'ye; URL bazlı private'a |
| D4 | Envanter (salt-okunur): aktif plugin listesi + sürümler (WP/PHP/Kadence/Rank Math), cache/minify/görsel-optimizasyon eklentisi var mı, WPCode snippet içeriği, robots.txt, XML sitemap index, canlı hreflang, noindex; Cloudflare plan/cache/APO/Polish/Rocket Loader (owner paneli) — hiçbiri kayıtta yok; "çift plugin" iddiası kanıtsız (04 §2.2) | Sürümlü envanter private depoya; `STACK_INVENTORY=YES` |
| D5 | Görsel teslim: WebP/AVIF sunuluyor mu, `srcset`, lazy-load, en büyük 20 görsel — 2636 attachment'ın dağılımı kayıtta yok (04 §4) | Sprint 9 "image optimization standard" girdisi |
| D6 | Kapsam doldurma (B5) canlıya girmeden **önce** D1 baseline; her batch sonrası **aynı set tekrar** — form JS/CSS yükünün Δ LCP/INP'si. "Eşik aşımı → batch geri alınır" bu paketin **önerisidir**: 05 §4.4 6-şartlı kapı ve §5 R-01 hız kriteri içermez, eşikler owner-onaylı değil (04 §1.3, D2) → geri alma tetikleyicisi ancak owner `SPEED_THRESHOLDS` kararıyla; o zamana kadar ölç + raporla (05 §3 son satır) | Önce/sonra tablosu; tetikleyici kararı `OWNER_GO_LOG.md`'de |

**Dönüş:** `SPEED_*`, `STACK_INVENTORY`; ölçüm yapılamadıysa `SPEED_MEASURED=NO` + hangi kanal kapalı.

### GÖREV E — Rezervasyon durumu kontrolü (03 §1, §3, §7)

**Amaç:** "Rezervasyon durumunu kontrol et" dört anlama gelir; dördü de bugün cevaplanamaz (03 §1).
**Ön koşul:** E-A [JETPACK]; E-B [ERİŞİM YOK] → salt-okunur; E-C [BASELINE]; E-D rapor. **Geri alma:** yok (salt-okunur).

| Anlam | Ne sorgulanır | Kapı |
|---|---|---|
| E-A Formlar rezervasyon alabiliyor mu | 906 URL render edilmiş DOM: form sayısı, engine dağılımı (`none/agsc-v6/ag_home/c6`), iki pilot + 2026-06-21 sayfası hâlâ tam 1 form; SEL-122 kontrol seti (literal 0, konsol 0, taşma 0, eski c6 selector yok) | [JETPACK] |
| E-B Gelen rezervasyonlar nerede, hangi durumda | "Confirm on WhatsApp" CTA'sının tetiklediği n8n webhook **alıcısı**: hangi workflow, aktif mi, ne saklıyor (`MASTER_PROJECT_STATUS.md#L63-70`'teki ID'lerden hiçbiri booking alıcısı olarak işaretli değil); production'da `agp_booking` post tipi var mı (yalnızca yerel fixture'da görülüyor); Master Operations Sheet (45 sütun) **oluşturulmamış** (`agos/AGSYNC_OPS_01_PASS_HOLD_REPORT.md#L40-51`) — sorgulanacak kaynak yok | [ERİŞİM YOK] → salt-okunur |
| E-C Müşteriye onay/voucher gidiyor mu | CLE modülü kaynaktan (tetikleyici, gönderen, alıcılar, şablon, idempotency, voucher eki); `wp_mail()` yüzeyi canlıda aktif mi; `ag-voucher.php` var mı (5 depoda 0) | [BASELINE] |
| E-D Operatör akışı çalışıyor mu | Yalnızca yerel fixture: SEL-155 PASS / SEL-156 CERTIFIED, 14 sentetik satır, Production **NOT READY**, izleme/logging/audit yok — canlıda karşılığı yok | rapor et |

**Asla dokunma:** gerçek rezervasyon/müşteri/sürücü verisi kopyalanmaz, depoya konmaz, test girdisi olmaz; gerçek
WhatsApp/e-posta gönderilmez; n8n workflow'u aktive/import edilmez (WHATSAPP_03, BRIDGE_02 dahil); "WhatsApp Job
Distribution" (bu adla modül kayıtta **yok**; tek "PASS" öz-değerlendirmeli statik kontrol, 03 §6) bağımsız güvenlik denetimi
PASS olmadan hiçbir zaman; Sheet/DB yazımı yok; supplier/driver/müşteri gönderimi her biri **ayrı** OWNER GO. Owner ayrıca
**rezervasyon durum modelini** seçmeli: AGSYNC 10-durum mu, Admin-CMS 6-durum mu (03 §2.2). **Dönüş:** `RESERVATION_STATUS_A..D`, `REAL_DATA_TOUCHED=NO`.

### GÖREV F — Owner'ın kapatması gereken çelişkiler

Hiçbiri sessizce çözülmez; her karar `OWNER_GO_LOG.md`'ye yazılır. Owner beyanı (`CLAUDE.md §4`) kayıtla
çeliştiğinde **§4 geçerlidir** ve kayıt düzeltilir — ama düzeltme yazımı [SERBEST], kabulü [OWNER GO].

| # | Konu | Owner beyanı | Kayıt | Codex ne yapar |
|---|---|---|---|---|
| F1 | TÜRSAB numarası | **2165** (iki kez) | **12892** (`MASTER_PROJECT_STATUS.md#L18`); AGOS 0 geçiş | Tescil belgesiyle doğrula; **ikisi de belgesiz yayımlanmaz**; schema/footer alanı placeholder kalır |
| F2 | Shuttle 3/4 kişi | 60 / 70 | 70 / 80 (`#L23`); D-008 yalnızca 30/50 (`agos/decision-ledger/MASTER-DECISIONS.md#L57-58`); "€30–€80 dinamik" (`#L85`) — dört kayıt dört farklı | **§4 geçerli**; `MASTER_PROJECT_STATUS.md#L23` ve `agos/AG_BOOKING_OWNER_DECISION_CHECKLIST.md#L31-34` §4'e hizalanır |
| F3 | Alanya dışı private taban | `max(50, 50 + max(0, km−30)×0.60)` — dıştaki `max` ölü kod | Yayımlanan "from" fiyatları daha düşük (Belek €43 · Kemer €48 · Side €52 · Manavgat €55 · Alanya €77, `#L23`); formül farkı +€10…+€22 | 50 mi 40 mı teyit; "from €X" snippet'leri ve SEO meta'ları karar gelene kadar değişmez |
| F4 | Dil kapsamı ve mimarisi | EN→TR→DE→RU kademesi; İskandinav + Arapça kararı boş | SEL-191 alt alan adı (`de./ru./pl.`, `tr./ar.` "if needed", **WPML yok**) ↔ platform/CMS kaydı WPML **bugünkü** katman; canlıda İskandinav **12** (11 MUST_HAVE), Kiril RU **47**, AR **17** — 64 kodlu slug'ın 64'ü formsuz; Batch 1'in 58/94'ü EN-dışı; Lehçe için owner beyanı hiç yok (04 §6) | Üç seçenek (kapsama al / olduğu gibi / noindex) × mimari (WPML / alt alan / kademe) → tek karar; hreflang (INTL-02) ve Batch 1'in 58 satırı buna bağlı |
| F5 | Shuttle rota kapsamı · ödeme dizesi · saat dilimi · D-M-Y / Places fallback | yalnızca AYT↔GZP yasağı; "araçta nakit"; diğerleri §4'te **yok** | "Alanya↔Antalya only" (`#L23`) vs genişletilmiş rotalar; "cash or card" (C6); D-M-Y ve Places fallback birincil kayıtta 0 eşleşme (02 §3 satır 8) | Hangi rotalarda "shuttle" seçeneği; tek kelime ödeme teyidi; pickup saati Europe/Istanbul mu; D-M-Y hangi yüzeylerde |
| F6 | Kapsam otoritesi · GO birimi · B-09 sıralaması · "yayına al" kapsamı · Jetpack risk maddeleri · durum modeli · hız eşikleri | karar yok | 05 §3, §4.4; 03 §2.2; 04 §1.3 | B4 ile birlikte tek karar listesi; "yayına al"ın kapsamı (yalnız booking-core mu, kapsam doldurma mı, SEO/dil mi) ayrı ayrı, ortam-adlı GO ister |

---
## 3. Yasaklar (bu paket için — `CLAUDE.md §5` + §6, eksiksiz)

- Production'a deploy — **yok**. Canlı WordPress üzerinde doğrudan geniş kapsamlı düzenleme — **yok**. Full plugin
  overwrite — **yok**. Canlı DB'ye kontrolsüz migration — **yok**. Rank Math, WooCommerce veya booking core'da geniş
  kapsamlı değişiklik — **yok**.
- Gerçek müşteri/sürücü verisi ile test — **yok**. Gerçek WhatsApp veya e-posta gönderimi — **yok** (teslimat testleri
  yalnızca synthetic adreslerle). WhatsApp Job Distribution modülünü aktive etmek — bağımsız güvenlik denetimi **PASS**
  olmadan **yok**. Kapsam dışı AGOS SaaS özelliği eklemek — **yok**.
- Browser API key'i server-side işlemde kullanmak veya anahtarı koda gömmek — **yok**. IP kısıtlı server key yoksa bu bir
  **OWNER BLOCKER** olarak raporlanır (Distance Matrix). Kişisel veriyi analytics payload'ına koymak — **yok**. OWNER GO'suz
  GTM publish — **yok**.
- Yetki/güvenlik kontrolünü atlamak — **yok**. Başarısız testi gizlemek — **yok**. Backend kapasite doğrulamasını
  kaldırmak — **yok**. n8n orchestrator `fjqbCav0JYRFI5w7` pasif kalır.
- Ek (AGOS gate'leri, `agos/AGOS_DECISION_GATES.md#L143-152`): production dosya değişikliği; DB import/export; canlı booking
  submit testi; e-posta/WhatsApp/Sheets/n8n canlı gönderim; slug/permalink/redirect/canonical/sitemap/menü/parent-child/
  Rank Math; medya yükleme/silme; plugin/tema güncelleme; DNS/Cloudflare; cache purge; test kaydı temizliği; toplu
  WPML/medya/post import — her biri **ayrı OWNER GO**.

**"Yayına al" hakkında:** Owner'ın talebi tek başına GO **değildir**; kayıt `deploy`, `make it live`, `go ahead`, `do all`,
`sync everything` ifadelerini açıkça **geçersiz** GO sayar (`agos/AGOS_GOV_01_OWNER_GO_TEMPLATE.md#L71-83`). Yayın yalnızca
`alanyagroup-platform/AI_COMMAND_CENTER/OWNER_GO_LOG.md`'ye yazılmış, ortam adlı (`TARGET_ENVIRONMENT`), tam URL/ID listeli,
backup + rollback + stop-condition içeren açık bir **OWNER GO** kaydıyla (`AI_OPERATING_RULES.md#L4` "No live WordPress mutation without explicit OWNER GO"; 05 §2.1 asgari biçim) ve
her adım sonunda `owner_go → false` ile mümkündür; aksi hâlde **yasaktır**. Dokümantasyon güncellemesi yetki değildir
(`CLAUDE.md#L110`). Kayıt gelse bile bugün erişim yoktur.

**Gizlilik (`CLAUDE.md §6`):** `ALGRP/AG` public'tir. Kaynak kod, kimlik bilgisi, müşteri/sürücü verisi, DB dökümü, host yolu,
DB tanımlayıcısı, WordPress sayfa ID'si, telefon/e-posta, 906 satırlık envanter ve formsuz para sayfalarının **URL bazlı
listesi** AG'ye konmaz — yalnızca toplu sayılar ve sayfa tipleri; URL düzeyi için private fixture yolu gösterilir. Private
depoya commit öncesi secret taraması zorunludur. **Temizlik yapıldı (2026-09-13, bu commit; 05 §6, README §7):**
`ACCESS_STATUS.md#L9` site tanımlayıcısı gizlendi; Mac host yolu public AG'deki dokuz konumdan (`handoff/HERMES_TASK_PACKET_01.md#L92`;
`…RECONCILED…/tools/preflight_baseline_check.sh#L24,#L31` — varsayılan kök kaldırıldı; `…/ABSENT_FILES_MANIFEST.md#L11,#L23`;
`…/README.md#L7`; `…/TASK_STATUS.md#L7,#L13,#L82`; `…/evidence/01_baseline_verification.md#L7-8`) `<MAC_WORKSPACE_ROOT>` ile
değiştirildi. Önceki atıflar (`#L12,L31`; `AGOS-MASTER-STATUS.md#L103`) yanlıştı; private `AGOS-MASTER-STATUS.md#L102` yerel WP
kökünü taşır — private, dokunulmadı. **Codex için kalan görev:** bu paketin dönüşünde ve private commit'lerde aynı kuralı uygula;
yeni bir public dosya yazmadan önce `grep -rn '/Users/'` 0 sonuç vermeli.

---
## 4. Raporlama — dönüş bloğu ve yeri

**Nereye:** URL bazlı, sayfa ID'li, sürümlü, operasyonel her şey → **private** depo (`ALGRP/alanyagroup-platform` →
`reports/CODEX_TASK_PACKET_01_RETURN/`, veya `ALGRP/AGOS` → `sprint/<ID>` branch → PR → Owner merge). Public özet →
`ALGRP/AG` → `handoff/CODEX_RETURN_01.md` (yalnızca aşağıdaki blok + toplu sayılar). Her görev sonrası `CHANGELOG.md` /
`TASK_QUEUE.md` / `RISK_REGISTER.md` güncellenir (`alanyagroup-platform/AI_COMMAND_CENTER/AI_OPERATING_RULES.md#L7-9`).
Ölçülemeyen satıra `NO` / `BİLİNMİYOR` yazılır; tahmin yazılmaz. Spec'te hatalı bulduğun her satırı `DISAGREEMENTS`'a dosya#satır ile yaz.

```
TASK_STATUS=                     REPORTS_REVIEWED=(okunan yollar, §1 sırasıyla)
DISAGREEMENTS=                   (spec'te hatalı bulunan satırlar — dosya#satır)

JETPACK_CONNECTED=               YES|NO   (+ RISK_REGISTER.md/CURRENT_STATUS.md revize commit'i)
SEMRUSH_UNITS=                   YES|NO
NETWORK_ALLOWLIST=               YES|NO   (+ render edilmiş DOM okunabiliyor mu: YES|NO)

BASELINE_SCRIPT_RUN=  BASELINE_SCRIPT_EXIT_CODE=  BASELINE_SCRIPT_OUTPUT=(tam çıktı, kısaltmadan)
BASELINE_COMPLETE=               YES|NO   ABSENT_FILES=   EXTRA_RUNTIME_FILES_FOUND=(phase1-mvp / page-transfer-generic.php / ag-voucher* / agsc-v6 enjektörü)
SOURCE_COMMITTED=  SOURCE_REPO=  SOURCE_BRANCH=  SOURCE_COMMIT=  SECRET_SCAN_RESULT=
BACKUPS_COMMITTED=               YES|NO   (SEL-121 + 2026-06-21 yedekleri private depoda; MANIFEST checksum eşleşti mi)
OWNER_GO_LOG_ENTRIES=            (sayı; geriye dönük 2 + yeni)   OWNER_GO_FORMAT_ADOPTED= (hangi şablon)
OWNER_DECISIONS_RECORDED=        TURSAB= | SHUTTLE_3_4= | NON_ALANYA_BASE= | LANGUAGE_SCAND= | LANGUAGE_AR= | LANGUAGE_ARCH= | COVERAGE_AUTHORITY= |
                                 GO_UNIT= | B09_ORDER= | SHUTTLE_ROUTES= | PAYMENT_STRING= | TIMEZONE= | STATUS_MODEL= | SPEED_THRESHOLDS= | JETPACK_RISK_OVERRIDE=

INVENTORY_RESCANNED=             YES|NO (tarih; 906 → n URL; engine none/agsc-v6/ag_home/c6 = n/n/n/n)   PT_MATRIX_ROWS= n/906 (deterministik n · insan incelemesi bekleyen n)
PAGES_DONE=                      PT01 n · PT02/03 n · PT04 n · PT05 n · PT06 n · PT07/08 n · PT09/10/11 n · PT12 n · sistem n
FORM_COVERAGE=                   Batch1 n/94 · Batch2 n/321 · Batch3 n/51 · Batch4 n/16 · Batch5 n/108  (önce-DOM 0 → sonra-DOM 1)
DOUBLE_FORMS=                    0 (zorunlu) · LITERAL_SHORTCODE= 0 (zorunlu) · AGSC_V6_TOUCHED= NO (zorunlu, Basamak 4'e kadar)
FORM_DONE=                       C1..C6 her biri DONE|PARTIAL|NOT_STARTED (staging|production)   TESTS= n/24 PASS · n FAIL · n NOT_RUN (madde listesi private depoda)
SPEED_MEASURED=                  YES|NO (kanal: Semrush|PSI|CrUX|Lighthouse-Mac)   SITE_AUDIT_ISSUES=(toplu sayılar)
SPEED_p75_MOBILE=                LCP= · INP= · CLS= · TTFB=   (sayfa tipi × metrik tablosu private depoda)   SPEED_BEFORE_AFTER_DELTA=(yoksa N/A)
STACK_INVENTORY=                 YES|NO (WP/PHP/Kadence/RankMath sürümleri, cache eklentisi, Cloudflare, robots/sitemap/hreflang)

RESERVATION_STATUS_A=            (formlar alabiliyor mu: n/906 form var; pilot + 2026-06-21 sayfası n/3 tam 1 form)
RESERVATION_STATUS_B=            (webhook alıcısı: workflow adı | aktif mi | ne saklıyor | BİLİNMİYOR; agp_booking production'da var mı)
RESERVATION_STATUS_C=            (CLE: tetikleyici/şablon/idempotency okundu mu; wp_mail yüzeyi aktif mi; ag-voucher var mı)
RESERVATION_STATUS_D=            (operatör akışı: yerel fixture | canlı yok)    REAL_DATA_TOUCHED= NO (zorunlu)
DEPLOYED=                        NO   (YES yalnızca OWNER_GO_REF= <OWNER_GO_LOG.md kayıt kimliği> ile)
PRODUCTION_CHANGED=              NO|YES(+GO ref, +backup yolu, +rollback provası)   CREDENTIALS_IN_GIT= NO
BLOCKERS=                        NEXT_ACTION_FOR_CLAUDE=
```

`DEPLOYED=YES` ancak `OWNER_GO_REF` dolu, backup private depoda, rollback provası yapılmış ve `owner_go` tekrar false ise
geçerlidir. `TESTS` satırında NOT_RUN sayısı sıfıra inmeden production apply **raporlanamaz**.

---
## 5. Bu oturumun yaptığı iş — Codex için sadık günlük (2026-09-12 → 2026-09-13)

1. **Erişim denemesi (2026-09-12 11:52Z), dört kanal, dördü kapalı** — `ACCESS_STATUS.md#L7-12`: WordPress.com/Jetpack
   bağlayıcısı `site_disconnected` (son güncelleme 2021-08-03); Semrush aboneliği aktif, **API birimi 0** (`domain_overview`,
   `site_audit` reddedildi); doğrudan HTTPS `CONNECT alanyagroup.com:443` → **403 policy denial** (agent proxy, Cloudflare'a
   bile ulaşılamadı); Hermes: iki private depoda 2026-09-03 sonrası birer commit var, ikisi de ortak brifing (2026-09-05),
   **kaynak commit'i yok** (05 §1).
2. **Derin okuma iş akışı:** beş lens (sayfalar/içerik · form UX/UI · rezervasyon operasyonu · SEO/hız/teknik · kapılar/
   sıralama/geri alma), her biri bağımsız okuyucu + ikinci-mercek doğrulayıcı; her iddia `held / corrected / refuted /
   unverified / reader-only`; yalnızca held + corrected spec iddiası oldu, diğerleri kaynak satırı bu oturumda yeniden açılınca
   ve yük taşımayan bağlam olarak kullanıldı. **Refuted: 0/5 bölüm.** Held/corrected: 01 = 3/11 · 02 = 5/7 (bölüm dipnotu
   3/9 — etiketleme farkı) · 03 = 6/8 · 04 = 8/6 · 05 = 4/10.
3. **Yeniden üretilen sayımlar** (private CSV'ler, `python3`, `page_post_id` join; betik `tools/reproduce_counts.py`): 906 satır
   / 905 farklı URL (13 alias; `/gazipasa-transfer/` page+post); engine `none` 699 · `agsc-v6` 192 · `ag_home` 13 · `c6` 2; çift
   form 0, literal shortcode 0, HTTP 200 906/906; formsuz 699 = MUST 466 · SHOULD 124 · NO 92 · EXCLUDE 17; batch
   94/321/51/16/108; NON_EN 178 (MUST içinde 102; Batch 1'de 58/94); AYT↔GZP küme 96/96 ayna, 66/66 aynı otel slug'ı; PT06
   küme 132, PT05 rota 60; yüzde-kodlu RU 47 + AR 17 = 64 (64/64 formsuz); İskandinav 12 (11 MUST_HAVE); `safety-scan.php`
   33 işaret. Artefakt `agbooking_hero_transfer_tour_final.html`: 0 `<form>`, 0 gönderim, 0 fiyat, 0 hizmet sınıfı, provenance 0.
4. **Kayıt taramaları (0 sonuç):** ölçülmüş hız verisi (Lighthouse/CWV/TTFB/CrUX) üç depoda **0**; cache/görsel-optimizasyon
   eklentisi adı **0**; "çift plugin" kanıtı **0**; "WhatsApp Job Distribution" modülü **0**; CLE modülü, `ag-voucher.php` ve
   `ag_hlp` öneki **0**; SEL-121 yedek klasörü üç depoda **0** (`.gitignore` ile kasıtlı); `OWNER_GO_LOG.md` **0 kayıt**
   (kayıtta 2 kullanılmış canlı GO: 2026-06-21, 2026-06-24 SEL-121).
5. **Üretilen dosyalar** (hepsi `ALGRP/AG`, branch `claude/alanyagroup-final-completion-me48z5`; HEAD `96f61d0`):
   `reports/ALANYAGROUP_FULL_SITE_REMEDIATION_SPEC_V1/ACCESS_STATUS.md` (commit `b9200cc`); `01_…` + `02_…` (commit
   `96f61d0`); `03_…`, `04_…`, `05_…`, `README.md`, `tools/reproduce_counts.py` ve bu paket — bu paket yazılırken untracked idi;
   **2026-09-13'te commit `e227147` ile aynı branch'e commit edilip PR #1'e push edildi** (bu satır o commit'ten sonra güncellendi;
   Codex'in okuyacağı sürüm PR #1'dedir, çalışma kopyası değil). `CLAUDE.md` beş depoya dağıtıldı (`5c42a1e`; AGOS
   `0307c9a`, platform `a0e558d`). Her dosya yayın öncesi gizlilik taramasından geçti (e-posta/telefon/host yolu/DB
   tanımlayıcısı/sayfa ID: 0). 04'te iki yanlış satır atfı (L37→L35, L22→L23) düzeltildi. **Tamamlayıcı eleştiri sonrası
   düzeltmeler (2026-09-13, aynı commit):** site tanımlayıcısı ve Mac host yolu (9 public konum) redakte edildi; 05 §2.2'deki
   2026-06-21 slug'ı private atıfla değiştirildi; yanlış satır atıfları düzeltildi (`AI_OPERATING_RULES.md` #L2→#L4, #L5-7→#L7-9;
   CLAUDE.md TÜRSAB #L82/#L87→#L88, fiyat tabanı #L88→#L90; preflight #L12→#L24; AGOS-MASTER-STATUS #L103→#L102); B-09
   canonical-sonra varsayımı, staging "kayıtlı/ayakta" ayrımı, D6 hız tetikleyicisi ve 13 alias'ın batch dağılımı (9/4) görünür
   satır olarak eklendi; `ACCESS_STATUS.md#L16`'ya yetenek≠yetki notu eklendi.
6. **YAPILMADI — açıkça:** hiçbir canlı sayfa okunmadı veya düzenlenmedi; hiçbir form değiştirilmedi; deploy yok; hız ölçümü
   yok; rezervasyon sorgusu yok; müşteri/sürücüye mesaj yok; kimlik bilgisi kullanımı yok; n8n aktivasyonu yok; Jetpack
   reconnect/Semrush birimi/ağ izin listesi owner adına **talep edilmedi**; hiçbir OWNER GO verilmedi veya varsayılmadı;
   `OWNER_GO_LOG.md` değiştirilmedi. **`PRODUCTION_CHANGED=NO`.**
7. **Codex'ten ilk beklenen:** Görev A (dört kilit + GO defteri/yedek onarımı), özellikle A4 baseline çıktısı kısaltmadan;
   paralelde B1–B2 [SERBEST] ve F karar listesinin owner'a sunulması; ardından §4 bloğu. `BASELINE_COMPLETE=YES` + kaynak
   private depoda olana kadar Görev C başlamaz (`CLAUDE.md#L135`); Görev B'nin canlı kısmı Jetpack (veya eşdeğer oturum açık
   yazma kanalı) + ayrı OWNER GO olmadan başlamaz.

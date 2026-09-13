# 05 — Kapılar, Sıralama, Geri Alma

> **Durum (3 satır)**
> 1. **Kayıt ne kuruyor:** "bugün hiçbir şeye erişilemiyor" → "tüm para sayfaları formla canlıda" merdiveni dört owner-tarafı kilit (Jetpack, Semrush, ağ izin listesi, Hermes baseline) + AGOS'un 11 karar kapısı (Gate 0–10) + her canlı dokunuş için ayrı, ortam-adlı **OWNER GO** üzerinden tanımlı; kapsam doldurma 699 formsuz URL'nin 466 `MUST_HAVE_BOOKING` satırı için 5 batch'e bölünmüş. — kaynak: `ACCESS_STATUS.md#L7-19`; `agos/AGOS_DECISION_GATES.md#L34-152`; `agos/AG_BOOKING_PRIORITY_MATRIX.csv` (`priority_group`, `proposed_batch`)
> 2. **Bugün ne yapılabilir:** canlıda **hiçbir şey** — dört erişim kanalının dördü kapalı, `owner_go = false`, `OWNER_GO_LOG.md` boş; sayfa düzenleme, form düzenleme, deploy, hız ölçümü, rezervasyon sorgusu bu oturumdan yapılamaz. — kaynak: `ACCESS_STATUS.md#L7-12, #L23, #L28`; `alanyagroup-platform/AI_COMMAND_CENTER/OWNER_GO_LOG.md#L3`
> 3. **Bu bölüm ne belirliyor:** her basamağın ön koşulu (kapı), basamakların sırası, her basamağın geri alma sınıfı; `AG/CLAUDE.md` §4 kilitli kararlarla çelişen kayıtlar görünür satır olarak işaretli, hiçbiri burada karara bağlanmadı.

Kapı etiketleri (bölüm boyunca): **[ERİŞİM YOK]** bugün bloklu · **[JETPACK]** Jetpack reconnect sonrası teknik olarak mümkün · **[BASELINE]** Hermes kaynağı gerekir · **[OWNER GO]** açık owner GO gerekir · **[SERBEST]** şimdi yapılabilir, yalnızca dokümantasyon.

Canlı siteyle ilgili her ifade **kayıt-türevidir** (2026-06 envanteri + AGOS/platform belgeleri); bu oturum siteye ulaşamadı (`ACCESS_STATUS.md#L3, #L11`). Sayfa ID'leri ve per-URL listeler public depoya konmaz; ilgili yerlerde private fixture yolu verildi (`AG/CLAUDE.md#L116-119`).

---

## 1. Bugünkü kilitler — dört kanal, dördü kapalı (L0-01)

| # | Kilit | Kayıtlı durum | Kimin açacağı | Ne açar | Ne AÇMAZ |
|---|---|---|---|---|---|
| 1 | Jetpack / WordPress.com bağlayıcısı | `site_disconnected`; bağlantının son güncellemesi 2021-08-03 | Owner (WP admin → Jetpack → Reconnect) | `content-authoring` + `site-editing` araçlarıyla sayfa envanteri ve içerik düzenleme **yeteneği** | Yazma **yetkisi** vermez (§2); PHP çalıştıramaz (shortcode kaydı, server-side fiyat) |
| 2 | Semrush API birimi | Abonelik aktif, birim 0 | Owner | Hız/SEO denetimi | Canlı DOM doğrulaması vermez |
| 3 | Ağ izin listesi (konteyner → site) | `CONNECT :443` → 403 (agent proxy) | Owner (ortam ağ politikası) | Proxy egress engelini kaldırır | Cloudflare'ın render edilmiş DOM'a izin vereceğini garanti etmez (§1.2) |
| 4 | Hermes baseline | 2026-09-03 paketinden sonra **kaynak** commit'i yok | Hermes / Owner | Booking-core PHP değişikliklerinin tamamı | Kapsam doldurma GO'sunu vermez (ayrı GO, §4.4) |

— kaynak: `ACCESS_STATUS.md#L7-12, #L14-19`. Hermes kanalı için kesin ifade: iki private depoda 2026-09-03'ten sonra birer commit **var**, ikisi de ortak brifing dosyasıdır (2026-09-05); kaynak commit'i **yoktur**; `ACCESS_STATUS.md#L12`'deki "0 commit" bu anlamda okunmalı. — kaynak: `git -C agos log` (`0307c9a` 2026-09-05; öncesi `f420b0e` 2026-07-11); `git -C alanyagroup-platform log` (`a0e558d` 2026-09-05; öncesi `5c1781b` 2026-06-24)

### 1.1 Kilit sırası kayıtta tek değil — üç çelişki (L0-02, L0-03)

| Konu | `ACCESS_STATUS.md` (bu oturumun ölçümü) | Diğer kayıt | Durum |
|---|---|---|---|
| Jetpack reconnect #1 önceliği, "tek tık" | "en düşük eforla en çok kapı açan" (`#L14-16`) | Owner-doğrulamalı risk kaydı: "Do not connect AI directly to live WordPress before command center is stable" (`alanyagroup-platform/AI_COMMAND_CENTER/RISK_REGISTER.md#L3`); "Do not use Jetpack just for Claude WordPress connection unless needed" (`#L5`); "Jetpack: not needed now" (`CURRENT_STATUS.md#L10`). Hiçbir kayıt Jetpack eklentisinin canlıda kurulu/aktif olduğunu göstermiyor; "tek tık" doğrulanmamış | Reconnect, **iki** risk maddesinin owner tarafından bilinçli aşılmasıdır; `RISK_REGISTER.md` + `CURRENT_STATUS.md` aynı commit'te güncellenmeden yapılmamalı. Reconnect sonrası bile `AG/CLAUDE.md#L96` ("canlı WP'de geniş düzenleme — yok") ve `AI_OPERATING_RULES.md#L4` (OWNER GO şartı) geçerli kalır: **yetenek ≠ yetki**. `ACCESS_STATUS.md#L16`'ya aynı içerikte tarihli not eklendi (2026-09-13) |
| "Her şeyi açan madde" | Jetpack; "diğer üçü bunu beklemez" (`#L19`) | `AG/CLAUDE.md#L128, #L135`: Hermes baseline "her şeyi açan madde", `BASELINE_COMPLETE=YES` gelmeden **uygulama başlamaz** | Uzlaştırılabilir — CLAUDE.md'deki "uygulama" = booking-engine kod uygulaması; ACCESS_STATUS bunu söylemiyor. Bu bölüm CLAUDE.md okumasını esas alır: kod uygulaması **[BASELINE]**, içerik envanteri **[JETPACK]** |
| Kapı sırası | Jetpack → Semrush → ağ → Hermes | Önceki paket: kaynak commit → staging → ağ izin listesi; Jetpack yok, Semrush kapı değil (`AG/reports/ALANYAGROUP_SITE_FINAL_REMEDIATION_V1/EXECUTION_PLAN.md#L19-29`) | ACCESS_STATUS daha yeni ölçümdür ve fiilen öncekini geçersiz kılar, ama bunu söylemez |

Jetpack'in PHP tarafını açamaması **yönetişimsel** bir şarttır, teknik değil: kayıtta PHP'nin WP admin'den WPCode snippet ile eklendiği emsal vardır (`MASTER_PROJECT_STATUS.md#L54`, `register_post_meta`). Bu yol bugün kullanılamaz, çünkü mevcut renderer'ın kaynağı hiçbir depoda yok (`AG/CLAUDE.md` §3), `BASELINE_COMPLETE=YES` gelmeden uygulama başlamaz (§7) ve booking core'da geniş değişiklik yasaktır (§5 `#L98`).

### 1.2 Ağ izin listesi ≠ DOM doğrulaması (L0-04)

Kayıt, Cloudflare'ın dış/otomatik fetch'leri ve render edilmiş HTML okumalarını engellediğini, yalnızca oturum açık aynı-origin REST ve public `/wp-json` GET'lerinin çalıştığını söyler (`alanyagroup-platform/AI_COMMAND_CENTER/MASTER_PROJECT_STATUS.md#L55, #L106`) — **ancak** aynı tarihli (2026-06-24) SEL-123 kaydı bununla çelişir: 906 URL'nin tamamı oturumsuz public HTML GET ile çekilmiştir (`agos/AG_BOOKING_COVERAGE_SUMMARY.md#L28, #L42`; `agos/AG_BOOKING_COVERAGE_INVENTORY.csv` `http_status` 906/906 = 200, `evidence_source` 899/906 "SEL-123 public HTML selector scan"). Daha doğru ifade `agos/AG_ADMIN_CMS_01_CURRENT_STATE_AUDIT.md#L42`'dedir: "Cloudflare bazı dış fetch'leri engeller".

Sonuç değişmez: ağ izin listesi yalnızca **proxy egress** engelini kaldırır (`ACCESS_STATUS.md#L11`). 906'lık sayım **statik HTML seçici taraması**dır, render edilmiş tarayıcı DOM'u değil; render kanıtı yalnızca SEL-120/121/122 overlay satırlarında (~7 satır) vardır (`agos/AG_BOOKING_OPTION_B_PREFLIGHT_01.md#L88`; `agos/AG_BOOKING_OPTION_B_PILOT_MONITOR_01_REPORT.md#L32-36`). Bu bölümdeki her "önce-DOM / sonra-DOM" kapısı **oturum açık, render edilmiş tarayıcı** ister; `ACCESS_STATUS.md#L18`'in ağ izin listesini "DOM doğrulaması" için yeterli sayması kayıtla örtüşmez.

---

## 2. Yetki mekanizması — OWNER GO

**Tek yetki OWNER GO'dur.** Dokümantasyon güncellemesi yetki değildir; `owner_go=false` varsayılandır. — kaynak: `alanyagroup-platform/AI_COMMAND_CENTER/AI_OPERATING_RULES.md#L4` ("No live WordPress mutation without explicit OWNER GO"); `RISK_REGISTER.md#L9`; `AG/CLAUDE.md#L110` (G-01)

**Owner'ın "yayına al" talebi tek başına GO değildir.** Kayıt `go ahead`, `continue`, `deploy`, `fix it`, `do all`, `make it live`, `sync everything` ifadelerini açıkça **geçersiz** GO olarak listeler. — kaynak: `agos/AGOS_GOV_01_OWNER_GO_TEMPLATE.md#L71-83`; `agos/AGOS_GOV_01_EVIDENCE_GATE.md#L136-143`; `agos/AG_BOOKING_OPTION_B_OWNER_GO_TEMPLATE.md#L77-87` (G-03). Talep (`ACCESS_STATUS.md#L4`) ile `AG/CLAUDE.md#L96` ("Production'a deploy — yok") doğrudan çakışır; tek çözüm `OWNER_GO_LOG.md`'ye aşağıdaki biçimde bir kayıttır — **ve** kayıt gelse bile bugün erişim yoktur (`ACCESS_STATUS.md#L28`).

### 2.1 GO biçimi — kayıtta en az beş rakip şablon (G-02, G-04)

| Şablon | Alan sayısı | Kapsam birimi | Kaynak |
|---|---|---|---|
| AGOS-GOV-01 | `OWNER GO:` başlık satırı + 10 alan = 11 satırlık blok (`SPRINT / TARGET_ENVIRONMENT / ALLOWED_ACTIONS / FORBIDDEN_ACTIONS / BACKUP_REQUIRED / ROLLBACK_REQUIRED / LIVE_SENDS_ALLOWED / DB_IMPORT_EXPORT_ALLOWED / STOP_CONDITION / EXPECTED_OUTPUT`) | dosya listesi ("Production File Apply" örneği: `TARGET_ENVIRONMENT: www.alanyagroup.com production only`, yalnızca listelenen dosyalar, backup zorunlu, tam rollback dosyaları, canlı gönderim kanal bazında ayrı, stop = lint+proof+PASS/HOLD) | `agos/AGOS_GOV_01_OWNER_GO_TEMPLATE.md#L7-19, #L55-68` |
| AGOS-GOV-01 sınır soruları | 8 soru (production, staging, live sends, DB, medya, redirect/canonical, cleanup/delete, stop) — biri cevapsızsa **HOLD** | — | aynı dosya `#L85-98` |
| AGCP-01 | 18 alan (+ `OWNER_GO_ID`, `MEDIA_UPLOAD_DELETE_ALLOWED`, `REDIRECT_CANONICAL_ALLOWED`, `CLEANUP_DELETE_ALLOWED`, `APPROVED_BY/AT`, `EXPIRES_AT`, `PROOF_PATH`); production için expiry + proof path | dosya | `agos/AGCP_01_OWNER_GO_CENTER.md#L18-39, #L99-122` |
| Evidence gate "valid wording" | 6 öğe, tek satır düzyazı | — | `agos/AGOS_GOV_01_EVIDENCE_GATE.md#L119-143` |
| Booking Option B | booking'e özel; "rollback immediately if verification fails" | URL + sayfa ID | `agos/AG_BOOKING_OPTION_B_OWNER_GO_TEMPLATE.md#L29-75` |
| Batch plan / Decision 01 | 6 madde (URL+ID listesi, eylem sınıfı, shortcode/config, backup+rollback artefakt adı, önce/sonra DOM) / 8 madde; "stop after any mismatch" | URL + ID; **"one page per GO"** | `agos/AG_BOOKING_COVERAGE_BATCH_PLAN.md#L194-203`; `agos/AG_BOOKING_OWNER_DECISION_01.md#L181, #L217, #L228-239` |

Tutarsızlıklar: GOV-01'in 10 alanı medya/redirect/cleanup sorularına özel slot vermez, oysa aynı dosya `#L93-95` bunların ayrı cevaplanmasını şart koşar — cevaplar ancak `FORBIDDEN_ACTIONS` içine yazılırsa (`#L57` örneğinde olduğu gibi) `#L98` HOLD'undan kurtulur; bunu zorunlu kılan bir cümle yok. `agos/governance/CAPABILITY-TIERS.md#L21` (dondurulmuş SoT) production için eylem başına **token** + **önceden prova edilmiş rollback** ister; hiçbir şablonda token alanı yok. `agos/AGOS_DECISION_GATES.md#L117-127` (Gate 9) **bakım penceresi** ister; şablonlarda yok. Owner-doğrulamalı platform kaydı (`AI_OPERATING_RULES.md#L4`) yalnızca "explicit OWNER GO" der, biçim bağlamaz; kullanılan iki GO da (§2.2) GOV-01 alan biçiminde değil, URL-kapsamlı onay olarak kayıtlıdır. **Hangi biçimin `OWNER_GO_LOG.md` için bağlayıcı olduğu kayıtta çözülmemiş.**

Bu bölümün **asgari** önerisi (karar değil, birleşim): AGCP-01'in 18 alanı (GOV-01'in 10'unu ve 8 sınır sorusunu kapsar) + Batch plan'ın URL/ID listesi + Gate 9 bakım penceresi + GOV-01 `#L66` stop condition'ı (`lint, proof, PASS/HOLD`) + CAPABILITY-TIERS token/prova şartı.

### 2.2 GO log — 0 kayıt, 2 kullanılmış GO (G-05, G-07)

`OWNER_GO_LOG.md` 3 satırdır, 0 kayıt içerir ("No live WordPress OWNER GO given for this setup yet"), son değişiklik `5c1781b` 2026-06-24. — kaynak: `alanyagroup-platform/AI_COMMAND_CENTER/OWNER_GO_LOG.md#L1-3`; `git log -- OWNER_GO_LOG.md`

Oysa kayıt iki canlı mutasyon emsali gösterir; ikisi de log'da yoktur:

| Emsal | Tarih | Kapsam | Sonuç | Kaynak |
|---|---|---|---|---|
| İlk canlı mutasyon | 2026-06-21 | 1 sayfa (bir transfer-booking landing; URL ve sayfa ID private kayıtta: `MASTER_PROJECT_STATUS.md#L48`): literal `[ag_transfer_booking_form]` → `[ag_home_booking]` | tek form doğrulandı, backup+rollback kaydedildi, `owner_go` hemen false | `alanyagroup-platform/AI_COMMAND_CENTER/MASTER_PROJECT_STATUS.md#L48` |
| SEL-121 pilot | 2026-06-24 | 2 onaylı sayfa (1 otel-transfer + 1 tur; URL/ID'ler private raporda), yalnızca REST `content` alanı; eklenen blok `<!-- wp:shortcode -->[ag_home_booking context="transfer_landing" default_service="transfer" layout="compact"]<!-- /wp:shortcode -->` | önce-DOM 0 → sonra-DOM tam 1 `ag_home` formu, literal yok, verdict PASS; SEL-122 desktop+mobil monitor PASS | `agos/AG_BOOKING_OPTION_B_APPLY_01_REPORT.md#L3-14, #L36-42, #L62-69, #L80, #L98-115`; `agos/AG_BOOKING_OPTION_B_PILOT_MONITOR_01_REPORT.md#L53-56` |

Owner-doğrulamalı hafıza SEL-121'i **kaydetmemiştir**: `OWNER_GO_LOG.md#L3` "hiç GO verilmedi" der; `MASTER_PROJECT_STATUS.md#L50` kapsam doldurmayı hâlâ "pending separate OWNER GO" listeler; `CHANGELOG.md` 2026-06-24 bloğu SEL-119'da biter; `AG/reports/ALANYAGROUP_SITE_FINAL_REMEDIATION_V1/EXECUTION_PLAN.md#L46` aynı 1 otel + 1 tur pilotunu "henüz yapılacak ilk adım" sayar. Raporun `[ag_home_booking]` için kullandığı "canonical" etiketi de §4 ile çelişir (§3). **Sonuç:** kayıt kendi içinde tutarsız; bu bölüm SEL-121'i **yapılmış** kabul eder (DOM kanıtı var), log'a geriye dönük kaydı owner'a bırakır.

---

## 3. Owner kararları vs kayıt — görünür çelişkiler

`AG/CLAUDE.md` §4 (`#L65-90`) geçerlidir. Aşağıdaki satırların hiçbiri burada çözülmedi; yalnızca işaretlendi.

| Konu | Owner kararı (§4) | Kayıt | Durum |
|---|---|---|---|
| Canonical shortcode | `[ag_booking_engine]` → `ag_hlp_render_booking_engine()`; `[ag_home_booking]`, `[ag_transfer_booking_form]`, `[agp_booking_engine]` **geçici alias** (`#L69-71`) | `agos/AG_BOOKING_OPTION_B_APPLY_01_REPORT.md#L25, #L84` ve `MASTER_PROJECT_STATUS.md#L39, #L47` `[ag_home_booking]`'i "canonical" sayar; `MASTER_PROJECT_STATUS.md#L40` ve `agos/AG_BOOKING_OWNER_DECISION_CHECKLIST.md#L31-34` `[ag_transfer_booking_form]`/`[agp_booking_engine]` için "fictional, do not use" der; `SITE_FINAL…/EXECUTION_PLAN.md#L12` hâlâ `ag_home_booking` onayı ister | **Owner kararı geçerli.** SEL-121'de eklenen dize alias olarak okunur; checklist maddeleri "yeni yerleşim değil, yalnızca alias" olarak yeniden yazılmalı. `ag_hlp_render_booking_engine` adı AGOS/platform kayıtlarında CLAUDE.md dışında geçmez |
| Canlı shortcode varyantı | (belirtilmemiş) | `MASTER_PROJECT_STATUS.md#L40` canlı "real shortcode form"u `context="single_hero" … layout="hero"`; SEL-121 `transfer_landing`/`compact` ekledi | İki varyant canlıda; kapsam doldurma standardı **açık** |
| Shuttle 3/4 kişi | 60 / 70 (`#L72`) | 70 / 80 (`MASTER_PROJECT_STATUS.md#L23`); ayrıca shuttle "Alanya↔Antalya only" | **Owner kararı geçerli**; kayıt güncellenmeli |
| TÜRSAB | 2165 (`#L88`) | 12892 (`alanyagroup-platform`) | Hermes Görev 2 doğrulayacak; ikisi de yayımlanmaz |
| Alanya dışı fiyat tabanı | `max(50, 50 + …)` (`#L90`) | yayımlanan "from" fiyatları daha düşük; taban ölü kod | Hermes Görev 3 |
| Kapsam doldurma sıralaması (B-09: alias-önce / canonical-sonra) | **karar yok** | Bu bölümün merdiveni (adım 10–13 → 14), README §3 (basamak 2 → 3) ve Codex paketi §2 "Sıra bağlayıcıdır: A → … → C → B'nin canlı kısmı" **canonical-sonra**yı varsayılan olarak gömer; §4.4 ve Codex F6/B4 aynı sıralamayı **açık owner kararı** sayar | **Açık — varsayım görünür kılındı** ("Uygulama adımları" altındaki not); owner `B09_ORDER` verene kadar hiçbir dal bağlayıcı değil |
| Hız Δ'sı batch geri alma tetikleyicisi mi | **karar yok** (hız eşikleri owner-onaylı değil, 04 §1.3) | Codex paketi D6 "eşik aşımı → batch geri alınır" der; §4.4 6-şartlı kapı ve §5 R-01 hız şartı içermez | **Açık** — D6 öneri olarak işaretlendi; `SPEED_THRESHOLDS` kararıyla birlikte owner belirler |
| Kapsam otoritesi (şablon/post-type injection mi, sayfa başı shortcode mu) | **karar yok** | `agos/AG_BOOKING_OWNER_DECISION_01.md#L71-74, #L206` injection'ı *öneriyor*; `SITE_FINAL…/EXECUTION_PLAN.md#L13` (0.2) owner kararı bekliyor; `AG/CLAUDE.md` §7 (`#L123-135`) ve `HERMES_TASK_PACKET_01.md#L242-255` bunu hiç listelemiyor | **Açık.** 384 sayfa = 1 mühendislik release'i mi, 384 içerik düzenlemesi mi; rollback sınıfı R-02 mi R-01 mi — bu karara bağlı. Core booking uygulamasının kapısı **değil**, yalnızca kapsam doldurmanın kapısı |

Karar çerçevesi ve numaralama (L2-01, L2-02): `SITE_FINAL_REMEDIATION_V1/EXECUTION_PLAN.md#L8-16` "beş bloklayıcı owner kararı" (0.1 canonical, 0.2 kapsam otoritesi, 0.3 fiyat, 0.4 TÜRSAB, 0.5 İskandinav+Arapça) çerçevesi **aşılmıştır**: 0.1 §4 ile kilitli; 0.3 yarı-kilitli (shuttle fiyatları `#L72`, yalnızca taban açık `#L90`); `AG/CLAUDE.md` §7 ve Hermes paketi (`#L242-255`) uygulama-öncesi kapıyı **dört** Hermes maddesi olarak tanımlar. Hermes paketi 0.x etiketi kullanmaz — SITE_FINAL numaralaması altında eşleme 0.4→Görev 2 (`#L125`), 0.3→Görev 3 (`#L141`), 0.5→Görev 4 (`#L167`); 0.2 **hiçbir göreve bağlı değil** (`#L254` yalnızca "ayrı OWNER GO" der). `FINAL_COMPLETION_V1/EXECUTION_PLAN.md#L14-18` aynı kararları farklı numaralar (0.2 TÜRSAB, 0.3 fiyat, 0.4 formül tabanı, 0.5 yalnız Arapça); 0.x anıldığında şema adı verilmeli.

---

## 4. Merdiven — basamaklar ve her birinin kapısı

### 4.1 Basamak 0 — Hermes baseline **[BASELINE]** (L1-01, L1-02)

| Öğe | Şart | Kaynak |
|---|---|---|
| Betik | salt-okunur `preflight_baseline_check.sh`, Mac'te; exit 0 = `BASELINE_COMPLETE=YES` (devam), 1 = eksik (**DUR**), 2 = kök bulunamadı | `AG/reports/ALANYAGROUP_RECONCILED_BOOKING_CANDIDATE_V1/tools/preflight_baseline_check.sh#L26-29, #L54-56, #L135-149` |
| Zorunlu 6 öğe | 4 runtime dosyası (`ag-booking-core.php`, `ag-booking-component-v1.php`, `ag-home-booking-shortcode.php`, `ag-homepage-live-pilot/plugin.php`) + `ag_hlp_render_booking_engine()` + CLE modülü | aynı betik `#L91-97, #L105-121` |
| Örtük 7. şart | ROOT altında (maxdepth 3) ad kalıbıyla (`*production*pull*|*prod*pull*|*live*pull*|*production*`) bulunan production-pull klasörü; kalıba uymayan tam pull bile exit 1 | `#L60-61, #L135` |
| Paket modu | `READ_ONLY + PRIVATE_REPO_COMMIT`; `PRODUCTION_WRITE=NO`, `DEPLOYMENT=NO`, `owner_go=false` | `AG/handoff/HERMES_TASK_PACKET_01.md#L7-9` |
| Teslim (Görev 1B) | **3** mu-plugin dosyası + `ag-homepage-live-pilot/` klasörünün tamamı + CLE modülü → **yalnızca private** depo (`ALGRP/AGOS` veya `ALGRP/alanyagroup-platform`), public `ALGRP/AG`'ye asla; commit öncesi API anahtarı / SMTP-WhatsApp kimlik / DB dump / müşteri-sürücü verisi taraması; teslim = depo, branch, SHA, dosya listesi | `AG/handoff/HERMES_TASK_PACKET_01.md#L106-121`; `AG/CLAUDE.md#L121, #L135` |

**Zorunlu dosya kümesi kayıtlar arasında tutarsız** — YES gelse bile eksik kalabilecek öğeler:

| Kayıt | Küme | Fark |
|---|---|---|
| `agos/master-status/AGOS-MASTER-STATUS.md#L104` (betiğin kontrol ettiği) | 4 dosya (yukarıdaki) | referans |
| `agos/AGOS_MASTER_ROADMAP_2026_V2.md#L174-177` "current proven files" | + `ag-platform-phase1-mvp.php`, + child theme `page-transfer-generic.php` | betik bunları **kontrol etmez**; paket bunları **istemez** |
| `agos/architecture/AGOPS-ARCHITECTURE.md#L39` | yalnızca 3 dosya; `ag-homepage-live-pilot/plugin.php` yok | betik onu **bloklayıcı** sayar |
| `AGOS-MASTER-STATUS.md#L105` voucher runtime | `ag-voucher.php`, `ag-voucher/` | betik "related, not blocking" sayar (`#L99-102`) |

Ek kapı: Hermes `ALGRP/AGOS`'u seçerse o deponun git yönetişimi devreye girer — `sprint/<ID>` branch → PR → **Owner merge**, secret + sensitive-file taraması. — kaynak: `agos/docs/git/BRANCH-STRATEGY.md#L5-7, #L20`; `agos/docs/git/PULL-REQUEST-RULES.md#L20`. Paket yalnızca "commit et" der (`#L106-121`); `alanyagroup-platform`'da eşdeğer kural yok; `AI_WORKFLOW_PROTOCOL.md#L2` shared memory olarak `alanyagroup-platform`'u gösterir.

**Geri alma:** Basamak 0'ın üretimde artifact'ı yok; geri alma = PR'ı merge etmeden kapatmak / commit revert (R-05).

### 4.2 Basamak 1 — booking-core uygulaması **[BASELINE] → [OWNER GO]**

`BASELINE_COMPLETE=YES` + kaynak private depoda ⇒ §4 kararları koda uygulanır: canonical + 3 alias aynı renderer'a, opsiyonel e-posta (UI/backend/API tutarlı), koltuk seçimi kaldırılır + kapasite doğrulaması backend'de korunur, server-side fiyat otoritesi (1=30 · 2=50 · 3=60 · 4=70 · 5=80 · 6=90), AYT↔GZP iki yönde **server-side** red (private/VIP hariç), CLE regresyonsuz + çift voucher engeli; ardından 24 testlik matris. — kaynak: `AG/CLAUDE.md#L69-84, #L156-161`; `AG/handoff/HERMES_TASK_PACKET_01.md#L242-253`

Sıra **staging → production**, hiçbir zaman doğrudan production:

| Alt basamak | Kapı | Kayıtlı durum | Kaynak |
|---|---|---|---|
| 1a Staging upload + lint (`app.alanyagroup.com`) | Gate 2 | PASS for staging upload rehearsal; **HOLD for production** | `agos/AGOS_DECISION_GATES.md#L34-46` |
| 1b Staging QA (site health, PHP lint, booking dry-run, admin display, no duplicate booking, no live notification, critical pages render) | Gate 8 | dosyalar yüklendi ve lint'lendi; **full staging QA HOLD** | `#L103-115` |
| 1c Production rehearsal (dosya backup planı, DB varsa DB backup planı, rollback paketi, **bakım penceresi**, OWNER GO metni, stop condition) | Gate 9 | **HOLD** | `#L117-127` |
| 1d Cutover (tüm alanlarda staging PASS, 301/404 haritası, Cloudflare/DNS checklist, **test edilmiş/prova edilmiş** production rollback, OWNER GO) | Gate 10 | **HOLD** | `#L129-140` |

Staging kanıtı asla production hazırlığı sayılmaz ("Never mark production READY from local or staging-only proof"); production kendine özgü backup, rollback, stop condition ve açık GO ister. — kaynak: `agos/AGOS_GOV_01_EVIDENCE_GATE.md#L117, #L168-183`. Roadmap kapısı aynı: staging test bookings PASS + rollback proof + owner live-apply onayı olmadan production booking patch yok. — kaynak: `agos/AGOS_MASTER_ROADMAP_2026_V2.md#L179-185`

**Staging çelişkisi:** AGOS `app.alanyagroup.com`'u izinli staging hedefi olarak kaydeder (`AGOS_GOV_01_EVIDENCE_GATE.md#L170`; `AGOS_MASTER_ROADMAP_2026_V2.md#L44`); AG paketleri "staging kayıtlı değil" der (`SITE_FINAL…/TASK_STATUS.md#L131` B3'; `FINAL_COMPLETION_V1/BLOCKERS_AND_CONFLICTS.md#L22` B5). Bugün ayakta olup olmadığı bu ortamdan doğrulanamaz. **Bölümler arası fark (görünür):** 04 §1.4 ve Codex paketi §1-C(vi) kayıt-içi önceliği AGOS'a verir ("daha geç ve daha özgül — üstün sayılır"); bu bölüm ve README §4 aynı çelişkiyi **açık** tutar. İki okuma çelişmez ama aynı şeyi söylemez: AGOS kaydı "staging *kayıtlı*" sorusunu kapatır, "staging *ayakta*" sorusunu kapatmaz — ikincisi Codex A3/D4'te doğrulanır; owner kararı gerekmez, ölçüm gerekir.

Barındırma kısıtı: booking core `ag-platform-v2-admin-cms` içinde yaşayamaz — `bin/safety-scan.php` 33 yasaklı işaret arar (`add_shortcode`, `do_shortcode`, `wp_mail`, `wp_remote_post`, `register_rest_route`, `wp_ajax_`, `$wpdb->`, `update_option` …) ve biri görülürse `HOLD` + exit 1; `Environment_Guard::ALLOWED_TYPES` yalnızca `local/development/staging`, production'da `mode=READ_ONLY`, `owner_go=false` sabit. Booking core **ayrı mu-plugin/plugin** olmak zorundadır. — kaynak: `agos/ag-platform-v2-admin-cms/bin/safety-scan.php#L6-40, #L78-86`; `includes/class-environment-guard.php#L7, #L22-25, #L31-39`

**Geri alma:** R-02 (şablon/plugin sınıfı, §5); production'da R-Prod.

### 4.3 Basamak 1' — canlı gönderim kanalları **[OWNER GO] × kanal**

Müşteri/operatör e-postası, WhatsApp, SMS, Sheets, n8n webhook, CRM/API yazımı varsayılan **dry-run/capture**; her kanal ayrı GO. SMTP/WhatsApp/AI anahtarları owner'da bloklu, yalnızca n8n Credentials UI'da girilir, sohbete/git'e girmez; Workflow B ve C bu yüzden kurulmamış. n8n orchestrator pasif kalır. WhatsApp Job Distribution için bağımsız güvenlik denetimi PASS artifact'ı kayıtta **yok** → bu modül merdivenin hiçbir basamağında açılmaz. — kaynak: `agos/AGOS_GOV_01_EVIDENCE_GATE.md#L185-199`; `AG/CLAUDE.md#L99-101, #L108`; `MASTER_PROJECT_STATUS.md#L70, #L107`; `TASK_QUEUE.md#L15-19`

### 4.4 Basamak 2 — kapsam doldurma **[OWNER GO] (ayrı GO) + [JETPACK] veya eşdeğer yazma kanalı**

Booking-core'dan **bağımsız** iş paketi; ayrı OWNER GO ister. — kaynak: `AG/CLAUDE.md#L43`; `HERMES_TASK_PACKET_01.md#L254-255`

Backlog (private fixture `agos/AG_BOOKING_PRIORITY_MATRIX.csv`, bu oturumda `python3` ile yeniden sayıldı; sütunlar `priority_group`, `proposed_batch`, `page_type`, `language_scope_note`, `priority_score`; root kopya ile `ag-platform-v2-admin-cms/fixtures/` kopyası byte-özdeş):

| Grup / batch | Satır | Sayfa tipi | İngilizce olmayan / encoded (WPML incelemesi ister) |
|---|---:|---|---:|
| `MUST_HAVE_BOOKING` toplam | **466** | 442 post + 24 page | 102 |
| · Batch 1 — Top revenue (havalimanı/shuttle/VIP intent) | 94 | | **58** |
| · Batch 2 — Hotel transfer pages | 321 | | 39 |
| · Batch 3 — Tours & activities | 51 | | 5 |
| `SHOULD_HAVE_BOOKING` (Batch 4 destination guides 16 + Batch 5 optional 108) | 124 | | |
| `NO_BOOKING_NEEDED` | 92 | | hiç form almaz |
| `EXCLUDE_SYSTEM` | 17 | | hiç form almaz |
| **Toplam formsuz** | **699** | | **178** |

**Alias düzeltmesi (01 §1 ile tutarlılık):** 699 formsuz satırın **13'ü alias**tır (inventory `final_url ≠ url`; 13/13 `post`, `dfc=0`). `page_post_id` join'iyle dağılımı: **Batch 1'de 9, Batch 3'te 4**, diğer batch'lerde 0; 13 alias hedefinin 3'ü zaten formlu, 10'u formsuz bir envanter satırına gider (bu oturumda `python3` ile sayıldı, `tools/reproduce_counts.py` "alias rows" satırı). Yukarıdaki batch boyutları (94/321/51/16/108) alias **düşülmeden** kayıttaki hâliyle verilmiştir; GO listesi hazırlanırken alias satırları düşülür → düzenlenecek sayfa **Batch 1 ≤ 85, Batch 3 ≤ 47** (hedef sayfa kendi satırıyla zaten listede). Codex B5 ve README §2/§3 aynı ham sayıları taşır; bu not her üçü için geçerlidir.

— kaynak: `agos/AG_BOOKING_BATCHES.md#L13, #L17, #L80, #L143, #L205, #L232, #L295, #L356-358`. Batch 1'in 94 satırının 6'sı `priority_score` 106 (havalimanı-transfer / rota / shuttle intent; ör. `/alanya-airport-transfer/`, `/shuttle-transfer/`), 88'i 100. — kaynak: `AG/reports/ALANYAGROUP_SITE_FINAL_REMEDIATION_V1/BOOKING_ENGINE_MATRIX.md#L61-69`. Para-sayfası tanımıyla (regex, `analyze_booking_coverage.py#L10`) 587 para sayfasının 384'ü formsuz. — kaynak: `SITE_FINAL…/evidence/01_booking_coverage_analysis.txt`. Per-URL liste public depoya **konmaz**; private fixture'a bakınız.

**Batch 1'in 58 satırı İngilizce değil → Hermes Görev 4 (dil kapsamı) yalnızca hreflang'ın değil, Batch 1'in de ön koşuludur.** — kaynak: `agos/AG_BOOKING_BATCHES.md#L13`; `HERMES_TASK_PACKET_01.md#L167`

Her batch için **aynı kapı** (batch'ler icra için onaylı değil — `AG_BOOKING_BATCHES.md#L7-9`):

| # | Şart | Kaynak |
|---|---|---|
| 1 | Envanter yenilemesi: 2026-06 nokta-zaman verisi; ilgili URL'lerde preflight DOM sayımı **her mutasyondan önce** tekrar | `BOOKING_ENGINE_MATRIX.md#L16-17`; `SITE_FINAL…/EXECUTION_PLAN.md#L36-38`; `agos/AG_BOOKING_OWNER_DECISION_01.md#L199-203` |
| 2 | Tam OWNER GO URL + ID listesi, ID çözümü, eylem sınıfı, kullanılacak shortcode/config dizesi, backup+rollback artefakt adları | `agos/AG_BOOKING_BATCHES.md#L21`; `agos/AG_BOOKING_COVERAGE_BATCH_PLAN.md#L194-203` |
| 3 | Önce-DOM: kapsam doldurmada **tam 0** form (migrasyonda tam 1 eski form) | `BATCH_PLAN.md#L201`; `agos/AG_BOOKING_OPTION_B_OWNER_GO_TEMPLATE.md#L65-72` |
| 4 | Yalnızca REST `content` alanı; Rank Math, slug, permalink, canonical, menü, redirect, WhatsApp, n8n, DB, cache purge **yok** | `agos/AG_BOOKING_OPTION_B_ROLLBACK_PLAN.md#L44`; `APPLY_01_REPORT.md#L80` |
| 5 | Sonra-DOM: HTTP 200, **tam 1** hedef form, literal shortcode yok, çift form yok; başarısızsa **derhal rollback** | `BATCH_PLAN.md#L202`; `OPTION_B_OWNER_GO_TEMPLATE.md#L65-72` |
| 6 | `owner_go` false'a sıfırlanır; tarihli rapor | `agos/AG_BOOKING_BATCHES.md#L21` |

Bu altı şartta **hız kriteri yoktur**; §5 R-01'de de yoktur. Codex paketi D6 her batch sonrası hız Δ'sını ölçmeyi ve "eşik aşımı → batch geri alınır" kuralını **önerir** — eşikler owner-onaylı olmadığından (04 §1.3, D2) bu 7. şart olarak ancak owner `SPEED_THRESHOLDS` kararıyla eklenir; o zamana kadar D6 ölçüm + rapor, geri alma tetikleyicisi değil (§3 tablosu, son satır).

**Asla:** 192 `agsc-v6` şablon sayfasına içerik shortcode'u eklenmez — zaten form render ediyorlar, Option C'ye ayrılmışlar; kapsam doldurmanın baskın riski **var olmayan çift-form durumunu yaratmaktır** (bugün 0/906). — kaynak: `agos/AG_BOOKING_COVERAGE_BATCH_PLAN.md#L63-67`; `BOOKING_ENGINE_MATRIX.md#L144-146`; `SITE_FINAL…/EXECUTION_PLAN.md#L62-63`; `agos/AG_BOOKING_COVERAGE_INVENTORY.csv` `distinct_form_count` (0: 699, 1: 207)

**Sıralama kararı (açık):** kilitli canonical `[ag_booking_engine]` production'da kayıtlı değil — booking-core apply'dan (Basamak 1) önce herhangi bir sayfaya eklenirse **literal metin basar**. Bugün canlıda kayıtlı ve SEL-121'de kanıtlanmış çalışan dize alias `[ag_home_booking …]`'dir. Kapsam doldurma Basamak 1'den **önce (alias ile)** mi, **sonra (canonical ile)** mi — owner sıralama kararı. — kaynak: `SITE_FINAL…/FINDINGS_AND_CONFLICTS.md#L64-67`; `RECONCILED…/TASK_STATUS.md#L39-46`; `APPLY_01_REPORT.md#L29-42`

**GO birimi (açık):** kayıt hem "one page per GO" (`agos/AG_BOOKING_OWNER_DECISION_01.md#L181`; `SITE_FINAL…/EXECUTION_PLAN.md#L65`; `ROLLBACK_PLAN.md#L21` "One target scope per GO") hem batch başına tek "tam URL/ID listesi" (`BATCHES.md#L21`) der. Sayfa-başı GO = 466 GO; owner birimi belirtmeli.

**Geri alma:** R-01 (sayfa içeriği) — kapsam otoritesi "şablon/post-type injection" olursa R-02.

### 4.5 Basamak 3 — c6 migrasyonu **[OWNER GO] + [BASELINE]**; Basamak 4 — `agsc-v6` standardizasyonu **[OWNER GO] + [BASELINE]**

Kapsam, migrasyon ve şablon standardizasyonu **asla tek canlı işlemde birleştirilmez**. Sıra: pilot (yapıldı, §2.2) → kapsam batch'leri → c6 migrasyonu (2 sayfa, GO başına bir sayfa, önce `/alanya-transfer/` sonra `/antalya-alanya-transfer/`, herhangi bir uyumsuzlukta dur) → **en son ve tek başına** `agsc-v6` standardizasyonu (192 URL tek şablon arkasında = en yüksek blast radius; A/B sonuçları stabil olana kadar HOLD). — kaynak: `agos/AG_BOOKING_OWNER_DECISION_01.md#L183, #L214-221`; `SITE_FINAL…/EXECUTION_PLAN.md#L46-50, #L64`

c6 migrasyonu ön koşulu: önce tam 1 eski c6 formu **ve** şablon formu olmadığı doğrulanır; onaylı canonical string **kaynaktan** alınır, tahmin edilmez → Basamak 1'e bağımlı. — kaynak: `agos/AG_BOOKING_OPTION_B_ROLLBACK_PLAN.md#L73-92`. 192 URL'ye `#agsc-v6-form`'u hangi dosyanın enjekte ettiği kayıtta **dosya adıyla yok** → Basamak 4 dosya kimliği bulunmadan başlayamaz.

### 4.6 AGOS Gate 0–10 — kayıtlı durum özeti

| Gate | Ad | Kayıtlı durum |
|---|---|---|
| 0 | Scope Safety | ortam/yasak/GO sınırı/proof tanımı gerekir; belirsizse HOLD |
| 1 | Evidence Inventory | import HOLD; insan incelemesi bekliyor |
| 2 | Booking Staging | PASS (staging upload rehearsal) / **HOLD** (production) |
| 3–7 | içerik/SEO/medya/migrasyon/deploy planlama | dry-run planning; live execution HOLD |
| 8 | Staging QA | dosyalar yüklendi+lint; full QA **HOLD** |
| 9 | Production Rehearsal | **HOLD** |
| 10 | Cutover | **HOLD** |

Her zaman OWNER GO isteyen 9 eylem: production dosya değişikliği; DB import/export; herhangi bir canlı booking submit testi; e-posta/WhatsApp/Sheets/n8n canlı gönderim; redirect/canonical/sitemap/slug/menü/parent-child/Rank Math; medya yükleme/silme; plugin/tema güncelleme; DNS/cutover/Cloudflare; test kaydı temizliği. — kaynak: `agos/AGOS_DECISION_GATES.md#L34-46, #L103-152`

---

## 5. Geri alma sınıfları

| Sınıf | Uygulama alanı | Önce zorunlu | Geri alma | Sonrası doğrulama | Kaynak |
|---|---|---|---|---|---|
| **R-05 Doküman** | Basamak 0, tüm raporlar | — | git revert / PR'ı merge etmeden kapat; üretimde artifact yok | — | `SITE_FINAL…/TASK_STATUS.md#L119-121`; `AGOS_GOV_01_OWNER_GO_TEMPLATE.md#L32` |
| **R-01 Sayfa içeriği** | Basamak 2 (sayfa-başı shortcode), 3 | sayfa ID; mevcut `content.raw` tarihli backup + ayrı rollback kopyası; Rank Math/slug/permalink/canonical/menü/redirect/WhatsApp/n8n/DB **değişikliğe dahil değil** onayı | orijinal `content.raw` geri yüklenir; render edilmiş DOM yeniden doğrulanır; beklenen = önceki form sayısı, literal yok (c6'da: tam 1 c6 formu) | HTTP 200, H1 kimliği, form sayısı = öncesi, literal yok, Rank Math/meta/canonical/slug/menü/redirect değişmemiş, cache purge yok, tarihli rapor | `agos/AG_BOOKING_OPTION_B_ROLLBACK_PLAN.md#L39-52, #L73-92, #L94-104`; `agos/AG_BOOKING_OWNER_DECISION_CHECKLIST.md#L52-53` |
| **R-02 Şablon/plugin** | Basamak 1, 4; Basamak 2 injection seçilirse | tam dosya yolu, canlı dosya backup'ı, baseline checksum, ters yama/rollback dosyası, aday dosyada PHP lint, kontrol URL'leri öncesi/sonrası; local/staging önce; owner onayı olmadan aktivasyon yok | backup dosya geri yüklenir; lint tekrar; kontrol + pilot sayfalarda DOM tekrar | aynı liste | `ROLLBACK_PLAN.md#L54-71`; `agos/AG_BOOKING_OWNER_DECISION_01.md#L182` |
| **R-Prod (Gate 9/10)** | production apply | rollback paketi + **test edilmiş/prova edilmiş** production rollback + bakım penceresi + (CAPABILITY-TIERS) eylem başına token | paket uygulanır | Gate 10 listesi | `agos/AGOS_DECISION_GATES.md#L117-140`; `agos/governance/CAPABILITY-TIERS.md#L21` |

**Emsal artifact eksik:** SEL-121'in before/rollback/after `content.raw` dosyaları ve `MANIFEST.json` raporda adlandırılır (`APPLY_01_REPORT.md#L48-60`) ama klasör `agos/.gitignore#L87-88` ile dışlanmış, üç depoda da yok (`find … -iname '*APPLY_01_BACKUPS*'` → 0); varlığı yalnızca Mac çalışma kopyası kaydına dayanır (`agos/SEL-203-HYGIENE-REPORT.md#L65, #L105`). Tek canlı kapsam pilotunun geri alma artifact'ı git'ten doğrulanamıyor. **Bu bölümün şartı:** gelecek her GO'da backup/rollback artifact'ı private depoya (secret taramasıyla) commit edilir; yalnızca yerel diskte tutulmaz.

**Kilit adımlarının geri alması kayıtta yazılı değil:** Jetpack reconnect (disconnect?), Semrush birimi, ağ izin listesi — hiçbirinin geri alma yolu ve `RISK_REGISTER.md#L3, #L5` maddelerinin nasıl kapatılacağı belirtilmemiş.

---

## 6. Her basamakta geçerli yasaklar ve gizlilik

`AG/CLAUDE.md#L92-110` (13 madde) her basamakta geçerlidir: production deploy yok; canlı WP'de geniş düzenleme yok; full plugin overwrite yok; kontrolsüz DB migration yok; Rank Math/WooCommerce/booking core'da geniş değişiklik yok; gerçek müşteri/sürücü verisiyle test yok; gerçek WhatsApp/e-posta gönderimi yok (yalnızca synthetic adres); WhatsApp Job Distribution güvenlik denetimi PASS olmadan yok; browser API key server-side yok (IP-kısıtlı server key kayıtta yok → **OWNER BLOCKER**, `SITE_FINAL…/EXECUTION_PLAN.md#L56`); PII analytics'e yok; OWNER GO'suz GTM publish yok; yetki atlama yok; başarısız test gizleme yok; backend kapasite doğrulaması kaldırma yok; n8n orchestrator pasif.

`agos/AGOS_GOV_01_EVIDENCE_GATE.md#L145-166` ek olarak: Rank Math bulk update, sitemap regeneration, slug/permalink/menü, redirect/canonical, plugin/tema güncelleme, dosya silme/temizlik — her biri ayrı GO.

Gizlilik (`AG/CLAUDE.md#L112-121`; `SITE_FINAL…/data/README.md#L7-13`): public `ALGRP/AG`'ye kaynak kod, kimlik bilgisi, müşteri verisi, DB dökümü, host yolu, DB tanımlayıcısı, 906 satırlık envanter ve formsuz para sayfalarının URL listesi konmaz. Bu bölüm bu kurala uyar: sayfa ID'leri ve per-URL listeler yalnızca private fixture atfıyla verildi. Host yolu temizliği **yapıldı (2026-09-13, bu commit):** Mac host yolu public `ALGRP/AG`'de dokuz konumdaydı — `handoff/HERMES_TASK_PACKET_01.md#L92`; `reports/ALANYAGROUP_RECONCILED_BOOKING_CANDIDATE_V1/tools/preflight_baseline_check.sh#L24, #L31` (varsayılan kök kaldırıldı; argüman veya `AG_WORKSPACE_ROOT` zorunlu, yoksa exit 2); `…RECONCILED…/ABSENT_FILES_MANIFEST.md#L11, #L23`; `…/README.md#L7`; `…/TASK_STATUS.md#L7, #L13, #L82`; `…/evidence/01_baseline_verification.md#L7-8` — hepsi `<MAC_WORKSPACE_ROOT>` ile değiştirildi (satır sayıları korundu). Aynı tarihte `ACCESS_STATUS.md#L9`'daki WordPress.com site tanımlayıcısı gizlendi ve bu bölümün §2.2 tablosundaki 2026-06-21 sayfa slug'ı private atıfla değiştirildi. Private kayıtta kalan ve dokunulmayan: `agos/master-status/AGOS-MASTER-STATUS.md#L102` (yerel WP kökü; `#L103` "Documentation Runtime"dır — önceki atıf yanlıştı). Gerçek çalışma kökü hiçbir depoda tutulmaz; Hermes/Codex betiğe argüman olarak verir.

---

## 7. Test kapısı — 24 / 0 / 0

| Matris | Gerekli | Çalıştı | Geçti | Not | Kaynak |
|---|---:|---:|---:|---|---|
| Reconciled paket (brifingin esas aldığı) | 24 | 0 | 0 | 24'ün tamamı bu ortamda olmayan kaynak dosyalarını ister; tek tek maddeler kayıtta **sıralanmamış** | `AG/reports/ALANYAGROUP_RECONCILED_BOOKING_CANDIDATE_V1/TASK_STATUS.md#L62-65`; `AG/CLAUDE.md#L62` |
| Site-final paket | 18 | 3 | 3 | 3 PASS yalnızca 906-URL envanter veri setine karşı (çift form 0, literal 0, non-200 0), canlı koşu değil; 15 NOT RUN: desktop/mobil, AYT/GZP, one-way/return, shuttle/private/VIP, bölge matrisi, 1/2/3/4/6 pax, boş/geçerli/geçersiz e-posta, Places ok/fail, çift tık + retry, fiyat sınırları, konsol hatası, yatay taşma, tek booking, tek notification, çift voucher, rollback provası | `SITE_FINAL…/TASK_STATUS.md#L102-112` |

Dört durdurma koşulunun dördü tetiklenmiş: production pull yok; CLE modülü 5 depoda 0 hit; booking/pricing/notification kaynağı yok; reconciliation production davranışını **tahmin etmeyi** gerektirir; `ag_hlp` öneki 0 hit. — kaynak: `RECONCILED…/ABSENT_FILES_MANIFEST.md#L56-63`; `RECONCILED…/evidence/01_baseline_verification.md#L24-36, #L54-60`

Kapı: Basamak 1 production'a gitmeden 24 testin tamamı staging'de koşar ve sonuçlar olduğu gibi raporlanır (`AG/CLAUDE.md#L161`); "rollback provası" Gate 9/10'un "test edilmiş rollback" şartıyla örtüşür.

---

## Uygulama adımları

| # | Adım | Kapı | Geri alma |
|---|---|---|---|
| 1 | Bu spesifikasyonu ve README indeksini public `ALGRP/AG`'ye commit et (yalnızca toplu sayılar) | [SERBEST] | R-05 |
| 2 | `RISK_REGISTER.md`, `CURRENT_STATUS.md`, `MASTER_PROJECT_STATUS.md#L23, #L39-40, #L47`, `DECISION_CHECKLIST.md#L31-34`'ü §4 kilitli kararlarla hizala (60/70; alias etiketleri); `OWNER_GO_LOG.md` bağlayıcı biçimini (§2.1 asgari birleşim) ve 2026-06-21 + SEL-121 geriye dönük kayıtlarını owner onayına sun; public preflight betiğinden host yolunu temizle (**yapıldı 2026-09-13**, §6) | [SERBEST] — yazım; **[OWNER GO]** — kabulü | R-05 |
| 3 | Owner kararlarını al: kapsam otoritesi (injection / sayfa başı), GO birimi (sayfa / batch), sıralama (alias önce / canonical sonra), Jetpack reconnect'in `RISK_REGISTER.md#L3, #L5`'i aşma kararı, "yayına al" talebinin kapsamı | [OWNER GO] | — |
| 4 | Owner: Jetpack reconnect (WP admin) — yalnızca adım 3'teki karar kaydedildikten sonra | [ERİŞİM YOK] → [JETPACK] | disconnect (kayıtta yazılı değil) |
| 5 | Owner: Semrush API birimi; ağ izin listesi (`alanyagroup.com`, `www.alanyagroup.com`) | [ERİŞİM YOK] | kayıtta yazılı değil |
| 6 | Hermes Görev 1A: `preflight_baseline_check.sh` çıktısını birebir teslim; exit ≠ 0 ise **DUR** | [BASELINE] | — |
| 7 | Hermes Görev 1B: 3 mu-plugin + `ag-homepage-live-pilot/` + CLE → private depo (AGOS seçilirse sprint branch → PR → Owner merge); secret taraması; §4.1 tablosundaki ek dosyaların (`ag-platform-phase1-mvp`, child theme template, `ag-voucher*`) varlığını ayrıca raporla | [BASELINE] | R-05 |
| 8 | Hermes Görev 2/3/4: TÜRSAB (2165/12892), fiyat tabanı (50/40), dil kapsamı (12 İskandinav + Arapça) — Görev 4 Batch 1'in ön koşulu | [BASELINE] | — |
| 9 | Salt-okunur envanter yenilemesi: 906 URL'de HTTP + form sayımı; kontrol + pilot sayfalarda **render edilmiş** DOM | [JETPACK] veya ağ izin listesi + oturum açık tarayıcı | — |
| 10 | Booking-core kod uygulaması (§4 kararları) private depoda; staging'e yükle + lint (Gate 2) | [BASELINE] + [OWNER GO] (staging) | R-02 |
| 11 | Staging QA: 24 test, dry-run gönderimler, çift booking/voucher yok, rollback provası (Gate 8) | [BASELINE] + [OWNER GO] | R-02 |
| 12 | Gate 9 paketi: production backup planı, rollback paketi, bakım penceresi, GO metni (§2.1 asgari birleşim), proof path → owner'a sun | [OWNER GO] | — |
| 13 | Production apply — yalnızca listelenen dosyalar, backup sonrası, lint+proof+PASS/HOLD'da dur; `owner_go` → false | [OWNER GO] + [ERİŞİM YOK] kalkmış | R-Prod / R-02 |
| 14 | Kapsam doldurma Batch 1 (94; 58 NON_EN satırı Görev 4'e bağlı) → 2 (321) → 3 (51): her batch §4.4 6-şartlı kapı; 192 `agsc-v6` sayfasına dokunma | [OWNER GO] ayrı + [JETPACK] veya eşdeğer yazma kanalı | R-01 (injection seçilirse R-02) |
| 15 | c6 migrasyonu: `/alanya-transfer/` sonra `/antalya-alanya-transfer/`, GO başına bir sayfa, canonical string kaynaktan | [OWNER GO] + [BASELINE] | R-01 |
| 16 | `agsc-v6` standardizasyonu — en son, tek başına, enjekte eden dosya kimliği bulunduktan sonra | [OWNER GO] + [BASELINE] | R-02 |
| 17 | Canlı gönderim kanalları (e-posta → WhatsApp → Sheets → n8n): kanal başına ayrı GO; WhatsApp Job Distribution bağımsız denetim PASS olmadan hiçbir zaman | [OWNER GO] × kanal | kanal devre dışı |
| 18 | Batch 4 (16) / Batch 5 (108) `SHOULD_HAVE`: ayrı GO, Batch 1–3 sonuçları stabil olunca | [OWNER GO] | R-01 |

Hiçbir adım bir öncekinin kapısını atlayamaz; her canlı adımın sonunda `owner_go` false'a döner ve `CHANGELOG.md` / `TASK_QUEUE.md` / `RISK_REGISTER.md` güncellenir (`AI_OPERATING_RULES.md#L7-9`).

**B-09 sıralama varsayımı (görünür):** bu merdiven **canonical-sonra** dalını varsayar (Basamak 10–13 booking-core → Basamak 14 kapsam doldurma); bu bir owner kararı değil, yazım varsayımıdır (§4.4 "Sıralama kararı (açık)"). Owner `B09_ORDER=alias-önce` derse Basamak 14 (Batch 1–3, SEL-121'de kanıtlı alias dizesi `[ag_home_booking …]` ile, [JETPACK] + ayrı [OWNER GO]) Basamak 10–13'ün **önüne** alınır ve Hermes baseline'ını (`BASELINE_COMPLETE=YES`) beklemez; canonical-sonra dalında ise Batch'ler `[ag_booking_engine]` ile Basamak 13 sonrasına kalır.

---

## Kayıt bunu söylemiyor

1. **Kapsam otoritesi** (şablon/post-type injection mi, sayfa başı shortcode mu): owner kararı yok, Hermes görevi yok; 384 sayfanın 1 release mi 384 düzenleme mi olacağını ve R-01/R-02 seçimini belirler.
2. **GO birimi**: "GO başına bir sayfa" ile "batch başına URL/ID listesi" aynı anda yazılı; 466 sayfa için birim tanımsız.
3. **Sıralama**: kapsam doldurma booking-core apply'dan önce alias ile mi, sonra canonical ile mi.
4. **`app.alanyagroup.com` staging** bugün ayakta mı; AGOS "izinli hedef", AG paketleri "kayıtlı değil".
5. **Cloudflare**: ağ izin listesi açılınca render edilmiş DOM okunabilir mi; kayıtta hem başarılı (SEL-123 statik GET) hem engellenmiş örnek var; tek kanıtlanmış DOM yöntemi oturum açık tarayıcı.
6. **Kilit adımlarının geri alması**: Jetpack disconnect, Semrush, ağ izin listesi — yazılı değil; `RISK_REGISTER.md#L3, #L5` nasıl kapanacak.
7. **`OWNER_GO_LOG.md` bağlayıcı biçimi**: 5+ rakip şablon; log'da 0 kayıt, kayıtta 2 kullanılmış GO.
8. **SEL-121 backup/rollback artifact'ı** hangi makinede; git'te yok.
9. **24 testin tek tek listesi**: yalnızca 18'lik listenin 15 NOT RUN başlığı + reconciled paketin ~10 adlandırılmış alanı var.
10. **Booking runtime dosya kümesi**: üç kayıt üç farklı küme; preflight yalnızca birini kontrol ediyor; `#agsc-v6-form`'u enjekte eden dosya adı yok; `ag_hlp_render_booking_engine` adı CLAUDE.md dışında hiçbir kayıtta geçmiyor.
11. **Envanter yenilemesi** kim tarafından, hangi kanalla; 2026-06 verisi güncel mi.
12. **WhatsApp Job Distribution** bağımsız güvenlik denetimi artifact'ı yok.
13. **Hermes'in commit hedefi** (hangi depo, hangi branch) Hermes'e bırakılmış; AGOS seçilirse PR/Owner-merge kapısı devreye giriyor, paket bunu söylemiyor.
14. **"Yayına al" talebinin kapsamı** (yalnız booking-core mu, kapsam doldurma da mı, SEO/dil de mi) tanımsız; her biri ayrı, ortam-adlı GO ister.
15. **Canlı Jetpack eklenti durumu** (kurulu/aktif mi, reconnect gerçekten "tek tık" mı) kayıtta yok; son bağlantı güncellemesi 2021-08-03.

---

## Düzeltilen / elenen iddialar

İki-mercek doğrulamasında **refuted** iddia yoktur (0). Bölüm 4 **held** (L0-01, G-01, G-03, G-05) ve 10 **corrected** bulguya dayanır; corrected olanlar aşağıdaki düzeltmeyle kullanıldı:

| ID | Düzeltme |
|---|---|
| L0-02 | Kilit sırası (Jetpack #1) `RISK_REGISTER.md#L3, #L5`, `CURRENT_STATUS.md#L10`, `AG/CLAUDE.md#L128, #L135` ve önceki `EXECUTION_PLAN.md#L19-29` ile çelişir; Jetpack Hermes'i beklemez ama **owner kararını bekler** — §1.1 |
| L0-03 | Jetpack "yetki" değil "yetenek" verir; ikinci risk maddesi (`RISK_REGISTER.md#L3`) eklendi; "tek tık" kayıtta doğrulanmamış; PHP şartı yönetişimsel (WPCode emsali `MASTER_PROJECT_STATUS.md#L54`) — §1.1 |
| L0-04 | "Cloudflare her fetch'i engeller" mutlak değil (SEL-123 906/906 public GET başarılı); 906 sayım statik HTML, render değil; render kanıtı ~7 satır — §1.2 |
| L1-01 | Preflight'ın zorunlu kümesi üç kayıtla tutarsız (MASTER-STATUS, ROADMAP, AGOPS-ARCHITECTURE); örtük 7. şart (pull klasörü ad kalıbı); voucher runtime non-blocking — §4.1 |
| L1-02 | Görev 1B = **3** mu-plugin + `ag-homepage-live-pilot/` klasörü + CLE (4 değil); AGOS git yönetişimi (PR + Owner merge) eklendi — §4.1 |
| L2-01 / L2-02 | "Beş owner kararı" çerçevesi CLAUDE.md §7 ve Hermes paketi ile aşıldı; 0.1 kilitli, 0.3 yarı-kilitli; 0.x numaralaması pakete özgü, şema adıyla anıldı; kapsam otoritesi hiçbir Hermes görevinde yok ve core uygulamanın kapısı değil — §3 |
| G-02 / G-04 | GO biçimi tek değil: GOV-01 = başlık + 10 alan (11 satır), 5+ rakip şablon, GOV-01'in kendi içinde tutarsızlığı, CAPABILITY-TIERS token/prova şartı, Gate 9 bakım penceresi; bağlayıcı biçim çözülmemiş — §2.1 |
| G-07 | SEL-121 owner hafızasında kayıtsız (`OWNER_GO_LOG.md#L3`, `MASTER_PROJECT_STATUS.md#L50`, `CHANGELOG.md`); artifact klasörü git'te yok; "canonical" etiketi §4 ile çelişir — §2.2, §3, §5 |

Doğrulama geçişinde `unverified` / `reader-only` kalan bulgular (B-01…B-11, R-01…R-06, G-06, G-08…G-14, P-01/02, T-01/02, F-01…F-03, N-01/02, X-01/02, L1-03/04, L2-03) bu bölümde **yalnızca** kaynak satırları bu oturumda doğrudan açılarak teyit edildikten sonra kullanıldı (CSV sayımları `python3` ile yeniden üretildi; `safety-scan.php` işaret sayısı 33 yeniden sayıldı; `APPLY_01_BACKUPS` klasörü için `find` → 0 tekrarlandı). Elenen iddia yoktur.

# 03 — Rezervasyon Operasyonu ve "Rezervasyon Durumu"

> **Durum**
> 1. **Kayıt ne kuruyor:** "Rezervasyon durumu" için canlı, sorgulanabilir **tek bir yüzey yoktur**. Tasarlanmış 10 durumlu lifecycle (AGSYNC-OPS-01), 45 sütunlu Master Operations Sheet ve `request_id` anahtarı **yalnızca belgedir** (`PASS_ARCHITECTURE_READY_NO_MUTATION`); Sheet, voucher modülü, supplier/driver gönderimi, canlı n8n akışı hiçbiri kurulmamıştır. Canlı sitede kayıtlı akış `[ag_home_booking]` formunun **"Confirm on WhatsApp"** CTA'sıdır: n8n webhook'u tetikler + önceden doldurulmuş WhatsApp mesajı açar; webhook alıcısı kayıtta tanımsızdır. Çalışan tek operasyon aracı yerel, fixture-only Operations Inbox'tır (SEL-155 PASS, SEL-156 CERTIFIED, Production **NOT READY**). — kaynak: `ARCH#L152-176,292`, `MPS#L41`, `SEL156#L10-18`
> 2. **Bugün ne yapılabilir:** Canlı siteye **hiçbir kanaldan** erişim yok (Jetpack `site_disconnected`, Semrush API birimi 0, doğrudan HTTPS 403, Hermes teslimatı 0 commit). **Bu oturumda rezervasyon durumu sorgusu yapılmadı.** Bu bölümdeki her "canlı site" ifadesi **kayıt-türevidir**. `owner_go = false`. — kaynak: `AG/reports/ALANYAGROUP_FULL_SITE_REMEDIATION_SPEC_V1/ACCESS_STATUS.md#L7-12,23`
> 3. **Bu bölüm neyi tanımlıyor:** "Rezervasyon durumunu kontrol et" talebinin operasyonel karşılığı (dört olası anlam ve her birinin kayıttaki durumu), hedef lifecycle + durum kaydı, bildirim/voucher/idempotency gereksinimleri, `CLAUDE#§4` kilitli kararlarıyla çelişkiler ve kapı etiketli uygulama adımları. Kod yazılmaz; booking core, CLE e-posta modülü ve `ag-voucher.php` hiçbir depoda yoktur. — kaynak: `CLAUDE#§3`, `ABSENT#L27,40`

**Kısaltmalar (kaynak yolları, depo-göreli):**

| Kısaltma | Yol |
|---|---|
| `ARCH` / `DIAG` | `agos/AGSYNC_OPS_01_OPERATIONS_CENTER_ARCHITECTURE.md` / `agos/AGSYNC_OPS_01_STATUS_WORKFLOW_DIAGRAM.md` |
| `MSCHEMA` / `DSCHEMA` | `agos/AGSYNC_OPS_01_MASTER_SHEET_SCHEMA.csv` / `agos/AGSYNC_OPS_01_DRIVER_SHEET_SCHEMA.csv` |
| `DUP` / `PAYLOAD` | `agos/AGSYNC_OPS_01_DUPLICATE_PREVENTION_PLAN.md` / `agos/AGSYNC_OPS_02_DRY_RUN_PAYLOAD_BUILDER_SPEC.md` |
| `PASSHOLD` | `agos/AGSYNC_OPS_01_PASS_HOLD_REPORT.md` |
| `MPS` / `GOLOG` | `alanyagroup-platform/AI_COMMAND_CENTER/MASTER_PROJECT_STATUS.md` / `…/OWNER_GO_LOG.md` |
| `CLAUDE` | `AG/CLAUDE.md` (beş depoda birebir aynı) |
| `APPLY` / `MONITOR` / `ROLLBACK` | `agos/AG_BOOKING_OPTION_B_APPLY_01_REPORT.md` / `…_PILOT_MONITOR_01_REPORT.md` / `…_ROLLBACK_PLAN.md` |
| `SEL155` / `SEL156` | `agos/SEL-155_BOOKING_PIPELINE_QA_REPORT.md` / `agos/SEL-156_MILESTONE_01_CLOSURE_REPORT.md` |
| `INBOX` | `agos/INBOX_01_QUEUE_AND_STATUS_MODEL.md` |
| `AMS` / `D011` | `agos/master-status/AGOS-MASTER-STATUS.md` / `agos/decision-ledger/DECISION-0011.md` |
| `DM` | `agos/AG_ADMIN_CMS_01_DATA_MODEL.md` |
| `ABSENT` | `AG/reports/ALANYAGROUP_RECONCILED_BOOKING_CANDIDATE_V1/ABSENT_FILES_MANIFEST.md` |
| `SFR-TS` / `SFR-EP` | `AG/reports/ALANYAGROUP_SITE_FINAL_REMEDIATION_V1/TASK_STATUS.md` / `…/EXECUTION_PLAN.md` |
| `FC1-BC` | `AG/reports/ALANYAGROUP_FINAL_COMPLETION_V1/BLOCKERS_AND_CONFLICTS.md` |
| `HERMES` | `AG/handoff/HERMES_TASK_PACKET_01.md` |
| `MATRIX` | `agos/AG_BOOKING_PRIORITY_MATRIX.csv` — **özel fixture**, 699 satır. URL bazlı detay yalnızca oradadır; bu belgeye taşınmaz. |

---

## 1. "Rezervasyon durumunu kontrol et" — dört anlam, dört sonuç

Owner talebi tek cümledir; operasyonel olarak dört farklı şey anlamına gelebilir. Her birinin bugünkü karşılığı:

| # | Anlam | Kayıtta var mı | Bugün yapılabilir mi | Kaynak |
|---|---|---|---|---|
| A | **Formlar rezervasyon alabiliyor mu?** (sayfa düzeyi: form var / render oluyor / gönderim çalışıyor) | Evet — 906 URL envanteri; 587 para sayfasının 384'ünde form yok (%65); iki pilot sayfada son doğrulama 2026-06-24 | **Hayır** — DOM erişimi yok (`ACCESS_STATUS#L11`) | `CLAUDE#§2`, `MONITOR#L32-47` |
| B | **Gelen rezervasyonlar nerede, hangi durumda?** (kayıt/DB/Sheet sorgusu) | **Hayır** — Master Sheet oluşturulmamış (`Google Sheet write: NO`), production Booking DB şekli kayıtsız, gerçek rezervasyon verisi hiçbir depoda yok (tasarım gereği) | **Hayır** — sorgulanacak veri kaynağı yok | `PASSHOLD#L40-51`, `PAYLOAD#L26-54` |
| C | **Müşteriye onay/voucher gidiyor mu?** (bildirim yolu) | Belirsiz — CLE received/confirmed modülü 0 eşleşme; AGOS tarafında yalnızca dry-run/HOLD | **Hayır** — kaynak yok, gönderim yasak | `ABSENT#L27,40`, `AMS#L107,168`, `CLAUDE#§5` |
| D | **Operatör iş akışı çalışıyor mu?** (inbox, sınıflandırma, dispatch) | Yalnızca **yerel fixture** — SEL-155/156; gerçek inbox bağlı değil; dispatch modülü yok | **Hayır** — localhost'ta sertifikalı, production NOT READY | `SEL155#L5-7`, `SEL156#L10-18,109`, `MPS#L70` |

**Sonuç:** Dördü de bugün cevaplanamaz. A için Jetpack yeniden bağlantısı yeter (`ACCESS_STATUS#L16`); B, C, D için önce Hermes baseline (kaynak kod) ve ardından ayrı OWNER GO'lar gerekir (`CLAUDE#§7,§9`).

---

## 2. Tasarlanmış lifecycle — kayıtta ne var

### 2.1 AGSYNC-OPS-01: 10 durum (yalnızca belge)

| Durum | Kural (kayıt) | Kapı |
|---|---|---|
| `New` | Booking DB persist edildi, dry-run sync'e hazır | — |
| `Assigned` | Operatör kategori/supplier/driver sahibi seçti | — |
| `Sent to Supplier` | Gelecekteki canlı supplier gönderimi tamamlandı | **OWNER GO** (`DIAG#L52`, `ARCH#L169`) |
| `Supplier Confirmed` | Supplier/operatör onayı alındı | — |
| `Driver Assigned` | Sürücü/ifa eden kişi atandı | — |
| `Customer Confirmed` | Müşteri onayı onaylandı/gönderildi | **OWNER GO** (`ARCH#L172`) |
| `Voucher Ready` | Voucher payload'ı var ve gelecekteki gönderim için onaylı | "voucher gate", gelecek sprint (`DIAG#L57,72`, `ARCH#L173`); voucher sprint'i ayrı OWNER GO (`ARCH#L205,270`) |
| `Completed` | Hizmet tamamlandı | — |
| `Cancelled` | Müşteri/operatör/supplier iptali | — |
| `Problem` | Çakışma, gecikme, çift kayıt, eksik kanıt, başarısız sync | — |

— kaynak: `ARCH#L152-176` (Status Workflow), `DIAG#L7-16,48-60` (Transition Rules). Durum satırı: `AGSYNC_OPS_STATUS=PASS_ARCHITECTURE_READY_NO_MUTATION` — `ARCH#L292`; `DIAG#L3` "documentation only / no mutation".

**Düzeltme notu:** Önceki okuma iki geçişi OWNER GO'ya bağlıyordu. Kayıt, OWNER GO ifadesini `Assigned→Sent to Supplier` geçişi ve `Customer Confirmed` durumu için kullanır; `Customer Confirmed→Voucher Ready` için "voucher gate / gelecek sprint" der, OWNER GO ise voucher sprint'inin bütünü için ayrıca yazılıdır (`ARCH#L205,270`). Üç OWNER GO noktası vardır, iki değil.

### 2.2 İkinci, uzlaştırılmamış lifecycle — Admin CMS

`DM#L131`: `ag_booking_request.status` = `new, review, quoted, confirmed, cancelled, archived` (6 değer; spec 2026-06-24, `owner_go=false`, "data model specification only"). Hiçbir belge bu 6'lı enum'u §2.1'deki 10'lu modele eşlemez; `quoted` üç depoda yalnızca bu satırda geçer. — kaynak: `DM#L131`; `grep -rn quoted` (bu oturum)

| Konu | AGSYNC-OPS-01 | Admin CMS | Durum |
|---|---|---|---|
| Rezervasyon durum enum'u | 10 durum, operasyon modeli | 6 durum, istek modeli | **Çelişki değil, boşluk** — ikisi de tasarım; eşleme belgesi yok; hedef modelin owner tarafından seçilmesi gerekir |

### 2.3 Zorunlu kayıt sırası ve fail-closed kuralları

1. Booking DB persist → 2. Master Operations Sheet → 3. Category Sheet (13 kategori — `agos/AGSYNC_OPS_01_ROUTING_MATRIX.csv`, 13 veri satırı) → 4. Supplier/Driver/Operator Sheet.
DB persist başarısızsa downstream sync yapılmaz; `request_id` tekilliği kanıtlanamazsa sync **HOLD**. — kaynak: `ARCH#L13-24,98-108`

Çift **sync** önleme: `request_id` + sha256 `booking_payload_hash`; "aynı `request_id` ile iki Booking DB kaydı = blocking defect" (`DUP#L35`), yani DB düzeyi tekillik bu mekanizmanın **önkoşuludur**, çıktısı değil. Kod yoktur (`PAYLOAD#L11,320`). — kaynak: `DUP#L5-7,29-35`, `PAYLOAD` "Payload Hash Strategy"

**Kapsam uyarısı (düzeltilmiş):** Bu mekanizma form gönderim aşamasındaki çift kaydı (double-click / retry) **kapsamaz**. Submit-stage idempotency anahtarı hiçbir kayıtta tasarlanmamıştır: `02_BOOKING_FORM_UX_UI.md#L243` ("anahtar üretimi tanımsız… hiçbir koruma tasarlanmamıştır"), `SFR-TS#L88` (`BOOKING_IDEMPOTENCY = BLOCKED`), `AMS#L161` (Idempotency Gate = PARTIAL), `AMS#L210` (AGOS-IDEMPOTENCY-GATE-01 hâlâ planlı sprint; gövde belgesi yok). Tek tanım `DM#L121` "collision-safe generated ID" — algoritma yok. `CLAUDE#§4` "çift voucher önleme" gereksinimi için **ayrı bir submit-stage tasarımı açık kalemdir** (bkz. §7 adım 3). `ARCH` girdisi olarak anılan `AGBOOKING_FREEZE_01_*` belgeleri hiçbir depoda yoktur.

### 2.4 Durum sorgusunun tasarımdaki hedefi: Master Operations Sheet

| Sheet | Sütun sayısı | Durum sütunları (seçme) | Kaynak |
|---|---:|---|---|
| Master Operations | **45** | `status`, `sync_status`, `voucher_status`, `whatsapp_status`, `email_status`, `n8n_status`, `sla_flags`, `problem_reason`, `owner_go_required` | `MSCHEMA` (`column_name` sütunu) |
| Driver | **23** | `driver_status`, `send_allowed`, `send_mode` | `DSCHEMA` |
| Routing matrix | 13 satır | kategori → sheet eşlemesi | `agos/AGSYNC_OPS_01_ROUTING_MATRIX.csv` |

Hiçbiri oluşturulmamıştır: `Google Sheet write: NO`, `DB write: NO`, `Production touched: NO`, `Voucher generation: NO`, `n8n execution: NO`. — kaynak: `PASSHOLD#L40-51`

SLA bayrakları (`sla_new_unassigned_over_10m`, `sla_supplier_unconfirmed_over_30m`, `sla_driver_unassigned_24h_before_pickup`, `sla_customer_unconfirmed_12h_before_pickup`, `sla_voucher_missing_12h_before_pickup`, `pickup_today_unresolved`, `problem_open_over_15m`) türetilmiş alanlardır; "planning defaults, owner review required before live operations". — kaynak: `ARCH#L178-192`

---

## 3. Canlı sitede bir rezervasyon bugün nerede yaşıyor — kayıt-türevi

### 3.1 Kayıtlı akış

`[ag_home_booking]`: tarih → yolcu sayacı → Google Places pickup (bölge kısıtlı; `place_id` + lat/lng saklar) → ad + WhatsApp → not → canlı fiyat toplamı → birincil CTA **"Confirm on WhatsApp"**: n8n webhook'unu tetikler **ve** önceden doldurulmuş WhatsApp mesajı açar. Ön ödeme/hesap yok. — kaynak: `MPS#L41`

- Webhook'u alan n8n workflow'u **kayıtta tanımsızdır**: `MPS#L63-70`'teki beş workflow ID'sinden hiçbiri booking alıcısı olarak işaretlenmemiştir; Workflow C (dispatch) "not yet built"; SMTP/e-posta ve WhatsApp (Meta + template) owner'da bloke. — kaynak: `MPS#L70`
- **Çıkarım (kaynak bunu söylemez):** Bugün gerçek bir rezervasyonun "durumu" WhatsApp thread'inde ve kaydı belirsiz bir webhook alıcısındadır. Bu çıkarım §3.3'teki CLE e-posta kaydıyla çelişir; Hermes baseline'ına kadar çözülemez.

### 3.2 Tek somut Booking DB kaydı şekli — yerel fixture

`post_type=agp_booking`, `post_status=private`, `request_id=AG-REQ-2026-000136`, `notification_mode=dry_run`, `payment_method=pay_in_vehicle`. Kaynağı owner'ın yerel proof dosyasıdır; production'da `agp_booking` post tipinin var olduğuna dair kayıt yoktur (`[agp_booking_engine]` "not yet present on production"). — kaynak: `PAYLOAD#L26-54`; `MPS#L47,76`

`payment_method=pay_in_vehicle` ve zorunlu alan listesinde `customer_phone` = zorunlu / `customer_email` = zorunlu-dışı, kilitli "araçta nakit" ve "e-posta opsiyonel" kararlarıyla uyumludur. — kaynak: `PAYLOAD#L52,84-103`; `CLAUDE#§4`

### 3.3 Bildirim yolu: CLE e-posta modülü ve AGOS delivery runtime

| Katman | Kayıt | Kaynak |
|---|---|---|
| Production CLE received/confirmed e-posta modülü | **Beş depoda 0 eşleşme**; tetikleyici, gönderen, şablon, idempotency, voucher eki bilinmiyor | `ABSENT#L27`; `CLAUDE#§3` |
| `ag-voucher.php` | Dosya yok; yalnızca yol adı olarak anılıyor ("a path in a status document is not source") | `ABSENT#L40`; `AMS#L105`; `agos/architecture/AGOPS-ARCHITECTURE.md#L40` |
| AGOS Delivery Runtime (`ag_delivery_queue`, `_agp_customer_email_*`) | **Yerel** runtime; "Email Runtime: dry-run preview only; no live send"; Live-Send Gate = HOLD | `AMS#L106-107,158` |
| Homepage live pilot içinde doğrudan `wp_mail()` yüzeyi | **P0 blocker**: "must be gated, retired, or routed through canonical delivery runtime"; owner kararı bekliyor | `AMS#L97,168,195` |
| D-011 | "Customer email remains dry-run preview only until explicit SMTP owner GO" | `D011#L14` |
| AGCP-04 bildirim modeli | display-only; AGN8N "capture before live send"; Sprint 15 dry-run harness; Gate 7 HOLD | `agos/AGCP_04_NOTIFICATION_MODEL.md#L10,37`; `agos/AGOS_MASTER_ROADMAP_2026_V2.md#L213`; `agos/AGOS_NEXT_30_SPRINTS.md#L175-183`; `agos/AGOS_DECISION_GATES.md#L91-99` |

**Ne çıkıyor:** AGOS, canonical `[ag_home_booking]` motorunun geldiği `ag-homepage-live-pilot/` build'inde (`MPS#L39`) bir e-posta yolunun **var olduğunu** kaydeder — ancak yerel runtime için ve dry-run olarak. Canlı sitenin e-posta gönderip göndermediğini **hiçbir kayıt kanıtlamaz**. Regresyon testi bu yüzden bugün yalnızca kara-kutu kabul gereksinimi olarak yazılabilir (`CLAUDE#§4`: received/confirmed regresyonsuz + çift voucher önleme); kaynağa karşı baseline alınamaz ve çalıştırılamaz — Hermes Görev 1B modülü private depoya commit edene kadar (`HERMES#L115`).

### 3.4 Voucher gate'i

`ARCH#L194-207`: voucher üretimi için önkoşullar — DB persist + Master sync + kategori routing + supplier/driver atama + `price, pickup, dropoff, customer name, phone, email, date/time, passenger count, request ID` mevcut + OWNER GO. "This sprint creates no voucher."

---

## 4. Çelişki tablosu — owner kararı | kayıt | durum

`CLAUDE#§4` kilitli kararları geçerlidir. Aşağıdakiler **çözülmemiştir**; hiçbiri sessizce seçilmemiştir.

| # | Konu | Owner kararı (`CLAUDE#§4`) | Kayıt | Durum |
|---|---|---|---|---|
| Ç1 | E-posta opsiyonel | "E-posta alanı opsiyonel — arayüz, backend ve API'de tutarlı" (`CLAUDE#L76`); `SFR-EP#L54` "Empty email must never block a booking" | Voucher gate'i `email`i önkoşul sayar (`ARCH#L194-207`). **Aynı paketin** Master Sheet şeması ise `customer_email` = `conditional` ("if supplied") der (`MSCHEMA#L14`); `PAYLOAD#L84-95` zorunlu listesinde e-posta yok | **Owner kararı geçerli.** Voucher gate'i e-postayı koşullu saymalı; e-postasız rezervasyon için WhatsApp teslimatına düşmeli. Kayıt desteği: `D011#L14` (e-posta dry-run varsayılanı); `agos/indexes/proof/PROOF-INDEX.md#L141,176` WhatsApp voucher proof kimlikleri — **proof gövdeleri depoda yok**, kayıt-türevi |
| Ç2 | CLE e-posta regresyonu | "Production CLE received/confirmed e-posta davranışı regresyona uğramamalıdır (+ çift voucher önleme)" — production'da bir e-posta adımı **var** sayar | `MPS#L41` akışı e-posta adımı tarif etmez; modül 0 eşleşme (`ABSENT#L27`); AGOS e-postayı dry-run/HOLD kaydeder (`AMS#L87,107`, `D011#L14`) | **Owner kararı geçerli, ama baseline yok.** Test tanımlanabilir, çalıştırılamaz. Hermes Görev 1B'ye bağlı (`HERMES#L115`) |
| Ç3 | Canonical shortcode | `[ag_booking_engine]` canonical; `[ag_home_booking]` geçici alias, aynı renderer | Canlı 13 `ag_home` sayfası + 2 pilot sayfa `[ag_home_booking …]` ile çalışıyor (`APPLY#L36-42`; `CLAUDE#§2`); `APPLY#L29` "Source confirmation: ag-home-booking-shortcode.php" — kaynak 2026-06-24'te owner tarafında okunabiliyordu, bugün hiçbir depoda yok (`CLAUDE#§3`) | **Owner kararı geçerli.** Alias→renderer eşlemesi kurulmadan canonical'a geçiş 15 sayfayı kırar; sıralama §7 adım 9 |
| Ç4 | Çift voucher önleme | §4 gereksinim | `request_id`+hash yalnızca post-persist sheet sync'i kapsar (`DUP#L35`); submit-stage koruma tasarlanmamış (`02_BOOKING_FORM_UX_UI.md#L243`; `SFR-TS#L88`); voucher üretimi ertelenmiş (`ARCH#L194-207`) | **Açık tasarım kalemi** — §7 adım 3 |
| Ç5 | OWNER GO defteri | `ACCESS_STATUS#L28`: deploy için `OWNER_GO_LOG.md`'de açık kayıt gerekir | `GOLOG#L3` "No live WordPress OWNER GO given for this setup yet"; oysa `MPS#L48` (2026-06-21, tek sayfa, owner GO) ve `APPLY#L3-5` (2026-06-24, SEL-121, iki sayfa, scoped OWNER GO) iki canlı mutasyonu kaydeder | **Defter eksik.** `OWNER_GO_LOG.md` tek başına GO ledger'ı olarak kullanılamaz; owner geçmiş iki GO'yu geriye dönük kaydetmeli (§7 adım 2) — *bu satır iki-lens doğrulamasından geçmedi; `GOLOG#L3`, `MPS#L48`, `APPLY#L3-5` bu oturumda doğrudan okundu* |
| Ç6 | Rezervasyon durum modeli | §4 sessiz | İki uzlaştırılmamış tasarım (§2.2) | **Owner seçimi gerekli** — §7 adım 4 |
| Ç7 | AYT↔GZP shuttle reddi server-side | Her iki yönde yasak; ret server-side; private/VIP engellenmez | Hangi kod yolunda yaşadığı bilinmiyor — booking core kaynağı yok (`CLAUDE#§3`) | **Baseline'a bağlı** |

---

## 5. Gerçekten çalışan operasyon parçaları — hepsi yerel / dry-run

| Parça | Kanıt | Ölçü | Sınır | Kaynak |
|---|---|---|---|---|
| Operations Inbox durum modeli | INBOX_01 | 13 kuyruk, 14 durum, 6 yasak geçiş; izinli zincir `SOURCE_CAPTURED_DRAFT → NORMALIZED_DRAFT → CLASSIFIED_DRAFT → QUEUE_ASSIGNED_DRAFT → OPERATOR_REVIEW_PENDING / OWNER_REVIEW_PENDING / BLOCKED_UNSAFE` | `MESSAGE_SENT`, `SHEET_WRITTEN`, `BOOKING_CONFIRMED`, `PAYMENT_CONFIRMED`, `WORKFLOW_ACTIVE`, `WORDPRESS_UPDATED` **yasak**; hiçbir Faz-1 durumu "gönderildi/onaylandı" anlamına gelmez | `INBOX#L13-27,31-46,77-102`; `agos/INBOX_01_OPERATOR_WORKFLOW.md#L97-106` |
| Booking pipeline QA (SEL-155) | **PASS** | 14 sentetik kaynak satırı → 14 inbox satırı → 14 review packet; 8 satır owner review; 5 kimlik türünde 0 duplicate; 14 güvenlik bayrağı 0 true; 0 POST form / 0 mutation control | `LOCAL ONLY / READ_ONLY + DRY_RUN / FIXTURE ONLY / NO LIVE SITE`; gerçek müşteri verisi, canlı site, gönderim, DB yazımı yok | `SEL155#L5-7,11-21,46-57,122,139-145,171-186,203-210` |
| Milestone 01 (SEL-156) | **CERTIFIED** | yerel read-only Operations Inbox temeli | **Production Ready = NOT READY**; "Production logging, monitoring, and audit trails are not implemented"; gerçek inbox bağlı değil; owner approval engine, müşteri bildirimi, ödeme doğrulaması uygulanmadı | `SEL156#L10-18,101-110,120-134,138-142`, `#L109` |
| n8n orchestrator `fjqbCav0JYRFI5w7` | inactive import; manuel DRY_RUN execution `#34` **gerçekten çalıştı** | routes CLAUDE 1 / CODEX 1 / REVIEW 1 / OWNER_GO_REQUIRED 2 / BLOCKED 2; no credentials, no mutation nodes | Pasif kalır (`CLAUDE#§5`) | `MPS#L67`; `alanyagroup-platform/AI_COMMAND_CENTER/RISK_REGISTER.md#L8` |
| WHATSAPP_03 ve BRIDGE_02 workflow JSON'ları | **n8n'e hiç import edilmedi** ("BLOCKED BEFORE IMPORT", OAuth yok) | yalnızca yerel mock: 11 çıktı, 0 safety violation | Gerçek WhatsApp Business / Gmail inbox hiç bağlanmadı | `agos/WHATSAPP_04_N8N_IMPORT_TEST_REPORT.md#L9-13,147-157`; `agos/AG_PLATFORM_AUTOMATION_BRIDGE_03_N8N_IMPORT_TEST_REPORT.md#L9,127-134` |

Her satırın ortak paydası: **hiçbiri gerçek bir rezervasyona dokunmamıştır.** "PASS" ve "CERTIFIED" yerel güvenlik zarfını sertifikalar, operasyonu değil.

---

## 6. Canlı siteye dokunmuş tek operasyon: Option B pilotu

Kayıttaki booking-engine içerik mutasyonları (tamamı owner GO'lu, tamamı `[ag_home_booking]` yerleştirme):

| Tarih | Görev | Kapsam | Yöntem | Doğrulama | Geri alma artefaktı | Kaynak |
|---|---|---|---|---|---|---|
| 2026-06-21 | "First live mutation" | 1 sayfa (transfer booking landing) — literal `[ag_transfer_booking_form]` metni → `[ag_home_booking]` | — | tek form, sayfa bütün | "Backup + rollback saved" — **hiçbir depoda yok** (bu oturumda üç depoda yedek dosyası araması = 0 sonuç) | `MPS#L48` |
| 2026-06-24 16:56 GMT | SEL-121 / APPLY_01 | 2 pilot sayfa — 1 otel-transfer landing + 1 tur sayfası (post ID'leri ve URL'ler yalnızca `APPLY#L13-14`, özel depo) — yalnızca `content` alanına `<!-- wp:shortcode -->[ag_home_booking context="transfer_landing" default_service="transfer" layout="compact"]<!-- /wp:shortcode -->` eklendi | authenticated WP REST | ham uzunluk 13,792→13,927 ve 11,349→11,485; before-DOM 0 form, after-DOM tam 1 `ag_home` form, literal shortcode yok; GO yalnızca bu iki URL için kullanıldı | `AG_BOOKING_OPTION_B_APPLY_01_BACKUPS/` (*.before/*.rollback/*.after, `MANIFEST.json`, `READBACK_AFTER.json`) "created before mutation" — **hiçbir depoda yok** | `APPLY#L3-5,13-14,36-42,46-60,80-101,115` |

**Yedeklerin durumu (düzeltilmiş okuma):** Klasör kayıp değil, **kasıtlı olarak git dışıdır**: `agos/.gitignore#L87-88` klasörü yoksayar; `agos/manifests/RC-EXCLUSION-POLICY.md#L43,68` RC paketinden "evidence or rollback material, not because they should be deleted" gerekçesiyle dışlar; `agos/SEL-203-HYGIENE-REPORT.md#L65,105` ve `agos/SEL-204-RELEASE-CANDIDATE-VALIDATION-REPORT.md#L108` (Temmuz 2026) klasörün yerel (Mac) çalışma alanında var olduğunu kaydeder. Bu oturumdan varlığı **doğrulanamaz**. Bir OWNER GO'lu production mutasyonunun geri alma artefaktı yalnızca kayıt dışı yerel kopyadadır; `CLAUDE#§6` "private depoya commit" ilkesi ve `ROLLBACK#L17-25` "Backup before change / One target scope per GO" ilkesiyle uyumlu hale getirilmesi gerekir (§7 adım 1).

**Kapsam notu:** Bu iki mutasyon, kayıttaki **booking-engine** içerik mutasyonlarının tamamıdır; ancak "kayıttaki tek production mutasyonu" değildir — `MPS#L24,54,57` SEO/içerik tarafında başka canlı değişiklikler (Rank Math meta REST snippet'i, 164 sayfada focus keyword temizliği, 4 Antalya sayfası yeniden yapımı, kırık placeholder link onarımı) kaydeder. Bunlar bu lens'in dışındadır; kesişen tek nokta GO defteridir (Ç5).

**Tek seferlik izleme (SEL-122):** iki pilot sayfada rendered check, desktop `1366x900` + mobile `390x844`: HTTP 200, tam 1 `ag_home` form, çift form yok, literal shortcode yok, eski c6 selector yok, yatay taşma yok, console error yok. Tekrarlayan izleme, uyarı veya production audit trail kayıtta **yoktur** (`SEL156#L109`). — kaynak: `MONITOR#L32-47`

**WhatsApp Job Distribution:** bu adla modül, spec, workflow veya kod AGOS/platform depolarında **yoktur**; string yalnızca aynalanan brifingde (`CLAUDE#L101`) ve AG raporlarında geçer. En yakın karşılıklar: n8n Workflow C (dispatch) "not yet built" (`MPS#L70`; `alanyagroup-platform/N8N/` klasöründe yalnızca README var), AGSYNC "Supplier/driver live send remains HOLD" (`PASSHOLD#L57-58`), AGOS WHATSAPP_01–05 serisi (inbound triage/sınıflandırma, dry-run, `owner_go=false`; supplier dispatch **kapsam dışı** — `agos/WHATSAPP_01_ARCHITECTURE.md#L59`). Bağımsız güvenlik denetimi artefaktı yok (B8, `FC1-BC#L25`); kayıttaki tek "PASS" `agos/WHATSAPP_03_STATIC_SAFETY_REPORT.md#L11-13` — dry-run n8n JSON'unun **öz-değerlendirmeli statik** kontrolü; ne bağımsızdır ne dispatch hakkındadır; `CLAUDE#L101` kapısını **karşılamaz**. Durum: kurulmadı + aktive edilmedi + bağımsız denetlenmedi.

---

## 7. Uygulama adımları

Sıra bağlayıcıdır; her adım tek kapıya bağlıdır. Hiçbir adım bir öncekini atlamaz.

| # | Adım | Kapı | Çıktı / kabul |
|---|---|---|---|
| 1 | Owner/Hermes, `AG_BOOKING_OPTION_B_APPLY_01_BACKUPS/` klasörünü ve 2026-06-21 yedeğini Mac'ten **private** depoya commit eder (secret taraması sonrası, `CLAUDE#§6`). Hermes Görev 1B'ye eklenir (`HERMES#L110-118`). | [BASELINE] | Her iki mutasyonun `.before/.rollback` çiftleri versiyonlanmış; `MANIFEST.json` checksum'ları rapordakiyle eşleşir |
| 2 | `OWNER_GO_LOG.md` geriye dönük düzeltilir: 2026-06-21 (1 sayfa) ve 2026-06-24 SEL-121 (2 sayfa) GO'ları tarih, kapsam, kullanılan yöntem ve yedek yolu ile kaydedilir. | [SERBEST] | Defter, `MPS#L48` ve `APPLY#L3-5` ile tutarlı; "no OWNER GO yet" satırı kaldırılmış |
| 3 | **Submit-stage idempotency tasarımı** yazılır (AGOS-IDEMPOTENCY-GATE-01 gövdesi): `request_id` üretim algoritması (nonce + payload hash), double-click/retry davranışı, aynı `request_id` ile ikinci POST'un tek kayıt/tek voucher/tek e-posta ile sonuçlanması; `DUP` post-persist mekanizmasıyla sınır çizgisi. | [SERBEST] | Belge; `CLAUDE#§4` "çift voucher önleme"ye doğrudan bağlı kabul kriteri içerir |
| 4 | Owner, hedef durum modelini seçer: AGSYNC 10-durum mu, Admin-CMS 6-durum mu, ya da eşleme tablosu. | [OWNER GO] | Tek enum; eşleme belgesi `agos/` köküne |
| 5 | Voucher gate'i düzeltilir: `email` → koşullu; e-postasız rezervasyonda WhatsApp teslimatı; `MSCHEMA#L14` ile hizalanır. | [SERBEST] | `ARCH#L194-207` metni owner kararına uygun; Ç1 kapanır |
| 6 | Sayfa düzeyi form varlığı yeniden doğrulanır (anlam A): 906 URL rendered DOM sayımı, `agsc-v6`/`ag_home`/`c6`/`none` dağılımı, iki pilot sayfa + 2026-06-21 sayfası hâlâ 1 form mu. | [JETPACK] | Toplu sayılar public rapora; URL bazlı sonuç yalnızca `MATRIX`'e |
| 7 | "Confirm on WhatsApp" webhook alıcısı tespit edilir: hangi n8n workflow'u, aktif mi, ne saklıyor. Yalnızca okuma. | [ERİŞİM YOK] | Alıcı kimliği + saklama şekli kayda geçer; anlam B'nin cevabı buradan başlar |
| 8 | Hermes baseline: `preflight_baseline_check.sh` çıktısı; booking runtime + CLE modülü + (varsa) `ag-voucher.php` private depoya. Bu adım Ç2, Ç3, Ç7'nin önkoşuludur. | [BASELINE] | `BASELINE_COMPLETE=YES`; `HERMES#L115` satırı kapanır |
| 9 | Kaynak üzerinde okuma: CLE tetikleyici/şablon/idempotency; `wp_mail()` P0 yüzeyinin canlıda aktif olup olmadığı (`AMS#L168`); alias→renderer eşlemesinin mevcut hâli; AYT↔GZP reddinin ve kapasite doğrulamasının kod yolu. | [BASELINE] | Ç2, Ç3, Ç7 için "kayıt" sütunu kaynakla değiştirilir |
| 10 | CLE regresyon testi + çift voucher testi **sentetik adreslerle** (`example.invalid` alanı, sahte telefon — `PAYLOAD#L41-42` fixture kuralı) staging/local'de çalıştırılır. Gerçek müşteri/sürücü teması **yok**. | [OWNER GO] | `SFR-TS` `BOOKING_IDEMPOTENCY`, `NOTIFICATION_TEST`, `VOUCHER_TEST` satırları BLOCKED'dan PASS/FAIL'e; sonuç olduğu gibi raporlanır |
| 11 | Master Operations Sheet oluşturma (45 sütun) + dry-run sync; DB persist → Master → Category → Driver sırası; `request_id` tekillik kontrolü fail-closed. | [OWNER GO] | `PASSHOLD` "Google Sheet write: NO" → dry-run YES; production yazımı hâlâ yok |
| 12 | Operations Inbox'ın gerçek WhatsApp Business / Gmail inbox'a **salt-okunur** bağlanması (WHATSAPP_05 Faz 1, owner-redakteli gerçek mesaj batch'i). | [OWNER GO] | Sınıflandırıcı sentetik 11 mesaj yerine gerçek batch'te doğrulanır; hâlâ 0 gönderim |
| 13 | Supplier/driver gönderimi, müşteri onayı gönderimi, voucher gönderimi — her biri **ayrı** OWNER GO; WhatsApp Job Distribution için önce bağımsız güvenlik denetimi PASS. | [OWNER GO] | `CLAUDE#§5` yasakları yürürlükte kalır; `fjqbCav0JYRFI5w7` pasif |
| 14 | Tekrarlayan izleme: SEL-122 kontrol setinin (form sayısı, literal shortcode, console error, overflow) periyodik çalıştırılması + SLA eşiklerinin owner onayı. | [JETPACK] → [OWNER GO] | İzleme raporu; SLA eşikleri "planning default" etiketinden çıkar |

**Bugün yapılabilenler:** 2, 3, 5 — yalnızca belge; 2 owner imzası ister (defter owner-verified bellektir). Dokümantasyon güncellemesi yetki anlamına gelmez (`CLAUDE#§5`). Diğer her şey erişim, baseline veya GO bekler.

---

## 8. Kayıt bunu söylemiyor

1. Production CLE received/confirmed e-postasının **ne yaptığı** (tetikleyici, gönderen, alıcılar, şablon, idempotency, voucher eki) — hiçbir kayıtta yok; regresyon testi yazılır ama baseline alınamaz.
2. Canlı sitede rezervasyonun **kalıcı bir kaydı** olup olmadığı — webhook alıcısı tanımsız; `agp_booking` post tipi yalnızca yerel fixture'da.
3. **Gerçek rezervasyon verisi** hiçbir depoda yok (tasarım gereği) — "durum kontrolü" için sorgulanabilir kaynak yok; Master Sheet oluşturulmamış.
4. SEL-121 ve 2026-06-21 **rollback yedekleri** depoda yok; yerel Mac'te olduğu Temmuz 2026'da kaydedilmiş, bugün doğrulanamaz.
5. `OWNER_GO_LOG.md` iki gerçek GO'yu kaydetmiyor — **yetkili GO defteri yok**.
6. "WhatsApp Job Distribution" modülünün tanımı, kapsamı, güvenlik denetimi ölçütleri — yok; "PASS" koşulu tanımsız.
7. Voucher modülü yok; şablon, teslimat kanalı, e-postasız müşteri için fallback tanımlanmamış.
8. Tekrarlayan izleme, uyarı, production logging/audit trail yok; SLA eşikleri owner onayı bekliyor.
9. `app.alanyagroup.com` staging'in bugün ayakta olduğuna dair 2026-06-29 sonrası kanıt yok (kayıt: `agos/AGOS_MASTER_ROADMAP_2026_V2.md#L36-44`; AG paketleri staging'i hiç kaydetmedi — `FC1-BC#L22`).
10. WHATSAPP_05 Faz 1 (gerçek mesaj batch'i) hiç üretilmedi; sınıflandırıcı yalnızca 11 sentetik mesajla doğrulandı.
11. Gerçek WhatsApp Business / Gmail inbox hiç bağlanmadı; WHATSAPP_03 ve BRIDGE_02 n8n'e import edilmedi.
12. AYT↔GZP server-side reddi ve kapasite doğrulamasının **hangi kod yolunda** yaşadığı — booking core kaynağı yok.
13. İki rezervasyon durum modelinin (10'lu / 6'lı) hangisinin hedef olduğu.
14. Submit-stage idempotency anahtarının nasıl üretileceği — AGOS-IDEMPOTENCY-GATE-01 gövdesi yok.

---

## 9. Düzeltilen / elenen iddialar

İki-lens doğrulama sonucu: **6 iddia olduğu gibi tutuldu** (OPS-03, 04, 10, 11, 12, 13), **8 iddia düzeltildi** (OPS-01, 02, 05, 06, 07, 09, 17, 18), **çürütülen iddia yok** (0). Düzeltmeler:

| ID | Eski ifade | Düzeltme |
|---|---|---|
| OPS-01 | İki geçiş OWNER GO'ya bağlı | Üç OWNER GO noktası; voucher geçişi "voucher gate / gelecek sprint"; ayrıca uzlaştırılmamış 6'lı Admin-CMS enum'u var (§2.2) |
| OPS-02 | `request_id`+hash "çift kayıt/çift voucher önleme mekanizması" | Yalnızca post-persist sheet sync'i; submit-stage koruma tasarlanmamış, voucher dedupe ertelenmiş (§2.3) |
| OPS-05 | Rezervasyon durumu "yalnızca WhatsApp + webhook alıcısında" | Çıkarım olarak etiketlendi; AGOS homepage-pilot `wp_mail()` yüzeyi ve `CLAUDE#§4` CLE varsayımıyla çelişki görünür kılındı (§3.1, §3.3, Ç2) |
| OPS-06 | AGOS bildirim tarafı "yalnızca" üç belge; regresyon testi "tanımlanamaz" | Delivery Runtime, D-011, `wp_mail()` P0 eklendi; "tanımlanabilir, çalıştırılamaz" (§3.3) |
| OPS-07 | Voucher gate'i e-postayı zorunlu sayar | Aynı paketin `MSCHEMA#L14` `conditional` der — paket içi çelişki eklendi (Ç1) |
| OPS-09 | En yakın karşılık Workflow C + AGSYNC | WHATSAPP_01–05 serisi ve öz-değerlendirmeli `WHATSAPP_03` statik PASS ayrıca adlandırıldı (§6) |
| OPS-17 | SEL-121 "kayıttaki tek gerçek production mutasyonu" | İkinci booking-engine mutasyonu (ilki 2026-06-21); SEO tarafında başka canlı değişiklikler var (§6) |
| OPS-18 | Yedek klasörü "hiçbir depoda yok" (kayıp imasıyla) | Kasıtlı `.gitignore` + RC dışlama; Temmuz 2026'da yerelde mevcut; bugün doğrulanamaz (§6) |

**İki-lens doğrulamasından geçmeyen, bu bölümde kullanılan satırlar** (kaynak bu oturumda doğrudan okundu): `GOLOG#L3` (Ç5), `MONITOR#L32-47` (SEL-122), `ROLLBACK#L17-25`, `ARCH#L178-192` (SLA), `SFR-TS#L88-100` (acceptance BLOCKED satırları), `ACCESS_STATUS.md` (bu oturumun kendi ölçümü). Reader-only bulgular (OPS-08, 14, 15, 16, 22, 24, 26, 28, 30) yalnızca §3.2 uyum notu ve §8 boşluk listesinde, yük taşımayan bağlam olarak kullanıldı.

**Açıklama kararı:** Bu belge public depodadır. Sayfa ID'leri, URL bazlı form eksikliği listesi, host yolları, DB tanımlayıcıları, telefon/e-posta ve fixture satırları **taşınmamıştır**; yalnızca toplu sayılar ve sayfa tipleri verilmiştir. URL bazlı detay için `MATRIX` (özel) ve `APPLY#L13-14` (özel) kullanılır.

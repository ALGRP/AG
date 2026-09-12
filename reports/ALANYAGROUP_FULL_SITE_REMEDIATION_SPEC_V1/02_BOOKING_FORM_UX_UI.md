# 02 — Rezervasyon Formu: UX ve UI

> **Durum**
> 1. **Kayıt ne kuruyor:** Canlı canonical form `[ag_home_booking … layout="hero"]` akışı kayıtta *tarif edilmiş* (tarih → yolcu sayacı → Google Places pickup → ad + WhatsApp → not → canlı fiyat toplamı → "Confirm on WhatsApp"); ölçülmüş tek UI baseline'ı iki pilot sayfadaki `layout="compact"` formudur (5 alan + 1 buton, 1366/390 px'de taşma yok); depodaki tek form artefaktı `agbooking_hero_transfer_tour_final.html` ise **0 `<form>`, 0 gönderim, 0 fiyat** içeren görsel bir kabuktur ve hiçbir belge adını anmaz. — kaynak: `MPS#L41`, `MONITOR#L60-65`, `ARTEFAKT` (sayım §1.3)
> 2. **Bugün ne yapılabilir:** Canlı siteye **hiçbir kanaldan** erişim yok (Jetpack `site_disconnected`, Semrush API birimi 0, doğrudan HTTPS 403, Hermes teslimatı 0 commit). Bu bölümdeki her "canlı site" ifadesi **kayıt-türevidir**; hiçbir DOM, hız veya rezervasyon ölçümü yapılmadı. `owner_go = false`. — kaynak: `AG/reports/ALANYAGROUP_FULL_SITE_REMEDIATION_SPEC_V1/ACCESS_STATUS.md#L7-12,23`
> 3. **Bu bölüm neyi tanımlıyor:** Hedef rezervasyon formunun alan seti, akışı, fiyat/ret/dönüş/e-posta/kapasite davranışının **UI tarafı**, layout varyantı × sayfa tipi eşlemesi, erişilebilirlik gereksinimleri ve kabul kriterleri — `CLAUDE#§4` kilitli kararlarına bağlı olarak. Kod yazılmaz; kaynak (`ag_hlp_*`, `ag-home-booking-shortcode.php`) hiçbir depoda yoktur. — kaynak: `CLAUDE#§3`

**Kısaltmalar (kaynak yolları, depo-göreli):**

| Kısaltma | Yol |
|---|---|
| `ARTEFAKT` | `agos/agbooking_hero_transfer_tour_final.html` (580 satır) |
| `MPS` | `alanyagroup-platform/AI_COMMAND_CENTER/MASTER_PROJECT_STATUS.md` |
| `CLAUDE` | `AG/CLAUDE.md` (üç depoda birebir aynı md5) |
| `MONITOR` / `APPLY` | `agos/AG_BOOKING_OPTION_B_PILOT_MONITOR_01_REPORT.md` / `agos/AG_BOOKING_OPTION_B_APPLY_01_REPORT.md` |
| `DM` / `WADM` | `agos/AG_ADMIN_CMS_01_DATA_MODEL.md` / `agos/WHATSAPP_01_RESERVATION_DATA_MODEL.md` |
| `MATRIX` | `agos/AG_BOOKING_PRIORITY_MATRIX.csv` — **özel fixture**, 699 satır; kopyası `agos/ag-platform-v2-admin-cms/fixtures/` altında. URL bazlı detay yalnızca oradadır; bu belgeye taşınmaz. |
| `HERMES` | `AG/handoff/HERMES_TASK_PACKET_01.md` |
| `RECON` | `AG/reports/ALANYAGROUP_RECONCILED_BOOKING_CANDIDATE_V1/TASK_STATUS.md` |
| `SFR` / `FC1` | `AG/reports/ALANYAGROUP_SITE_FINAL_REMEDIATION_V1/` / `AG/reports/ALANYAGROUP_FINAL_COMPLETION_V1/` |
| `AMS` / `MD` / `OD1` | `agos/master-status/AGOS-MASTER-STATUS.md` / `agos/decision-ledger/MASTER-DECISIONS.md` / `agos/AG_BOOKING_OWNER_DECISION_01.md` |

---

## 1. Kayıttaki form yüzeyleri

### 1.1 Canlı canonical akış — kayıt-türevi, doğrulanmamış

| Adım | Kayıt | Kaynak |
|---|---|---|
| Shortcode | `[ag_home_booking context="single_hero" default_service="transfer" layout="hero" ...]` — dize `...` ile kısaltılmış; tam öznitelik seti kayıtta yok | `MPS#L40` |
| Akış | `date → guest steppers → Google Places pickup (bölge kısıtlı, place_id + lat/lng) → name + WhatsApp → notes` | `MPS#L41` |
| Fiyat | **"Live price total"** — client-side gösterilen toplam | `MPS#L41` |
| CTA | **"Confirm on WhatsApp"**: n8n webhook'u tetikler **ve** önceden doldurulmuş WhatsApp mesajı açar; ön ödeme/hesap yok | `MPS#L41` |
| Öznitelikler | `context`, `default_service`, `layout ∈ {inline, compact, hero}` — kaynak dosyadan türetilmiş tek kayıt; dosya hiçbir depoda yok | `APPLY#L29`; `CLAUDE#§3` |
| Alanlar | E-posta, koltuk seçimi, hizmet sınıfı (shuttle/private/VIP), havalimanı seçici, uçuş no: akış tarifinde **anılmıyor** — "yok" demek değildir; önceki paket "erişimsiz doğrulanamaz" demiştir | `MPS#L41`; `FC1/BLOCKERS_AND_CONFLICTS.md#L136-146` (C7) |

`FC1` paketi `CLAUDE#§8`'de "kısmen geçersiz" işaretlidir; geçersizlik envanter ve telefon bulgularına aittir. Akış tarifi `MPS#L41`'de bağımsız olarak da yer alır.

### 1.2 Ölçülmüş tek UI baseline'ı — pilot `layout="compact"`

Kayıtta "Visible fields / Overflowing controls" sütunu taşıyan tek rapor budur (üç depoda grep: 1 dosya). İki pilot sayfa (bir otel-transfer, bir tur sayfası) `[ag_home_booking context="transfer_landing" default_service="transfer" layout="compact"]` ile eklenmiştir — kaynak: `APPLY#L29-33`.

| Ölçüm | Desktop 1366 px | Mobil 390 px | Kaynak |
|---|---:|---:|---|
| Görünür alan | 5 | 5 | `MONITOR#L62-65` |
| Görünür buton | 1 | 1 | `MONITOR#L62-65` |
| Taşan kontrol | 0 | 0 | `MONITOR#L62-65` |
| Yatay taşma | yok | yok | `MONITOR#L62-65` |
| Konsol hatası (4 render) | 0 | 0 | `MONITOR#L69` |
| Konsol uyarısı | `google.maps.places.Autocomplete` 2025-03-01 itibarıyla yeni müşterilere kapalı (tekrarlayan) | | `MONITOR#L71-75` |

Bu ölçüm pilot tarihine aittir; bugün yeniden üretilemez (erişim yok).

### 1.3 HTML artefaktı — sayım tablosu (bu oturumda doğrudan ölçüldü)

`ARTEFAKT` başlığı "AGOS Transfer + Tours Booking Hero" (`#L6`). Kök sınıfları `.ag-booking` / `.ag-panel` (`#L367-368`).

| Sayım | Değer | Kaynak / satır |
|---|---:|---|
| `<form>` elemanı | **0** | tüm dosya |
| Girişlerde `name=` | **0** | tüm dosya (tek `name=` eşleşmesi `<meta name=…>`) |
| `required` | 0 | tüm dosya |
| `fetch(` / `XMLHttpRequest` / `.submit(` / `action=` | **0** | tüm dosya |
| CTA'lar | 2 × `type="button"`, dinleyicisiz: "Search Transfer →", "Search Tours →" | `#L422`, `#L481` |
| `<input>` / `<select>` / `<button>` | 10 / 1 / 11 | tüm dosya |
| Fiyat / € / EUR | **0** | tüm dosya |
| `AYT` / `GZP` | 0 | tüm dosya |
| Hizmet sınıfı seçici | 0 — "Private, VIP & Shuttle" yalnızca dekoratif kicker | `#L353` |
| Havalimanı seçici | 0 — "Airport" yalnızca H1 ve güven şeridi | `#L354`, `#L488` |
| `type="email"` / `type="tel"` | 0 / 0 | tüm dosya |
| Ad / WhatsApp / not alanı | 0 | `#L369-481` |
| Google Maps script | 0 — `from`/`to`/`hotel` düz metin `<input>` | `#L373`, `#L381`, `#L430` |
| Canonical belirteç (`.ag-home-booking-shortcode`, `.ag-home-search`, `[data-ag-home-booking-root]`) | **0** | tüm dosya; belirteç tanımı `agos/AG_ADMIN_CMS_01_CURRENT_STATE_AUDIT.md#L65` |
| `seat` / `koltuk` | 0 | tüm dosya |
| Sayaç sınırları | `passengers/adults: {min:1,max:60}`, `children: {min:0,max:60}` — yalnızca inline JS clamp | `#L555-557`, `#L574` |
| Dönüş | `+ Add Return` (`aria-expanded`) → `returnDate` (date) + `returnTime` (time) popover | `#L405-420`, `#L546-551` |
| Tur sekmesi | 6 sabit seçenek (All Activities, Jeep Safari, Boat Trip, Rafting, Buggy / Quad, Land of Legends); otel serbest metin; yalnızca tarih | `#L438-445`, `#L430`, `#L453` |
| Layout | yalnızca hero; `compact`/`inline` 0; kırılımlar ≤1050 px (2 sütun) ve ≤680 px (1 sütun) | `#L144`, `#L327`, `#L338` |
| Ödeme ifadesi | "Pay in vehicle where applicable" / "Pay in vehicle — No online payment" | `#L355`, `#L486` |
| Güven rozeti | "Flight tracking / Airport pickups monitored" — formda uçuş no alanı yok | `#L488` |
| Harici görsel | 2 Unsplash hotlink | `#L44`, `#L48` |
| `<html lang>` / i18n kancası | `en` / 0 | `#L2` |

**Sonuç:** veri hiçbir yere gitmez; artefakt kabul sayacı altında `booking_engine=none` sayılır (0 belirteç, 0 form — `agos/AG_ADMIN_CMS_02_REGISTRY_COLUMNS.md#L138`) ve "tam olarak bir booking formu" testini (`OD1#L150`, `#L208`; `SFR/EXECUTION_PLAN.md#L61`) düşürür. Kayıt-türevi çıkarımdır.

### 1.4 Provenance — yok

| Kontrol | Sonuç | Kaynak |
|---|---|---|
| `agos` git geçmişi | 2 commit; `f420b0e` (2026-07-11) **ebeveynsiz kök commit**, 427 dosyalık düz anlık görüntü — "Merge PR #5" yalnızca konu satırı, dosya bir merge ile "girmiş" değildir | `git -C agos log`; `rev-list --max-parents=0` |
| Dosya adını anan belge (AG, agos, alanyagroup-platform) | **0** | grep |
| `CLAUDE#§4`'te "hero" | 0 — owner belleğindeki tek "hero" `MPS#L40`'taki `layout="hero"` özniteliğidir, bu dosyaya atıf değildir | `CLAUDE#L69-82`; `MPS#L40` |
| Tasarım sistemi eşleşmesi | Artefakt paleti (`#1d6ff2` / `#f4b233` / `#07131f`, sistem font — `ARTEFAKT#L8-18`) 2026-06-22 kararının hiçbir rengiyle eşleşmiyor (`#0E2A33` / `#0FA3A3` / `#C9A227` / `#F7FAFC`, serif + Inter — `MPS#L31`) | |

**Artefakt owner-onaylı tasarım olarak kabul edilemez.** Referans mockup olarak dahi kullanılacaksa `[OWNER GO]` gerekir.

---

## 2. Kilitli §4 kararları × kayıt × artefakt — uyum matrisi

| §4 kararı (`CLAUDE#L`) | Kayıttaki canlı akış | Artefakt | Durum |
|---|---|---|---|
| Canonical `[ag_booking_engine]` + 3 alias (`#L69-71`) | canlı `[ag_home_booking]` (`MPS#L39-40`) | belirteç 0 | Alias ile korunur; bkz. §3 satır 2-3 |
| Shuttle 30/50/60/70/80/90 (`#L72`) | "Live price total", tablo belirtilmemiş (`MPS#L41`) | fiyat 0 | UI kancası: canlı formda **var** (client-side), artefaktta **yok** |
| AYT↔GZP shuttle yasak, ret server-side, private/VIP serbest (`#L73-74`) | havalimanı/hizmet sınıfı akışta anılmıyor | AYT/GZP 0, sınıf seçici 0 | UI'da **ne tetiklenir ne gösterilir** — form bu kuralı ifade edemiyor |
| Ödeme: araçta nakit (`#L75`) | — | "Pay in vehicle where applicable" (`#L355`) | Kısmi: "nakit" yok, "where applicable" belirsiz |
| E-posta alanı opsiyonel (`#L76`) | akışta e-posta adımı anılmıyor (`MPS#L41`) | e-posta 0 | Karar bir **alanın varlığını** varsayar; bkz. §3 satır 4 |
| Manuel koltuk seçimi kaldırıldı; kapasite backend'de (`#L77-78`) | koltuk adımı tarif edilmiyor (`SFR/TASK_STATUS.md#L59-60`) | koltuk 0; sayaç max 60 yalnızca JS | UI sınırı yetkili değil; kapasite değeri kayıtta yok |
| Fiyat yalnızca server-side (`#L79`) | client-side "Live price total" (`MPS#L41`) | fiyat 0 | Canlı form kayda göre **tam hedef**; artefakt trivially uyumlu |
| CLE received/confirmed regresyonsuz (`#L80`) | CLE modülü 5 depoda 0 (`RECON#L24-29`) | — | Spec düzeyinde yazılabilir, doğrulanamaz |

---

## 3. Çelişki tablosu — owner kararı | kayıt | durum

Hiçbiri sessizce çözülmemiştir. `CLAUDE#§4` geçerlidir; eski kayıtlar açıkça listelenir.

| # | Konu | Owner kararı (`CLAUDE#§4`) | Kayıt | Durum |
|---|---|---|---|---|
| 1 | Shuttle fiyat tablosu | 1=30 · 2=50 · 3=60 · 4=70 · 5=80 · 6=90 (`#L72`) | (a) `MPS#L23`: 3=70 · 4=80, kapsam "Alanya↔Antalya only"; (b) D-008 `MD#L57-58` (= `AMS#L189`): yalnızca 1=30 · 2=50, 3+ sessiz; (c) `MPS#L85` §7 yatırımcı planı: "€30–€80 dynamic per-seat (AYT + GZP)" — staging-only, OWNER GO gerektirir (`MPS#L88`) | **§4 geçerli.** Dört kayıt dört farklı; (c) hem sabit tabloyla hem (a)'nın kapsamıyla çelişir |
| 2 | Alias adları | `[ag_transfer_booking_form]`, `[agp_booking_engine]` geçici alias (`#L70-71`) | `OD1#L160`, `agos/AG_BOOKING_OWNER_DECISION_CHECKLIST.md#L33-34`, `MPS#L47`: "kullanma / uydurma / canlıda yok" | **§4 geçerli** — aynı renderer'a bağlanınca literal-metin riski kalkar (`RECON#L39-46`) |
| 3 | `ag_home_booking` statüsü | **geçici** alias (`#L70`) | `OD1#L54`, CHECKLIST `#L31`, `agos/AG_ADMIN_CMS_01_ARCHITECTURE.md#L33`, `MPS#L39`: **kalıcı** hedef engine; `AMS#L173,197,207`: alias stratejisi hâlâ **açık** owner kararı, `AGOS-BOOKING-SURFACE-GATE-01` kapısı kapatılmamış | **Açık.** §4 "geçici" der ama 13 canlı `ag_home` sayfasının `[ag_booking_engine]`'e taşınmasını hiçbir kayıt onaylamaz; AGOS kapısı ayrıca kapatılmalı |
| 4 | E-posta | alan **opsiyonel**; boş e-posta booking'i engellemez (`#L76`; `HERMES#L247`) | `agos/AGSYNC_OPS_01_OPERATIONS_CENTER_ARCHITECTURE.md#L204`: voucher yalnızca "… customer name, phone, **email** … present" ise üretilir → e-posta **zorunlu** | **§4 geçerli**, ancak voucher kapısı e-posta-bağımsız yeniden tanımlanmadıkça e-postasız booking "Voucher Ready" öncesinde takılır |
| 5 | Shuttle rota kapsamı | yalnızca AYT↔GZP yasağı (`#L73`); kapsam belirtilmemiş | `MPS#L23`: "Alanya↔Antalya only"; önceki görev metni AYT↔Side/Belek/Kemer + Alanya↔GZP'ye genişletiyordu (`FC1/BLOCKERS_AND_CONFLICTS.md#L88-89`); Okurcalar/Avsallar/Türkler GZP kümesinde (`SFR/FINDINGS_AND_CONFLICTS.md#L99-102`) | **Açık** — form hangi rotalarda "shuttle" sunacak, karar yok |
| 6 | Tasarım sistemi | §4'te yok | `MPS#L31` (2026-06-22 kararı) vs `ARTEFAKT#L8-18` | **Açık** — artefakt provenance'sız (§1.4); `MPS#L31` tek owner-kayıtlı palet |
| 7 | Mobil yerleşim | §4'te yok | `MPS#L34`: "sticky bottom booking bar + WhatsApp FAB" — artefaktta yok (`ARTEFAKT#L326-345` yalnızca sütun daraltma) | **Açık** — kayıt lehine |
| 8 | "D-M-Y tarih", "Places fallback → manuel adres" | §4'te **yok** | yalnızca AG raporlarının owner görev metnini özetlediği satırlar (`SFR/EXECUTION_PLAN.md#L48`, `SFR/FINDINGS_AND_CONFLICTS.md#L39`); AGOS + platform birincil kaydında **0 eşleşme**; görev metninin kendisi hiçbir depoda yok | **Owner teyidi gerekir** — bu spec §4.6/§4.7'de öneri olarak etiketler |
| 9 | Ödeme ifadesi | "araçta nakit" (`#L75`) | `FC1/BLOCKERS_AND_CONFLICTS.md#L124-128` (C6): "cash or card" ifadesini koru vs temizle çelişkisi | **Açık** — tek kelime owner teyidi |

---

## 4. Hedef form spesifikasyonu — UI/UX

Etiketler: **[KAYIT]** = kayıttan türetildi · **[§4]** = kilitli karar · **[ÖNERİ]** = bu spec'in önerisi, owner kararı gerektirir.

### 4.1 Alan seti — iki kayıt modelinin birleşimi

`DM#L115-131` (`ag_booking_request`) ve `WADM#L56-82` (`ag_reservation_draft`) birleştirilmiştir. Artefakt bunlardan yalnızca tarih/yolcu/dönüş karşılıklarını içerir.

| Alan | Tip | Zorunlu | Kaynak | Not |
|---|---|---|---|---|
| `service_class` | enum `shuttle` / `private` / `vip` | evet | `DM#L109` (`class` enum), `WADM#L77` (`vehicle_preference`) | **[ÖNERİ]** seçici; canlı akışta anılmıyor. AYT↔GZP reddi ve shuttle tablosu bu alan olmadan tetiklenemez |
| `pickup` / `dropoff` | Places (`place_id` + lat/lng) veya serbest metin | evet | `MPS#L41`; `DM#L126-127` ("if supplied", "Optional") | Places opsiyonel alan; fallback için §4.7 |
| `airport_code` | enum `AYT` / `GZP` / `not_applicable` | koşullu | `WADM#L74` | **[ÖNERİ]** pickup/dropoff'tan türetilir veya seçilir; ret kuralı buna bağlı |
| `travel_date_time` | datetime | evet | `DM#L124`; `MD#L60-61` | Tel format ISO; §4.6 |
| `guest_count` (`passenger_count`) | integer, min 1 | evet | `DM#L125`; `WADM#L75` | Sayaç; üst sınır sunucudan (§4.9) |
| `child_seat_count` | integer | hayır | `WADM#L76` | **[ÖNERİ]** — çocuk/bebek sayımı kayıtta tanımsız (§7) |
| `return_transfer_requested` + `return_pickup_date/time` | boolean + date/time | koşullu | `WADM#L78-80`; `MD#L60-61` (D-009) | §4.5 |
| `flight_number` | string | hayır | `WADM#L70` | **[ÖNERİ]** havalimanı karşılamada istenir-ama-opsiyonel; artefakt "Flight tracking" vaat eder (`ARTEFAKT#L488`) ama alanı yok |
| `customer_name` | string | evet | `DM#L121`; `MPS#L41` | |
| `customer_whatsapp` | tel | evet | `DM#L122`; `MPS#L41` | Birincil kanal |
| `customer_email` | email | **hayır** | `CLAUDE#L76`; `agos/AGSYNC_OPS_01_MASTER_SHEET_SCHEMA.csv#L14` ("if supplied"); `WADM#L67` | **[§4]** alan var, opsiyonel — §4.8 |
| `notes` | textarea | hayır | `MPS#L41` | |
| `luggage_count` | integer | hayır | `WADM#L76` | **[ÖNERİ]** ikincil |
| `price_snapshot` | JSON | — | `DM#L130` ("Immutable calculated quote snapshot") | **Sunucuda üretilir; formdan gönderilmez** [§4 `#L79`] |
| `source` | enum | — | `DM#L120` | Renderer tarafından set edilir (`ag_home` / alias) |

### 4.2 Akış — kayıt sırası korunur [KAYIT]

`date → guest steppers → pickup → name + WhatsApp → notes → price (sunucu) → CTA` (`MPS#L41`). Eklenen tek adım hizmet sınıfı seçimidir [ÖNERİ]; artefaktın "Search Transfer →" CTA'sı (`ARTEFAKT#L422`) ve ayrı arama sayfası yaklaşımı kayıtla uyuşmaz — tek adımlı, WhatsApp-onaylı akış kalır.

### 4.3 Fiyat gösterimi [§4 `#L79`]

- Form yalnızca girdileri gönderir; fiyat **quote endpoint'inden** gelir ve salt-okunur gösterilir; submit payload'ında fiyat alanı olmaz ya da sunucu yok sayar; `price_snapshot` sunucuda üretilir (`DM#L130`).
- Kayıttaki "Live price total" (`MPS#L41`) client-side hesaplanıyorsa **bu kuralın tam hedefidir**; hesap sunucuya taşınır, UI yalnızca yanıtı yansıtır. Canlı DOM erişilemediğinden hesabın nerede yapıldığı **doğrulanamaz** — Hermes baseline'ının ilk sorusu olmalı.
- Shuttle tablosu `CLAUDE#L72`; sayfa gövdesindeki statik "from €X" private-transfer kopyası (`MPS#L23`; `HERMES#L159-162`) **ayrı iş kalemidir**, form fiyatına ait değildir.

### 4.4 AYT↔GZP reddi — UI davranışı [§4 `#L73-74`]

- Yetki sunucuda: `service_class=shuttle` ∧ `{pickup,dropoff} ⊇ {AYT,GZP}` (her iki yön, dönüş bacağı dahil) → quote/submit **reddedilir**.
- UI: sunucu red yanıtı için form-içi hata mesajı + aynı rotada `private`/`vip`'e geçiren CTA [ÖNERİ]; client ön-kontrolü yalnızca kolaylık, atlanabilir olduğu varsayılır.
- Okurcalar/Avsallar/Türkler GZP kümesinde kalır (`SFR/FINDINGS_AND_CONFLICTS.md#L101-102`); GZP kümesinin km verisi kayıtta yok (`MPS#L22`).

### 4.5 Dönüş yolculuğu [KAYIT D-009 `MD#L60-61`]

- Dönüş yalnızca **açık seçim + dönüş tarih/saat** ile `true`; toplam = tek yön × 2.
- Artefakt yapısal olarak uyar (`+ Add Return` → date + time, `ARTEFAKT#L405-420`) ama: `is_return` bayrağı yok; "Remove Return" yalnızca gizler, değerler DOM'da kalır (`#L546-551`); dönüş ≥ gidiş kontrolü 0. Spec: kaldırınca değerler temizlenir; dönüş < gidiş client'ta engellenir, sunucuda tekrar doğrulanır; dönüş bacağı da AYT↔GZP kontrolünden geçer.
- ×2 kuralının shuttle için de geçerli olup olmadığı kayıtta yok (§7).

### 4.6 Tarih/saat

- Tel format ISO `YYYY-MM-DDTHH:MM` (artefakt native `datetime-local`, `ARTEFAKT#L389`, `#L512-513`). Görüntü formatı native picker'da cihaz yereline bağlıdır; site kontrol edemez.
- **"D-M-Y"** [ÖNERİ, §3 satır 8]: özet/onay ekranı, WhatsApp mesajı ve e-posta gövdesinde `GG-AA-YYYY` görüntü formatı; tel format ISO kalır.
- Artefakt `min`/`value`'yu ziyaretçi tarayıcısının yerel saatine göre kurar (`#L505-516`); `Europe/Istanbul` referansı 0. Spec [ÖNERİ]: pickup saati **Europe/Istanbul** olarak etiketlenir ve sunucuda o dilimde yorumlanır — saat dilimi kararı kayıtta yok (§7).

### 4.7 Google Places ve fallback

- Canlı canonical form Places kullanır, bölge kısıtlı, `place_id` + lat/lng saklar (`MPS#L41`); `pickup_place_id` "if supplied", `pickup_lat_lng` "Optional" (`DM#L126-127`) → alan opsiyoneldir [KAYIT].
- Legacy `google.maps.places.Autocomplete` yeni müşterilere kapalı (`MONITOR#L71-75`); ürün seçimi (`PlaceAutocompleteElement`) ve tarayıcı anahtarı kısıtı owner kararı bekliyor (`AMS#L198`). Distance Matrix için IP kısıtlı server key **OWNER BLOCKER** (`SFR/FINDINGS_AND_CONFLICTS.md#L44`); anahtar koda gömülmez (`CLAUDE#§5`).
- **[ÖNERİ — kayıtta yok]:** Places yüklenemezse serbest metin adres kabul edilir; `pickup_place_id` boşken booking engellenmez; km'ye bağlı private fiyat hesaplanamıyorsa fiyat alanı "WhatsApp'ta teyit edilecek" moduna düşer. Üçü de owner kararı gerektirir.

### 4.8 E-posta [§4 `#L76`]

- Alan **var ve opsiyonel** — UI, backend, API'de tutarlı; boş e-posta booking'i engellemez (`HERMES#L247`). Geçerlilik: doluysa format kontrolü; boşsa atlanır (test matrisi: empty/valid/invalid — `SFR/TASK_STATUS.md#L108-112`).
- **[ÖNERİ]:** boşken CLE received/confirmed müşteri e-posta adımı atlanır, doluysa mevcut davranış değişmeden korunur. Kayıt yalnızca "CLE regresyona uğramaz" der (`CLAUDE#L80`; `HERMES#L251`); CLE'nin müşteri dışı (ops) alıcısı olup olmadığı Hermes baseline'ında teyit edilir.
- Voucher kapısı (§3 satır 4) e-posta-bağımsız yeniden tanımlanmalıdır; aksi hâlde §4 kararı operasyonda ölü kalır.

### 4.9 Yolcu sayısı ve kapasite [§4 `#L77-78`, `#L107`]

- Manuel koltuk seçimi yok; sayaç `guest_count` shuttle koltuğunu belirler.
- UI üst sınırı yetkili değildir (artefakt 60 — `ARTEFAKT#L555-557` — hiçbir kayıtla ilişkili değil). Kapasite doğrulaması backend'de; **kapasite değerleri kayıtta yok**: `capacity_passengers` yalnızca tanımlı, değersiz (`DM#L110`); "Sprinter 11+1" yatırımcı planı rakamıdır, filo kaydı değil (`MPS#L85`).
- Spec [ÖNERİ]: sayaç üst sınırı quote yanıtındaki `max_passengers` ile kurulur; aşımda sunucu reddi UI'da alan-içi hata olarak gösterilir.

### 4.10 Layout varyantı × sayfa tipi

Renderer üç layout'u kabul etmelidir (`APPLY#L29`); Option B pilot dizesi (`APPLY#L33`) ve canlı homepage dizesi (`MPS#L40`) kırılmamalıdır. 13 `ag_home` satırının en az biri (homepage hero) shortcode değil `ag-homepage-live-pilot` şablonundan render edilir (`agos/AG_BOOKING_COVERAGE_INVENTORY.csv`, `evidence_source` sütunu) — alias tek başına onu korumaz; şablonun çağırdığı renderer sözleşmesi de korunur.

| Batch (`MATRIX`, `proposed_batch` sütunu) | URL | Sayfa tipi | Önerilen layout | Not |
|---|---:|---|---|---|
| Batch 1 — Top revenue | 94 | havalimanı/şehir transfer landing | `hero` (üst) veya `compact` | Homepage `hero` kayıtlı (`MPS#L40`) |
| Batch 2 — Hotel transfer | 321 | otel-transfer içerik sayfası | `compact` / `inline` | Pilot bu tiptedir (`APPLY#L33`); artefakt bu varyantı **sağlamaz** |
| Batch 3 — Tours & activities | 51 | tur/aktivite | `compact`, `default_service="tour"` | "Form yerleşimi ve hizmet varsayılanları farklı olabilir" (`agos/AG_BOOKING_BATCHES.md#L145`); tur akışı için kilitli karar yok |
| Batch 4 — Destination guides | 16 | rehber | `inline` | |
| Batch 5 — Remaining optional | 108 | çeşitli | karar sonra | |
| NO_BOOKING_NEEDED / EXCLUDE_SYSTEM | 92 / 17 | — | form yok | |

Toplam 699 satır = 466 `MUST_HAVE_BOOKING` + 124 `SHOULD_HAVE_BOOKING` + 92 + 17 (`MATRIX`, `priority_group`); 178 satır `NON_EN_OR_ENCODED_REVIEW_WPML_SCOPE` (`language_scope_note`). Sayfa tipi dağılımı: 629 `post` / 70 `page` (`page_type`). **Kapsam doldurma ayrı OWNER GO gerektirir** (`CLAUDE#§2`). Mobilde `MPS#L34` sticky bar + WhatsApp FAB kararı geçerlidir; layout'tan bağımsız uygulanır.

### 4.11 Erişilebilirlik gereksinimleri

Kayıttaki tek erişilebilirlik ilke seti admin paneli içindir: klavye gezinmesi, görünür odak, ekran okuyucu etiketleri, koyu/açık kontrast, yalnızca renkle durum bildirmeme (`agos/AGCP_02_DESIGN_TOKENS.md#L98-107`). Public form için WCAG seviyesi tanımsız (§7). Aşağıdaki ölçümler artefakta aittir ve bu oturumda doğrudan sayılmıştır; hedef gereksinimler [ÖNERİ, WCAG 2.2 AA varsayımıyla].

| Artefakt bulgusu | Satır / sayım | Hedef gereksinim |
|---|---|---|
| Odak göstergesi kaldırılmış: `outline:0` ×2, `:focus`/`:focus-visible` 0 | `ARTEFAKT#L183`, `#L291`; grep 0 | Görünür `:focus-visible` her etkileşimli öğede (WCAG 2.4.7) |
| Sayaç butonları 28×28 px | `#L204` | ≥ 24 px (2.2 AA asgari) — mobilde ≥ 44 px hedeflenir |
| 6 sayaç butonunun erişilebilir adı yalnızca `−`/`+` glifi; `aria-label` toplamda 1 (tablist); `aria-live` 0; değer `readonly type="text"` ×3 ("1 Adult" → `replace(/\D/g,"")`, çeviride kırılgan) | `#L399`, `#L561`; grep | `aria-label` ("Yolcu sayısını artır"), `aria-live="polite"` değer bölgesi, sayısal değer + ayrı etiket |
| Sekmeler: `role=tablist/tab/tabpanel`, `aria-selected`, `aria-controls` doğru; yalnızca `click`, `keydown` 0 | `#L358-365`, `#L538-539`; grep 0 | Ok tuşu gezinmesi + roving tabindex (WAI-ARIA Tabs) |
| Return popover: `aria-expanded` güncelleniyor, `aria-controls` yok, Escape 0, odak yönetimi yok | `#L546`; grep 0 | `aria-controls`, Escape ile kapanma, odak popover'a/geri |
| 9 `.ag-icon` + 4 `.ag-trust-icon` emoji div'i, `aria-hidden` 0; 2 sekme etiketi emoji ile başlıyor | `#L360`, `#L363`, `#L486-489`; grep | Dekoratif ikon `aria-hidden="true"` |
| Placeholder `rgba(255,255,255,.62)`, muted `.72` cam/fotoğraf üzerinde | `#L191`, `#L17` | 4.5:1 render ile ölçülür — bugün ölçülemez |
| `color-scheme:dark` native picker temasını karartır | `#L193` | Tema tokenlarıyla uyum; §3 satır 6 çözülünce |
| 2 harici Unsplash hotlink | `#L44`, `#L48` | Yerel, optimize, lisanslı görsel; LCP hedefi `MPS#L34` |

### 4.12 Dil / i18n

`<html lang="en">`, i18n kancası 0 (`ARTEFAKT#L2`); site EN/TR/DE/RU/AR, yalnızca EN düzenleniyor, diğerleri WPML'e ayrılmış (`MPS#L19`). Form dizeleri çeviri mekanizması (WPML mi JS sözlük mü) ve Arapça RTL kayıtta tanımsız; 12 İskandinav + AR sayfa kararı Hermes'te (`CLAUDE#§7`). Spec [ÖNERİ]: dizeler tek sözlükten, `dir="rtl"` desteği, sayaç değeri sayısal.

### 4.13 Ödeme ifadesi ve çift gönderim

- **[ÖNERİ]** standart dize: "Pay cash in vehicle — final price confirmed on WhatsApp"; C6 (`FC1/BLOCKERS_AND_CONFLICTS.md#L124-128`) owner tek kelime teyidiyle kapanır.
- Çift gönderim: client buton kilidi + sunucu idempotency anahtarı — D-010 (`MD#L63-64`) ve `AGOS-IDEMPOTENCY-GATE-01` (`AMS#L210`) gerektirir; anahtar üretimi (nonce/hash) tanımsız (§7). Artefakt gönderim yapmadığından hiçbir koruma tasarlanmamıştır.

---

## 5. Kabul kriterleri — form UI'yi ilgilendiren satırlar

24 test, **0 çalıştı** (`RECON#L62-65`). Form UI'ye düşenler (`SFR/TASK_STATUS.md#L108-112`):

| Test | Beklenen | Ölçüm yöntemi |
|---|---|---|
| desktop / mobile | 1366 ve 390 px'de yatay taşma 0, taşan kontrol 0 (baseline `MONITOR#L62-65`) | render edilmiş DOM; string sayımı değil (`SFR/EXECUTION_PLAN.md#L61`) |
| one-way / return | D-009: dönüş yalnızca açık seçim + tarih/saat; kaldırınca değer temizlenir | DOM + payload |
| 1/2/3/4/6 pax (shuttle) | UI, sunucu quote'unu 30/50/60/70/90 olarak yansıtır; client hesabı yok | quote yanıtı vs DOM |
| empty / valid / invalid email | boş → geçer; geçersiz → alan hatası; geçerli → geçer | DOM |
| Places ok / fail | fail'de serbest metin kabul, booking engellenmez [ÖNERİ] | script blokla test |
| AYT↔GZP shuttle | her iki yön + dönüş bacağı: sunucu reddi, UI hata + private/VIP CTA | quote yanıtı |
| double-click + retry | tek booking, tek bildirim, tek voucher | payload sayımı |
| console errors | 0 | konsol |
| tam olarak bir form | para sayfası başına `distinct_forms == 1`, literal shortcode 0 | `agos/AG_BOOKING_OPTION_B_PREFLIGHT_01.md#L112-114` sayacı |

---

## 6. Uygulama adımları

| # | Adım | Kapı |
|---|---|---|
| 1 | Bu spec'in §4 alan seti, §3 çelişki tablosu ve §7 boşluklarını owner'a tek sayfalık karar listesi olarak sunmak (e-posta alanı var/opsiyonel; D-M-Y ve Places fallback teyidi; saat dilimi; shuttle rota kapsamı; palet; ödeme dizesi; çocuk sayımı; hedef WCAG seviyesi) | **[SERBEST]** |
| 2 | `ARTEFAKT`'ı "referans değil, provenance'sız mockup" olarak işaretlemek; `agos/manifests/RC-ALLOWLIST.md` dışında kalması korunur | **[SERBEST]** |
| 3 | Canlı `[ag_home_booking]` formunun gerçek DOM'unu okumak: alan listesi, e-posta/koltuk/hizmet sınıfı varlığı, "Live price total"in client mı sunucu mu hesapladığı, tam öznitelik dizesi (`MPS#L40`'taki `...`) | **[ERİŞİM YOK]** → **[JETPACK]** (reconnect sonrası salt-okunur sayfa okuma) |
| 4 | Pilot geometri ölçümünü (`MONITOR#L60-69`) 1366/390 px'de yeniden üretmek; kontrast ölçümü | **[ERİŞİM YOK]** (ağ izin listesi veya Jetpack) |
| 5 | `ag-home-booking-shortcode.php` öznitelik setini kaynaktan doğrulamak (`OD1#L203`); renderer sözleşmesi + `ag-homepage-live-pilot` şablon çağrısı | **[BASELINE]** |
| 6 | Fiyat hesabını sunucuya taşımak; quote endpoint; `price_snapshot` sunucuda; payload'daki fiyat yok sayılır | **[BASELINE]** + **[OWNER GO]** |
| 7 | AYT↔GZP server-side ret (iki yön + dönüş bacağı) ve UI hata/CTA | **[BASELINE]** + **[OWNER GO]** |
| 8 | E-posta alanı opsiyonel (UI/backend/API); voucher kapısını e-posta-bağımsız tanımlamak; CLE davranışı baseline'da okunduktan sonra | **[BASELINE]** + **[OWNER GO]** |
| 9 | Kapasite tablosu (shuttle koltuk, private/VIP sınıf) owner'dan; backend doğrulaması korunarak sayaç üst sınırı quote'tan | **[OWNER GO]** + **[BASELINE]** |
| 10 | Erişilebilirlik düzeltmeleri (§4.11) — canonical renderer üzerinde, artefakt üzerinde değil | **[BASELINE]** |
| 11 | Layout × batch eşlemesi (§4.10) ile kapsam doldurma; batch sırası 1→2→3→4→5 | **[OWNER GO]** (ayrı GO, `CLAUDE#§2`) + **[JETPACK]** veya **[BASELINE]** |
| 12 | 24 testlik matrisi çalıştırıp sonuçları olduğu gibi raporlamak | **[BASELINE]** + erişim |

Hiçbir adım deploy, canlı düzenleme, gerçek müşteri/sürücü mesajı veya kimlik bilgisi kullanımı içermez (`CLAUDE#§5`).

---

## 7. Kayıt bunu söylemiyor

1. Hedef form e-posta alanını **topluyor mu** — canlı akışta anılmıyor, dev payload'ında koşullu; §4 "opsiyonel" der ama varlığı varsayar. Owner: alan var + opsiyonel mi, yalnızca WhatsApp mı?
2. "D-M-Y tarih" ve "Places fallback → manuel adres": §4'te yok, birincil kayıtta 0 eşleşme; görüntü mü tel formatı mı, hangi yüzeylerde (form/özet/WhatsApp/e-posta) — tanımsız. Owner görev metninin kendisi hiçbir depoda yok.
3. Pickup tarih/saatinin saat dilimi (Europe/Istanbul sabit mi, ziyaretçi yereli mi).
4. Hizmet sınıfı seçici semantiği ve shuttle rota kapsamı (Alanya↔Antalya only vs genişletilmiş); Okurcalar/Avsallar/Türkler'in hangi kümede sayılacağı.
5. Araç kapasite tablosu — hiçbir depoda değer yok; yalnızca yatırımcı planında "Sprinter 11+1".
6. Çocuk/bebek sayımı: shuttle tablosu "kişi" başına; çocuk koltuk/fiyat sayılır mı, `child_seat_count` formda olur mu.
7. Dönüş fiyatlaması: "×2" shuttle için de geçerli mi; dönüş bacağının AYT↔GZP kontrolü nasıl gösterilir.
8. Hangi sayfa tipi hangi layout'u alır (hero/compact/inline) — artefakt yalnızca hero.
9. Tur sekmesi: aktivite listesinin kaynağı (`ag_tour` CPT mi sabit liste mi), tur fiyatı, saat alanı, WhatsApp akışı — kilitli karar yok.
10. Çeviri mekanizması (WPML / JS sözlük), Arapça RTL; 12 İskandinav + AR kararı Hermes'te.
11. Geçerli tasarım sistemi — artefakt paleti mi `MPS#L31` mi.
12. Artefaktın owner onayı — provenance 0, atıf 0.
13. Google Places ürünü (`PlaceAutocompleteElement`?), tarayıcı anahtarı kısıtı, `pickup_place_id` boşken fiyatlama; Distance Matrix server key OWNER BLOCKER.
14. Public form için hedef WCAG seviyesi.
15. Uçuş numarası: havalimanı karşılamada zorunlu mu opsiyonel mi.
16. Idempotency anahtarının üretimi (nonce/hash).
17. Cam/gradient üzerindeki kontrast oranları — render edilmeden ölçülemez.
18. Canlı formda `ag_home_booking`'in "geçici alias" olarak sonlandırılması — hiçbir kayıt onaylamıyor (§3 satır 3).

---

## 8. Düzeltilen / elenen iddialar

İki-lens doğrulamada **0 iddia reddedildi**; 3 iddia olduğu gibi tutuldu (UX-01 artefakt işlevsiz, UX-09 dönüş, UX-10 D-M-Y/Places §4'te yok), 9 iddia **düzeltilerek** kullanıldı. Düzeltmeler — okuyucu neyin çıkarıldığını görsün:

| İddia | Orijinal ifade | Düzeltme |
|---|---|---|
| UX-02 | "artefaktta fiyat kancası yok → düzeltme için UI kancası yok" | Canlı canonical formda kayda göre client-side "Live price total" **var** (`MPS#L41`); artefakt canonical form değildir |
| UX-03 | "sayım JS'i üç belirteci sayar" | Preflight JS yalnızca 2/3'ünü sayar; `[data-ag-home-booking-root]` yalnızca envanter tanımında; "tam olarak bir form" testi preflight'ta değil `OD1#L150,208`'de |
| UX-04 | "dosya `f420b0e` merge'iyle girdi" | `f420b0e` ebeveynsiz kök anlık görüntü; köken git'ten kurulamaz. Beş depodan yalnızca üçü diskte; diğer ikisi GitHub kod aramasıyla kontrol edildi (indeks-bağımlı) |
| UX-05 | "`_agp_customer_email_*` → dev build e-posta topluyor"; "boşken CLE atlanır" | İlki Delivery Runtime yüzeyidir, form alanı kanıtı değil; ikincisi kayıtta yok → [ÖNERİ]. Ek: `AGSYNC_OPS_01_OPERATIONS_CENTER_ARCHITECTURE.md#L204` e-postayı voucher için zorunlu kılar (§3 satır 4) |
| UX-06 | "canlı akışta koltuk adımı yok" | Kayıt-türevi: "tarif edilmiyor, erişimsiz doğrulanamaz" (`SFR/TASK_STATUS.md#L59-60`); "Sprinter 11+1" yatırımcı rakamı |
| UX-07 | "üç kaynakta üç farklı shuttle fiyatı" | Dördüncü kayıt `MPS#L85` (dinamik €30–€80, AYT + GZP) eklendi |
| UX-08 | "öznitelik seti = `context`, `default_service`, `layout`" | "En az bu üçü"; `MPS#L40` `...` ile kısaltılmış; `ag_home_booking` kalıcı-engine kayıtları ve açık AGOS kapısı eklendi |
| UX-11 | Places fallback kuralları `DM#L126`'ya dayandırılmıştı | `DM#L126` yalnızca "if supplied" der; üç kural [ÖNERİ] olarak yeniden etiketlendi |
| UX-12 | "transfer sekmesi 5 alan + return + CTA"; "compact/inline varyantı yok" | 4 alan + return + CTA (6 sütun, `ARTEFAKT#L144`); 5 alan + CTA tur sekmesidir; "yok" yalnızca artefakt için — runtime üç layout destekler (`APPLY#L29`) |

Artefakt-içi erişilebilirlik ve stil sayımları (§1.3, §4.11) tek-lens okuyucu bulgusuydu; bu oturumda dosya üzerinde doğrudan yeniden sayıldı ve öyle kullanıldı. Canlı siteye ait hiçbir sayım yapılmadı.

---

*Gizlilik: bu bölüm yalnızca toplu sayılar ve sayfa-tipi yapısı içerir. URL bazlı form-suz para sayfası listesi, host yolu, DB tanımlayıcısı, kimlik bilgisi, müşteri/sürücü verisi, telefon veya e-posta adresi yer almaz; pilot sayfa URL'leri dahi anılmamıştır. URL bazlı detay için özel fixture: `MATRIX`.*

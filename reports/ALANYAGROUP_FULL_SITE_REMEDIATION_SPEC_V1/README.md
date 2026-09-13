# ALANYAGROUP Tam Site Düzeltme Spesifikasyonu V1 — İndeks ve Yönetici Özeti

**Tarih:** 2026-09-13 · **Mod:** tasarım aşaması, `owner_go = false` · **Depo:** `ALGRP/AG` (public) · **Codex'e rapor:** bu klasör

**Ne bu:** alanyagroup.com için sayfa/içerik, rezervasyon formu (UX/UI), rezervasyon operasyonu, SEO/hız/teknik ve kapı-sıralama-geri alma başlıklarında, **kayıttan türetilmiş ve doğrulanmış** tam site düzeltme spesifikasyonu. Uygulama değil, uygulamanın önündeki **tasarım aşamasıdır**. Owner'ın "baştan sona düzenle, yayına al, hızı ve rezervasyon durumunu kontrol et, her işi Codex'e bildir" talebinin canlı siteye erişim gerektiren altı maddesi bugün **hiçbir kanaldan yapılamaz**: dört erişim kanalı (Jetpack bağlayıcısı, Semrush API birimi, doğrudan HTTPS, Hermes kaynak teslimatı) bu oturumda doğrudan denendi ve dördü de kapalı — bkz. [`ACCESS_STATUS.md`](ACCESS_STATUS.md) (bu oturumun kendi ölçümü). Bu yüzden yapılabilen tek iş yapıldı: kayıttaki tüm tasarım/karar/denetim belgeleri beş bağımsız okuyucuyla tarandı, iddialar kaynağa karşı iki kez doğrulandı ve sayfa-tipi bazlı spesifikasyon yazıldı. Bu klasördeki her "canlı site" ifadesi **kayıt-türevidir** (2026-06-24 anlık görüntüsü + AGOS/platform belgeleri); hiçbir production dokunuşu, ölçüm, gönderim veya kimlik bilgisi kullanımı olmadı. Owner'ın kilitli kararları (`AG/CLAUDE.md#L65-90`, §4) her eski kayda üstündür; kayıt aksini söylüyorsa §5'te açık bırakıldı, sessizce çözülmedi.

---

## 1. Owner'ın 7 talebi — durum tablosu

| # | Talep | Bugün mümkün mü | Neden | Bu spec'te nerede | Açan kapı |
|---|---|---|---|---|---|
| 1 | Tüm sayfaları ve tüm içeriği düzenle | **Hayır** | Sayfa okuma/yazma kanalı yok (`ACCESS_STATUS.md#L9,L11`); 906 satırın hiçbiri PT01–PT12 ile sınıflandırılmamış, Gate 3/4 HOLD (`agos/AGOS_DECISION_GATES.md#L48-67`) | [`01_PAGES_AND_CONTENT.md`](01_PAGES_AND_CONTENT.md) §3, §7, adımlar 0a–8 | Jetpack reconnect (yetenek) + ortam-adlı OWNER GO (yetki) |
| 2 | Rezervasyon formunu düzenle | **Hayır** | Form kaynağı (`ag_hlp_*`, `ag-home-booking-shortcode.php`) beş depoda yok (`AG/CLAUDE.md#L50-58`); depodaki tek form artefaktı işlevsiz görsel kabuk | [`02_BOOKING_FORM_UX_UI.md`](02_BOOKING_FORM_UX_UI.md) §1, §4, §6 | Hermes baseline `BASELINE_COMPLETE=YES` (`AG/CLAUDE.md#L135`) + OWNER GO |
| 3 | UX ve UI düzenle | **Hayır** | Ölçülmüş tek UI baseline'ı 2026-06-24 pilotu; canlı DOM okunamıyor; tasarım sistemi ve 8 UI kararı owner'da | [`02`](02_BOOKING_FORM_UX_UI.md) §1.2, §3, §4.10–4.13 | Jetpack veya ağ izin listesi + oturum açık tarayıcı; owner karar listesi (02 adım 1) |
| 4 | Yayına al | **Hayır — yasak** | `AG/CLAUDE.md#L96` "Production'a deploy — yok"; "deploy / make it live" kayıtta **geçersiz GO** (`agos/AGOS_GOV_01_OWNER_GO_TEMPLATE.md#L71-83`); `OWNER_GO_LOG.md#L3` boş; erişim de yok (`ACCESS_STATUS.md#L28`) | [`05_GATES_SEQUENCING_ROLLBACK.md`](05_GATES_SEQUENCING_ROLLBACK.md) §2, §4.2, adımlar 10–13 | Ortam-adlı, URL/ID listeli, backup+rollback+stop-condition içeren açık OWNER GO → Gate 8→9→10 |
| 5 | Site hızını kontrol et | **Hayır** | Kayıtta **sıfır** hız ölçümü; Semrush birimi 0, HTTPS 403 (`ACCESS_STATUS.md#L10-11`) | [`04_SEO_SPEED_TECHNICAL.md`](04_SEO_SPEED_TECHNICAL.md) §1 (ölçüm protokolü §1.3), adımlar 2–6 | Semrush API birimi (crawl) + ağ izin listesi (PSI/CrUX); owner eşik onayı |
| 6 | Rezervasyon durumunu kontrol et | **Hayır** | Sorgulanabilir yüzey yok: Master Sheet oluşturulmamış, CLE modülü 0 eşleşme, webhook alıcısı tanımsız | [`03_RESERVATION_OPERATIONS.md`](03_RESERVATION_OPERATIONS.md) §1 (dört anlam), §3, §7 | Anlam A: Jetpack · B/C/D: Hermes baseline → ayrı OWNER GO'lar |
| 7 | Yapılan her işi Codex'e bildir | **Evet — bu paket, commit `e227147` ile PR #1'e push edildi (2026-09-13)** | Kayıt okundu, iki-lens doğrulandı, spec üretildi (`ACCESS_STATUS.md#L24`). 2026-09-13 öncesi 03/04/05, README, Codex paketi ve `tools/` yalnızca untracked çalışma kopyasıydı (Codex paketi §5 madde 5); "Evet" ancak push ile doğru oldu | Bu README + 5 bölüm + `ACCESS_STATUS.md` + `tools/reproduce_counts.py` + `handoff/CODEX_TASK_PACKET_01.md` | — (§6 okuma sırası) |

---

## 2. Tek sayfalık özet — doğrulanmış 12 bulgu

| # | Bulgu | Bölüm | Kaynak |
|---|---|---|---|
| 1 | Envanter **906** satır (273 `page` + 633 `post`, 905 farklı URL yolu; 906/906 HTTP 200); anlık görüntü **2026-06-24**, sonrasında yeniden tarama yok | 01 §1 | `agos/AG_BOOKING_COVERAGE_SUMMARY.md#L4,L40`; inventory CSV `url` sütunu |
| 2 | Çift form **0**, ham shortcode **0** → tekilleştirme kriteri zaten geçiyor; gerçek iş **kapsam doldurma**: 699 formsuz URL, 587 para sayfasının **384'ü (%65)** formsuz | 01 §1, §4.4 | `agos/AG_BOOKING_COVERAGE_SUMMARY.md#L42-49`; `AG/reports/ALANYAGROUP_SITE_FINAL_REMEDIATION_V1/BOOKING_ENGINE_MATRIX.md#L52-59` |
| 3 | Engine: `none` 699 · `agsc-v6` 192 (tek şablon, iki küme) · `ag_home` 13 · `c6` 2; 466 `MUST_HAVE_BOOKING`, SEL-124 batch'leri 94/321/51/16/108 | 01 §3.2; 04 §2.1; 05 §4.4 | `agos/AG_BOOKING_COVERAGE_SUMMARY.md#L43-46`; `agos/AG_BOOKING_PRIORITY_MATRIX.csv` (`priority_group`, `proposed_batch`) |
| 4 | 906 satırın **hiçbiri** PT01–PT12 / Gate 3 eylem sınıfı taşımıyor; AGSEO-02 matrisi 16 desen satırı, 9'u envanterde yok; anılan LOCAL-CONTENT-05 dosyası hiçbir depoda yok | 01 §3 | `agos/AGSEO_02_URL_DEPENDENCY_MATRIX.csv#L2-17`; `agos/AGOS_DECISION_GATES.md#L32,L48-56` |
| 5 | AYT ↔ GZP kümeleri birebir ayna (96/96 alt yol, 66/66 otel slug'ı); `/gazipasa-transfer/` hem `page` hem `post` (envanterdeki tek çift URL) | 01 §4.1–4.2 | `agos/AG_BOOKING_COVERAGE_INVENTORY.csv` (`url`, `page_type`; `tools/reproduce_counts.py`); `agos/AGOS_RISK_REGISTER_V2.md#L14` |
| 6 | Booking runtime kaynağı **beş depoda yok**; dört durdurma koşulu tetiklenmiş; **24 testin 0'ı çalıştı**; preflight'ın zorunlu dosya kümesi üç AGOS kaydında farklı | 05 §4.1, §7 | `AG/reports/ALANYAGROUP_RECONCILED_BOOKING_CANDIDATE_V1/TASK_STATUS.md#L62-65`; `…/ABSENT_FILES_MANIFEST.md#L56-63` |
| 7 | Depodaki tek form artefaktı görsel kabuk: 0 `<form>`, 0 gönderim, 0 fiyat, 0 hizmet sınıfı, provenance 0 — owner-onaylı sayılamaz | 02 §1.3–1.4 | `agos/agbooking_hero_transfer_tour_final.html` (tüm dosya sayımı; `#L422`, `#L481`) |
| 8 | Ölçülmüş tek UI baseline'ı: pilot `layout="compact"`, 5 alan + 1 buton, 1366/390 px taşma 0, konsol hatası 0 | 02 §1.2 | `agos/AG_BOOKING_OPTION_B_PILOT_MONITOR_01_REPORT.md#L62-69` |
| 9 | "Rezervasyon durumu" için canlı sorgu yüzeyi **yok**: 10 durumlu lifecycle + 45 sütunlu Sheet yalnızca belge (`PASS_ARCHITECTURE_READY_NO_MUTATION`); CLE e-posta modülü 0 eşleşme; "Confirm on WhatsApp" webhook alıcısı tanımsız; çalışan tek parça yerel fixture Inbox (Production NOT READY) | 03 §1–3, §5 | `agos/AGSYNC_OPS_01_OPERATIONS_CENTER_ARCHITECTURE.md#L292`; `agos/AGSYNC_OPS_01_PASS_HOLD_REPORT.md#L40-51`; `agos/SEL-156_MILESTONE_01_CLOSURE_REPORT.md#L109` |
| 10 | Kayıtta **iki** owner-GO'lu canlı booking mutasyonu var (2026-06-21: 1 sayfa; 2026-06-24 SEL-121: 2 sayfa, önce-DOM 0 → sonra 1, PASS) ama `OWNER_GO_LOG.md` **0 kayıt**; rollback yedekleri kasıtlı `.gitignore`, Temmuz 2026'da yerel Mac'te kayıtlı, **bugün doğrulanamaz** | 03 §6; 05 §2.2, §5 | `alanyagroup-platform/AI_COMMAND_CENTER/OWNER_GO_LOG.md#L3`; `agos/AG_BOOKING_OPTION_B_APPLY_01_REPORT.md#L3-5,L36-42`; `agos/.gitignore#L87-88` |
| 11 | Hız: üç depoda **sıfır** ölçüm (8 dosya eşleşmesi → 7'si "Golden Lighthouse" otel adı, 1'i Tours tasarım hedefi `LCP < 2.5s`); plugin envanteri, sürümler, Cloudflare performans ayarı, canlı hreflang/robots/sitemap — hiçbiri kayıtta yok | 04 §1–4, §7 | `alanyagroup-platform/AI_COMMAND_CENTER/MASTER_PROJECT_STATUS.md#L30,L34`; `tools/reproduce_counts.py` |
| 12 | Dil: envanterde dil sütunu yok; 64 yüzde-kodlu slug (47 Kiril + 17 Arap harfli) + 12 İskandinav **hepsi formsuz**; SEL-124 Batch 1'in **58/94**'ü `NON_EN` → dil kararı (Hermes Görev 4) Batch 1'in ön koşulu | 01 §5; 04 §6.3; 05 §4.4 | `agos/AG_BOOKING_PRIORITY_MATRIX.csv` (`language_scope_note` × `proposed_batch`); `…/BOOKING_ENGINE_MATRIX.md#L120-135` |

---

## 3. Kapı merdiveni (05'ten sıkıştırılmış)

Etiketler: **[SERBEST]** bugün, yalnızca dokümantasyon · **[OWNER GO]** açık owner kararı/GO · **[ERİŞİM YOK]** owner'ın açacağı kanal · **[JETPACK]** reconnect sonrası · **[BASELINE]** Hermes kaynağı gerekir. Her canlı adımın sonunda `owner_go` false'a döner.

| Basamak | İş | Kapı | Geri alma |
|---|---|---|---|
| 0 | Bu spec'i public'e commit; 906 satırlık PT + Gate 3 matrisi ve Gate 4 çift listesi → **private** depo; submit-stage idempotency tasarımı; voucher gate'ini e-posta-bağımsız yazma; `OWNER_GO_LOG.md` bağlayıcı biçimi + iki geriye dönük GO kaydı önerisi; hız ölçüm protokolü; public preflight betiğinden host yolu temizliği (**yapıldı 2026-09-13**, §7) | [SERBEST] | R-05 git revert |
| K1 | Owner kararları: kapsam otoritesi (şablon injection / sayfa başı shortcode), GO birimi (sayfa / batch), sıralama (alias önce / canonical sonra), Jetpack risk maddelerini aşma, "yayına al" kapsamı, dil mimarisi, hız eşikleri, PT06 önceliği, durum modeli (10'lu / 6'lı), 02 adım 1'deki 8 UI kararı | [OWNER GO] | — |
| K2 | Erişim kilitleri: Jetpack reconnect (K1 kararı sonrası) · Semrush API birimi · ağ izin listesi | [ERİŞİM YOK] → owner | kayıtta yazılı değil |
| K3 | Hermes Görev 1A (`preflight_baseline_check.sh`, exit ≠ 0 → DUR) · 1B (3 mu-plugin + pilot klasörü + CLE + SEL-121 yedekleri → private depo, secret taraması) · 2 TÜRSAB · 3 fiyat tabanı · 4 dil kapsamı | [BASELINE] | R-05 |
| 1 | Salt-okunur envanter yenilemesi: 906 URL HTTP + form sayımı; kontrol/pilot sayfalarda **render edilmiş** DOM; hız baseline'ı (8 sayfa tipi × 3 tekrar × 2 cihaz); plugin/sürüm/robots/sitemap/hreflang envanteri | [JETPACK] / ağ izin listesi + oturum açık tarayıcı | — |
| 2 | Booking-core kod uygulaması (§4 kararları) → staging + lint (Gate 2) → 24 test + rollback provası (Gate 8) → Gate 9 paketi (backup, rollback, bakım penceresi, GO metni) → production apply (Gate 10) | [BASELINE] + [OWNER GO] | R-02 / R-Prod |
| 3 | Kapsam doldurma SEL-124 Batch 1 (94; 58 NON_EN Görev 4'e bağlı) → 2 (321) → 3 (51); her batch 6-şartlı kapı (önce-DOM 0 → sonra-DOM tam 1, literal 0, yalnızca REST `content`); **192 `agsc-v6` sayfasına dokunulmaz** | ayrı [OWNER GO] + [JETPACK] veya eşdeğer yazma kanalı | R-01 (injection seçilirse R-02) |
| 4 | `c6` migrasyonu — 2 sayfa, GO başına bir sayfa, canonical dize kaynaktan | [OWNER GO] + [BASELINE] | R-01 |
| 5 | `agsc-v6` şablon standardizasyonu — **en son, tek başına**, enjekte eden dosya kimliği bulunduktan sonra | [OWNER GO] + [BASELINE] | R-02 |
| 6 | Canlı gönderim kanalları (e-posta → WhatsApp → Sheets → n8n) kanal başına ayrı GO; WhatsApp Job Distribution bağımsız denetim PASS olmadan **hiçbir basamakta** | [OWNER GO] × kanal | kanal devre dışı |
| 7 | Batch 4 (16) / Batch 5 (108); SEO canonical/redirect/sitemap/hreflang uygulaması D01–D09 + dil kararı sonrası | [OWNER GO] | R-01 |

**B-09 varsayımı (görünür):** bu merdiven **canonical-sonra** dalını varsayar (basamak 2 booking-core → basamak 3 kapsam doldurma); bu bir owner kararı değildir (§4 "sıralama", 05 §4.4, Codex F6/B4). Owner `B09_ORDER=alias-önce` derse basamak 3 (Batch 1–3, SEL-121'de kanıtlı alias dizesiyle, [JETPACK] + ayrı [OWNER GO]) basamak 2'nin önüne alınır ve Hermes baseline'ını beklemez. Batch boyutları alias düşülmemiş ham sayılardır (13 alias: Batch 1'de 9, Batch 3'te 4 — 05 §4.4 "Alias düzeltmesi").

Kaynak: `05` §4–§5 ve "Uygulama adımları" 1–18; `agos/AGOS_DECISION_GATES.md#L34-152`; `agos/AG_BOOKING_COVERAGE_BATCH_PLAN.md#L194-203`; `agos/AG_BOOKING_OPTION_B_ROLLBACK_PLAN.md#L39-71`.

---

## 4. Çelişkiler — owner kararı vs kayıt (hepsi açık)

`AG/CLAUDE.md §4` geçerlidir; hiçbiri burada karara bağlanmadı. Satır atıfları `AG/CLAUDE.md` içindir.

| # | Konu | Owner kararı | Kayıt | Bölüm |
|---|---|---|---|---|
| Ç1 | Canonical shortcode | `[ag_booking_engine]` + 3 alias, tek renderer (`#L69-71`) | `[ag_home_booking]` **canonical/kalıcı**; diğer iki alias "kullanma / uydurma" (`agos/AG_BOOKING_OWNER_DECISION_01.md#L51-54,L154-161`; `MASTER_PROJECT_STATUS.md#L39,L47`); `[ag_booking_engine]` canlıda kayıtlı değil → eklenirse ham metin basar; `ag_hlp_render_booking_engine` adı CLAUDE.md dışında 0 geçiş | 01 §7; 02 §3 r2–3; 03 Ç3; 05 §3 |
| Ç2 | Shuttle 3/4 kişi | 60 / 70 (`#L72`) | 70 / 80 (`MASTER_PROJECT_STATUS.md#L23`); yalnızca 30/50 (`agos/decision-ledger/MASTER-DECISIONS.md#L57-58`); "€30–€80 dinamik" (`MPS#L85`) — dört kayıt dört farklı | 02 §3 r1; 04 §9; 05 §3 |
| Ç3 | TÜRSAB numarası | 2165 (`#L88`, §4 çelişki tablosu; `#L82` yalnızca "belge bilgisi korunmalıdır") | 12892 (`MASTER_PROJECT_STATUS.md#L18`); AGOS'ta 0 geçiş | 01 §7; 04 §9 — Hermes Görev 2; **ikisi de yayımlanmaz** |
| Ç4 | Alanya dışı fiyat tabanı | `max(50, 50 + …)` | Yayımlanan "from" fiyatları daha düşük (`MPS#L23`); taban ölü kod | 01 §7; 04 §9 — Hermes Görev 3 |
| Ç5 | E-posta opsiyonel | Alan opsiyonel, UI/backend/API tutarlı (`#L76`) | Voucher gate'i e-postayı **önkoşul** sayar (`agos/AGSYNC_OPS_01_OPERATIONS_CENTER_ARCHITECTURE.md#L204`); aynı paketin şeması `conditional` (`…MASTER_SHEET_SCHEMA.csv#L14`); canlı akış e-posta adımını hiç tarif etmez | 02 §3 r4; 03 Ç1 |
| Ç6 | CLE received/confirmed regresyonsuz + çift voucher yok | Production'da e-posta adımı **var** sayar (`#L80`) | Modül 5 depoda 0 eşleşme; AGOS e-postayı dry-run/HOLD kaydeder; submit-stage idempotency hiç tasarlanmamış | 03 Ç2, Ç4 — test yazılır, çalıştırılamaz |
| Ç7 | AYT↔GZP shuttle server-side ret | Her iki yönde yasak, server-side (`#L73-74`) | Hangi kod yolunda yaşadığı bilinmiyor; canlı akış hizmet sınıfı / havalimanı seçici tarif etmiyor; shuttle kapsamı kayıtta "Alanya↔Antalya only" | 02 §2, §4.4; 03 Ç7 |
| Ç8 | Dil mimarisi | §7: EN→TR→DE→RU kademesi; İskandinav + AR kararı Hermes'te | SEL-191: alt alan adları `de./ru./pl.` + `tr./ar.` "if needed", **WPML rollout yok** (`agos/AGOS_MASTER_ROADMAP_2026_V2.md#L296-311`) ↔ platform/CMS: WPML **bugünkü** katman (`MPS#L19`; `agos/AG_ADMIN_CMS_01_ARCHITECTURE.md#L24,L32`); Lehçe için owner beyanı yok | 01 §5.2; 04 §6 |
| Ç9 | Jetpack reconnect | `ACCESS_STATUS.md#L16` öncelik 1 | "Do not connect AI directly to live WordPress…" + "Do not use Jetpack just for Claude…" (`alanyagroup-platform/AI_COMMAND_CENTER/RISK_REGISTER.md#L3,L5`); "not needed now" (`CURRENT_STATUS.md#L10`); "tek tık" doğrulanmamış. `ACCESS_STATUS.md#L16`'ya 2026-09-13'te "yetenek ≠ yetki" notu eklendi; ölçüm satırları değişmedi | 04 §9; 05 §1.1 |
| Ç10 | "Yayına al" | Owner talebi (`ACCESS_STATUS.md#L4`) | `#L96` deploy yok; "deploy / make it live" geçersiz GO ifadesi (`agos/AGOS_GOV_01_OWNER_GO_TEMPLATE.md#L71-83`); kapsamı tanımsız | 05 §2 |
| Ç11 | Ödeme ifadesi | "araçta nakit" (`#L75`) | "cash or card" koru/temizle çelişkisi (`AG/reports/ALANYAGROUP_FINAL_COMPLETION_V1/BLOCKERS_AND_CONFLICTS.md#L124-128`); artefakt "where applicable" | 02 §3 r9 |
| Ç12 | D-M-Y tarih, Places fallback | Owner görev metninde geçer, §4'te **yok** | Birincil kayıtta 0 eşleşme; görev metni hiçbir depoda yok | 02 §3 r8 — owner teyidi |
| Ç13 | Shuttle rota kapsamı; tasarım sistemi; mobil yerleşim; canlı layout varyantı | §4 sessiz | "Alanya↔Antalya only" (`MPS#L23`); 2026-06-22 paleti (`MPS#L31`) ↔ artefakt paleti; sticky bar + FAB (`MPS#L34`); canlıda `hero` ve `compact` iki varyant | 02 §3 r5–7; 05 §3 |

**Kayıt-içi çelişkiler (owner kararı yok, karar gerekir):** kapsam otoritesi injection/shortcode (05 §3); GO birimi sayfa/batch ve alias-önce/canonical-sonra sıralaması (05 §4.4); `OWNER_GO_LOG.md` 0 kayıt ↔ 2 kullanılmış GO ve 5+ rakip GO şablonu (05 §2); "her şeyi açan madde" Jetpack mi Hermes mi (05 §1.1); Cloudflare "engeller" ↔ SEL-123 906/906 public GET (05 §1.2); PT06 P1/P2 ve PT05 P0/P1 (01 §2.1); SEL-123 vs SEL-124 "Batch" etiketleri (01 §3.2); rezervasyon durum modeli 10'lu/6'lı (03 §2.2); staging var/yok — 04 §1.4 ve Codex §1-C(vi) kayıt-içi önceliği AGOS'a verir ("üstün sayılır"), 05 §4.2 ve bu README **açık** tutar; "kayıtlı" sorusu AGOS lehine kapanabilir, "ayakta" sorusu yalnızca ölçümle kapanır (05 §4.2); hız Δ'sının batch geri alma tetikleyicisi olup olmadığı — Codex D6 öneri, 05 §4.4 kapısında yok, eşikler owner-onaysız (05 §3 son satır); B-09 sıralaması merdivenlerde canonical-sonra olarak **varsayılmıştır**, karar değildir (§3 notu); Rank Math cleanup 164/182 ve 273/339 page (04 §11); preflight dosya kümesi üç kayıtta farklı (05 §4.1).

---

## 5. Doğrulama — nasıl kontrol edildi, ne kontrol edilemedi

**Yöntem.** Beş bağımsız okuyucu (lens başına bir) `agos`, `alanyagroup-platform` ve `AG` depolarını kaynak satırı düzeyinde taradı; her bulgu ikinci bir lens tarafından kaynağa karşı yeniden açıldı (**iki-lens doğrulama**) ve `held` / `corrected` / `refuted` etiketi aldı. Yalnızca tek lens gören (`reader-only`) veya iki-lensten geçmeyen (`unverified`) bulgular, bu oturumda kaynak satırı doğrudan yeniden okunduktan sonra ve yük taşımayan bağlam olarak kullanıldı; her bölümün son başlığı ("Düzeltilen / elenen iddialar") hangi iddianın nasıl düzeltildiğini gösterir. CSV sayıları (906/905/699/466/94/321/51/16/108/178/58; 96/96 ayna; 64 kodlu slug; 12 İskandinav) `python3` ile yeniden üretildi — betik: [`tools/reproduce_counts.py`](tools/reproduce_counts.py) (private fixture'lara karşı çalışır, URL basmaz).

| Bölüm | held | corrected | refuted | unverified | reader-only |
|---|---:|---:|---:|---:|---:|
| 01 Sayfalar ve İçerik | 3 | 11 | 0 | 12 | 7 |
| 02 Rezervasyon Formu UX/UI | 5 | 7 | 0 | — | 23 |
| 03 Rezervasyon Operasyonu | 6 | 8 | 0 | 7 | 9 |
| 04 SEO, Hız, Teknik | 8 | 6 | 0 | — | 22 |
| 05 Kapılar, Sıralama, Geri Alma | 4 | 10 | 0 | 22 | 17 |
| **Toplam** | **26** | **42** | **0** | 41 | 78 |

Notlar: (i) Bölüm 02'nin kendi dipnotu 3 held / 9 corrected yazar; pipeline sayımı 5 / 7'dir — aynı 12 bulgunun etiketleme farkı, içerik aynı. (ii) Hiçbir bölümde `refuted` yok; düzeltmelerin tamamı sayısal hassasiyet (906 satır / 905 URL; üç değil dört shuttle kaydı; iki değil üç OWNER GO noktası) veya eksik kaynak atfıdır. (iii) **Bölümler arası bilinçli fark:** 01 §5.1 (DE 18 / TR 31) ve 04 §6.3 (DE 21 / TR 14) farklı slug sezgiselleri kullanır; 04'ün sayıları önceki paketten taşınmıştır, 01'inki bu oturumda üretilmiştir. Yalnızca CSV'den birebir çıkan sayılar (64 kodlu, 12 İskandinav, 178 `NON_EN`) iki bölümde ortaktır; kesin dil dağılımı WP REST/WPML alanı ister.

**Doğrulanamayanlar (canlıya ait her şey):** render edilmiş DOM ve form sayısı (2026-06-24 sonrası), hız/CWV, Rank Math meta, hreflang/robots/sitemap, plugin ve sürüm envanteri, Cloudflare yapılandırması, gerçek rezervasyon kaydı/durumu, CLE e-postasının canlıda ne yaptığı, "Confirm on WhatsApp" webhook alıcısı, SEL-121 yedek klasörünün bugün var olup olmadığı, `app.alanyagroup.com` staging'inin ayakta olup olmadığı, Jetpack eklentisinin canlıda kurulu/aktif olup olmadığı. Bunlar `ACCESS_STATUS.md#L23` uyarınca **yapılmadı**; her bölümün "Kayıt bunu söylemiyor" başlığı tam listeyi taşır.

---

## 6. Okuma sırası

**İnsan (owner / proje yöneticisi), ~30 dk:** `ACCESS_STATUS.md` → bu README §1 (ne yapılamıyor, neden) → §4 (hangi kararlar sizde: K1 listesi + Ç1–Ç13) → §3 (merdiven) → `05` §2–§3 (GO mekanizması; "yayına al" neden GO değil) → `03` §1 (rezervasyon durumu neden cevaplanamıyor) → `04` §1.3 (hız nasıl ölçülecek, hangi eşikler onayınızı bekliyor) → `01` ve `02` yalnızca "Uygulama adımları" ve "Kayıt bunu söylemiyor".

**Codex (uygulayıcı ajan):** `AG/CLAUDE.md` §4–§6 (kilitli kararlar, yasaklar, gizlilik) → `ACCESS_STATUS.md` → `05` tamamı (kapı etiketleri, R-01/R-02/R-05/R-Prod sınıfları, 18 adım) → bugün **[SERBEST]** olan işler: `01` adım 0a–0b (906 satırlık PT + Gate 3 matrisi, Gate 4 çift listesi → **private** depo), `03` adım 2–3–5 (GO log geriye dönük kayıt önerisi, submit-stage idempotency tasarımı, voucher gate düzeltmesi), `02` adım 1–2 (owner karar listesi, artefakt etiketi), `04` adım 1, 3, 9 (çelişki sunumu, sayfa-tipi örneklemi → private, görsel optimizasyon standardı), `05` adım 1–2 (commit, kayıt hizalama + host yolu temizliği) → sonra `AG/handoff/HERMES_TASK_PACKET_01.md`. Codex'in bugün canlı siteye, deploy'a, gönderime veya kimlik bilgisine dokunma yetkisi **yoktur**; `owner_go = false`; dokümantasyon güncellemesi yetki anlamına gelmez (`AG/CLAUDE.md#L110`).

---

## 7. Gizlilik notu — public depo

Bu klasör `ALGRP/AG` (public) altındadır ve `AG/CLAUDE.md#L112-121` (§6) kuralına uyar: yalnızca **toplu sayılar ve sayfa-tipi yapısı** taşır. Kasıtlı olarak **verilmeyenler** ve nerede oldukları:

| Verilmeyen | Nerede (private) |
|---|---|
| Formsuz para sayfalarının URL bazlı listesi (fiilen hedef listesi) ve 906 satırlık envanter | `agos/AG_BOOKING_PRIORITY_MATRIX.csv` (`url`, `priority_group`, `proposed_batch`, `language_scope_note`); `agos/AG_BOOKING_COVERAGE_INVENTORY.csv` |
| Canlıda mutasyona uğramış 3 sayfanın WordPress post ID'leri ve pilot URL'leri | `agos/AG_BOOKING_OPTION_B_APPLY_01_REPORT.md#L13-14`; `alanyagroup-platform/AI_COMMAND_CENTER/MASTER_PROJECT_STATUS.md#L48` |
| Hız örnekleminin tekil URL'leri (8 sayfa tipi) | 04 adım 3 ile private depoya yazılacak; burada yalnızca sayfa tipi |
| Host yolları, DB tanımlayıcıları/tablo öneki, DB dökümü adı, n8n kimlik/workflow ID'leri, WordPress.com site tanımlayıcısı, telefon ve e-posta adresleri, müşteri/sürücü verisi | Kaynak satırlarında geçse bile bu pakete taşınmadı; bölümler yalnızca dosya + satır atfı verir |
| Kaynak kod | Hiçbir depoda yok; Hermes Görev 1B ile yalnızca private depoya gelecek |

Örnek olarak yalnızca herkesçe bilinen hub slug'ları (`/antalya-transfer/`, `/gazipasa-transfer/`, `/alanya-transfer/`, `/antalya-alanya-transfer/`) anılmıştır. **Temizlik yapıldı (2026-09-13, bu commit):** `ACCESS_STATUS.md#L9` WordPress.com site tanımlayıcısı gizlendi (hiçbir depoda tutulmaz; owner'ın WordPress.com hesabında görünür). Mac host yolu public `AG`'de **dokuz** konumdaydı ve hepsi `<MAC_WORKSPACE_ROOT>` ile değiştirildi (satır sayıları korundu): `handoff/HERMES_TASK_PACKET_01.md#L92`; `reports/ALANYAGROUP_RECONCILED_BOOKING_CANDIDATE_V1/tools/preflight_baseline_check.sh#L24,#L31` (varsayılan kök kaldırıldı — argüman veya `AG_WORKSPACE_ROOT` zorunlu, yoksa exit 2); `…RECONCILED…/ABSENT_FILES_MANIFEST.md#L11,#L23`; `…/README.md#L7`; `…/TASK_STATUS.md#L7,#L13,#L82`; `…/evidence/01_baseline_verification.md#L7-8`. Önceki atıflar (`preflight #L12,L31`; `AGOS-MASTER-STATUS.md#L103`) yanlıştı: betikte yol `#L24` ve `#L31`'deydi; private `agos/master-status/AGOS-MASTER-STATUS.md`'de yerel WP kökü `#L102`'dedir (`#L103` "Documentation Runtime") — private, dokunulmadı. Gerçek çalışma kökü hiçbir depoda tutulmaz; Hermes/Codex betiğe argüman verir. Ayrıca 05 §2.2'de 2026-06-21 sayfasının slug'ı basılmıştı (formlu sayfa, PII değil, ama bu tablonun "pilot URL'leri verilmedi" satırıyla çelişiyordu) — private atıfla (`MASTER_PROJECT_STATUS.md#L48`) değiştirildi. Bu düzeltmeler sonrası e-posta/telefon/host yolu/site tanımlayıcısı/DB tanımlayıcısı/sayfa ID grep'i paketin tamamında (01–05, README, Codex paketi, `tools/`) 0 sonuç vermiştir; n8n orchestrator ID'si `AG/CLAUDE.md#L108`'de owner tarafından zaten yayımlandığı için 03 ve Codex paketinde bırakıldı.

---

*Paket içeriği:* `ACCESS_STATUS.md` (28 satır, bu oturumun doğrudan ölçümü) · `01_PAGES_AND_CONTENT.md` (294) · `02_BOOKING_FORM_UX_UI.md` (329) · `03_RESERVATION_OPERATIONS.md` (242) · `04_SEO_SPEED_TECHNICAL.md` (299) · `05_GATES_SEQUENCING_ROLLBACK.md` (316) · `tools/reproduce_counts.py` · bu README. Önceki paketler: `AG/reports/ALANYAGROUP_SITE_FINAL_REMEDIATION_V1/` (başlangıç noktası), `…_RECONCILED_BOOKING_CANDIDATE_V1/` (durdurma gerekçesi + preflight betiği), `…_FINAL_COMPLETION_V1/` (kısmen geçersiz, bkz. `AG/CLAUDE.md §8`).

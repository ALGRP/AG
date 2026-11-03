# Codex Paket-01 akran incelemesi ve Paket-02 şartnamesi

**Tarih:** 03.11.2026 · **İnceleyen:** Claude (akran) · **Tür:** PEER_REVIEW
**Durum:** `LOCAL_ONLY · INDEPENDENT_HUMAN_ACCEPTED=NO · PR DRAFT · G0 HOLD`. Bu inceleme insan bağımsız kabulünün yerine geçmez.
**İncelenen sürüm:** BASE `a911358e003921155e5eae16b81acb78f99def4f` → HEAD `29979b45ac82661ee7de94c80e580c9503227649` (yedi commit; origin ile aynı, temiz ağaç).

## 1. Commit kararları

| Commit | Kalem | Karar | Kanıt (bu oturumda koşuldu) | Not |
| -- | -- | -- | -- | -- |
| 8338590 | QA-F12 · 5+ otomatik fiyat yasağı | **PASS** | A12.5 | Dördüncüden sonraki grup toplamı tarifede reddediliyor; 80 € geri gelemez. |
| de540da | QA-F13 · üretim kapısı | **PASS** | A13.3, A13.1–A13.5 | Boş, `prod`, `Production` ve diğer her değer kapalı; yalnız `development` / `test` açık. `dev:api` öneki POSIX kabuğu ister (N3). Gerçek IdP/CRS/Hermes kapıları bu commit'te değişmedi; hâlâ "her durumda red". |
| a64facf | QA-F8 · tekrarlanan dekont | **PASS** | A5.5, A5.6, E3 | Eşzamanlı 4 yazım varyantında tek 201, üç 409. Farklı haftada aynı ödeyen + aynı referans da 409. Saklanan değer ham kalıyor (§5, CRS notu). |
| e19805a | QA-F2 · mükerrer mahsup | **NEEDS REVIEW** | A3.8, E1, E2 | Eşzamanlı 6 aynı istekte tek 201. Ama referans normalize edilmiyor: `onay-dup-1` ve `ONAY-DUP-1` iki ayrı mahsup olarak kaydedildi (**N2**, koşuldu). |
| eca5377 | QA-F1 · atanmış sefere geç katılım | **PASS (yerel)** | A2.6, E4, E5 | Eşzamanlı 3 geç rezervasyonda kapasite korunuyor (8 + 8 yolcu, ikinci sefer açıldı). Atanmış tedarikçi o sitenin doğrulanmamış kendi tarafıysa geç rezervasyon açık sefere gidiyor. Gerçek DB yarış koşulu **NOT_RUN** (MemoryStore sıralı). |
| 6a48921 | QA-F7 + L2 · ilk kapanış sırası | **FAIL** | A4.4, A4.5, E6–E8, A4.12 | Kural doğru yönde, ama ilk faaliyet 4 haftadan eskiyse hiçbir hafta kapanamıyor (**N1**, P1). Yıl sınırı doğru (`2026-W53` → `2027-W01`). A1.3'ün `skip` gerekçesi doğru. |
| 29979b4 | PKG-F05b · pay tutarsızlığı | **PASS** | "paket F05", E9 | Eski kayıtlar değişmiyor; istisna her hafta görünüyor; iptal tam kayıtlı payı ters çeviriyor. Otomatik düzeltme yok (H-24). |

## 2. Gerçekten çalıştırılan testler

| Koşum | Ortam | Sonuç |
| -- | -- | -- |
| `npm run typecheck` | Node 22, Linux | PASS |
| `npm test`, HEAD `29979b4` | aynı | **184 test: 165 geçti, 0 kaldı, 18 todo, 1 skip.** Codex raporuyla aynı. |
| `npm test`, bu belgeyle (iki yeni `todo` test eklendi) | aynı | 186 test: 165 geçti, 0 kaldı, 20 todo, 1 skip |
| `AG_TEST_PG=1` şema probları | PostgreSQL 16.15, atılabilir küme | **38 test: 2 geçti, 0 kaldı, 36 todo.** P1–P16 ve C01–C05 reddedildi. Q01–Q35 hâlâ kabul ediliyor (QA-F4). p1 oturumu p2 satırlarını görüyor (QA-F3). Paket-01 şemaya dokunmadı. |
| Sunucu erişilemezken `AG_TEST_PG=1` | — | Çıkış kodu 1. Yanlış "geçti" üretmiyor. |
| Ek problar E1–E9 | geçici test dosyaları; koşum sonrası silindi | Aşağıda |

Ek problar:

| # | Ne | Sonuç |
| -- | -- | -- |
| E1 | 6 eşzamanlı aynı mahsup | 1 × 201, 5 × 409; tek kayıt |
| E2 | `onay-dup-1` sonra `ONAY-DUP-1` | 201, 201 (**N2**) |
| E3 | `TR-77 12`, `tr-7712`, `TR-7712`, `Tr-77 12 ` eşzamanlı; sonra farklı hafta | 1 × 201, 3 × 409; farklı hafta 409 |
| E4 | atanmış sefere eşzamanlı 3 geç rezervasyon (4'er yolcu, kapasite 10) | sefer başına 8 yolcu; tedarikçi atanmış seferdeki geç rezervasyona geçti |
| E5 | tedarikçi = geç rezervasyonun sitesinin doğrulanmamış kendi tarafı | geç rezervasyon atanmış sefere girmedi, tedarikçi atanmadı |
| E6 | faaliyetsiz depo, W45 sonu + tam 4 hafta / + 4 hafta 1 ms | 201 / 409 `first_week_too_old` |
| E7 | faaliyet 2026-W53, önce 2027-W01 | 409 `close_first_active_week:2026-W53`; sonra W53 ve W01 201 |
| E8 | yalnız W45'te oluşturulmuş rezervasyon (tahsilat yok), önce W46 | 409 `close_first_active_week:2026-W45` |
| E9 | kayıtlı 700/200/2100 (beklenen 600/300/2100) → W46 +20 € → W47 −20 € iade → W48 iptal | Eski kayıt nesnesi değişmedi. W46 deltası 400/200/1400, W47 −400/−200/−1400; iki haftada da `share_mismatch`. W48 ters kayıt −3000/−700/−200/−2100, toplam 0. |

**NOT_RUN:** gerçek CRS PostgreSQL üzerinde yarış koşulu, gerçek IdP / 2FA, reklam API'leri, Hermes, ajan davranış testleri, insan bağımsız QA.

## 3. Yeni bulgular

| # | Önem | Commit | Bulgu | Kabul testi |
| -- | -- | -- | -- | -- |
| **PR1-N1** | **P1** | 6a48921 | 4 haftalık koruma, faaliyet olsa da uygulanıyor. İlk kapanış ilk faaliyetten 4 haftadan geç yapılırsa en erken hafta `first_week_too_old`, sonraki hafta `close_first_active_week` alıyor: hiçbir hafta kapanamıyor. Kodun yorumu korumayı "faaliyet yoksa" diye anlatıyor. | `A4.12` (`todo: PR1-N1 · Codex Paket-01b`) |
| **PR1-N2** | P2 | e19805a | Mahsup referansı `OFS-<hafta>-<onay ref>` normalize edilmiyor; büyük/küçük harf farkıyla aynı yazılı onay iki mahsup olur. | `A3.13` (`todo: PR1-N2 · Codex Paket-01b`) |
| PR1-N3 | P3 | de540da | `dev:api` betiği `NODE_ENV=development node …` POSIX kabuğu ister; Windows'ta çalışmaz. Mac/Linux için sorun yok. | — (gözlem) |
| PR1-N4 | Gözlem | 29979b4 | Pay farkı kontrolü yalnız engellenmemiş ve tamamlanmış satırlarda çalışıyor. İtirazlı veya mükerrer şüpheli satırdaki fark, engel kalkınca görünür. Para hareketi yok; kabul edilebilir. | — |

**PR1-N1 için en küçük düzeltme önerisi:** Faaliyet varsa yalnız `weekId === earliest` kabul edilsin, yaş sınırı uygulanmasın. 4 hafta koruması yalnız `earliest === undefined` iken çalışsın. Bu bir yerel korumadır; üretim saklama politikası değildir ve Owner kararı gerektirmez.

**PR1-N2 için öneri:** `adjustment_reference` F8'deki `normalizeBankReference` ile aynı biçimde normalize edilerek karşılaştırılsın. Mahsup kaydı için `MemoryStore.appendAdjustments` içindeki benzersizlik de normalize değere baksın.

## 4. Kalan güvenlik açıkları (Paket-01 sonrası)

| Bulgu | Açık | Durum |
| -- | -- | -- |
| QA-F3 | Kiracı (site) bazında yetki yok; tek global yönetim anahtarı her siteyi görüyor ve değiştiriyor. DB'de RLS yok. | Paket-02 |
| QA-F10 | Rezervasyon itirazı kararı ve mükerrer işaretinin kaldırılması 2FA, gerekçe ve aktör kaydı istemiyor; komisyonu serbest bırakıyor. | Paket-02 |
| QA-F11 | Satış atfı taklit edilebilir `Origin` başlığına dayanıyor; Turnstile yanıtında alan adı karşılaştırılmıyor. | Paket-02 |
| QA-F9 | Aynı tedarikçi makbuzu iki rezervasyona yazılabiliyor. | Paket-02 |
| QA-F4 | Defter tablolarında 35 kural ihlali şemada kabul ediliyor. | Paket-03 (DB) |
| QA-L5 | Arama belirteci idempotency kaydında düz metin. | Paket-02 düşük |
| SEL-332 | Gerçek IdP ve 2FA yok; HTTP üzerinden 2FA isteyen işler kapalı (doğru davranış). | Güvenlik hattı |

## 5. Skill tutarlılığı ve birleştirme durumu

Karşılaştırılanlar: karar kaydı `config/policy-decisions.json` (paket V2.5 birebir), bu oturuma senkronlanan org skill'leri, repo adayı `skills/agos-consortium-settlement/SKILL.md` ve V2.5 paketindeki adaylar (izole çalışma alanında).

Org skill SHA-256 ilk 8 hane (bu oturum, değişmedi): `agos-pricing-matrix` `86ef0045`, `agos-pool-finance` `9876d38a`, `agos-governance` `97c7a21f`. **Hiçbir aktif skill dosyasına yazılmadı.**

### 5.1 Hâlâ aktif olan çelişkiler

| # | Kural | Aktif org skill (eski) | Karar kaydı / kod | Öneri |
| -- | -- | -- | -- | -- |
| S-1 | 5+ yolcu fiyatı | `agos-pricing-matrix` satır 23: "5 = 80 €, +10 €/kişi" | `commercial.group_total_minor` yalnız 1–4; `open.manual_5plus_bounds = null`; kod 5. toplamı reddediyor (QA-F12) | Satır `LEGACY_BID_MARKUP` / tarihsel kayıt olarak işaretlensin; konsorsiyum için "5+ yalnız onaylı hat sınırı + 2FA" yazılsın. |
| S-2 | Mahsup | `agos-pool-finance` satır 60: "Otomatik mahsup (Owner kararı) … tek yönde net tutar" | `T1_REFUND_NOT_AUTO_OFFSET`; D-F03 kodda brüt ve yönlü | Kural `LEGACY_DRIVER_LEDGER` kapsamına alınsın; konsorsiyum kapsamında "yazılı onay + 2FA olmadan netleşme yok" yazılsın. |
| S-3 | Tedarikçi düzeyinde mahsup | `agos-governance` satır 40 | aynı | S-2 ile aynı ayrım; cümle konsorsiyum kapsamı dışında tutulsun. |
| S-4 | ×1,30 teklif marjı | `agos-pricing-matrix` | Private/VIP'de AGOS payı 0; ×1,30 konsorsiyuma taşınmaz | Ayrı politika kimliği `LEGACY_BID_MARKUP` (değişiklik yok, yalnız kapsam etiketi). |

S-1…S-3 V2 devrinde de bulunmuştu (`skills/ORG-SKILL-UPDATES-2026-11-03.md` S1–S10). Org skill'leri değişmediği için hâlâ geçerliler.

### 5.2 Paket-01 sonrası skill'lerde eksik kalan kurallar

Ne repo adayı ne paket adayı şu kuralları içeriyor:

| Kural (kod) | Repo adayı | Paket `agos-consortium-settlement` | Öneri |
| -- | -- | -- | -- |
| `share_mismatch` istisnası, otomatik düzeltme yok (H-24) | yok | genel ("actual prior posted shares") | Repo adayına D-F05 altında bir madde. |
| İlk kapanış en erken faaliyet haftasından başlar | yok | yok | **PR1-N1 düzeltilmeden yazılmaz.** Düzeltmeden sonra eklenir. |
| Dekont referansı normalize edilerek tekilleştirilir | yok | genel ("source reference") | Repo adayına "mükerrer" maddesi. |
| Aynı mahsup referansı bir kez | yok | yok | PR1-N2 düzeltmesinden sonra eklenir. |
| 5+ toplam tarifede reddedilir | var | `agos-consortium-policy` var | Tutarlı. |
| `NODE_ENV` yalnız `development`/`test` | var (satır 149, eski açıklama) | yok | Repo adayı satır 149 güncellenmeli. |

**Birleştirme önerisi (uygulanmadı):**
1. Paket-01b (N1, N2) Codex'te kapanır ve testler yeşile döner.
2. Claude, repo adayına yukarıdaki dört kuralı ve satır 149'u ekleyen tek bir commit hazırlar. Üç yönlü birleştirme tabanı `96ebf0a` blob `451b53a…` korunur; V2.5 paketiyle 4 çakışma bilinmektedir (V2.5 ilk teslim §5).
3. Org skill'leri için S-1…S-4 değişikliği yalnız öneri metni olarak kalır. Kurulum ayrı kapıdır: taban ölçümü + aday ölçümü + bağımsız inceleyici onayı (D §1).

**Değerlendirme sonuçları:**
- Referans hesaplama (paket doğrulayıcısı ve Python referansı) önceki turda 72/72 geçti. Bu, koddan bağımsız bir hesap olduğu için Paket-01'den etkilenmez.
- Karar kaydı ile kod: `policy-decisions.test.ts` bu HEAD'de geçti.
- Ajan davranış testi: **NOT_RUN** (78 senaryo; bütçe onayı H-14).

## 6. Paket-01b (önce, küçük)

| Kalem | Dosya | Kabul |
| -- | -- | -- |
| PR1-N1 ilk kapanış kilitlenmesi | `apps/api/src/service.ts` `closeWeek` | `A4.12` `todo` kaldırılır ve geçer; A4.4 ve A4.5 yeşil kalır |
| PR1-N2 mahsup referansı normalizasyonu | `apps/api/src/service.ts` `createOffset`, `apps/api/src/store.ts` `appendAdjustments` | `A3.13` `todo` kaldırılır ve geçer; A3.8 yeşil kalır |

Beklenen durum: 186 test, 167 geçti, 18 todo, 1 skip.

## 7. Paket-02 şartnamesi

Kurallar:
- Her kalem ayrı commit. Kabul ölçütü: ilgili testin `todo` işareti kaldırılır ve test **assertion değişmeden** geçer.
- Bir test yalnız fikstür veya harness değişikliğiyle geçebiliyorsa bu değişiklik commit mesajında ayrıca belirtilir ve inceleyiciye gösterilir.
- Testi gevşetmek, silmek veya `skip` yapmak yasak.
- Canlı sistem, gerçek müşteri verisi, ödeme, reklam API'si yok.

### 7.1 QA-F3 · Uydu siteler arasında veri izolasyonu (FINANCE + SECURITY, P0)

- **Sorun:** Tek global yönetim anahtarı her sitenin rezervasyonunu ve ekstresini görüyor, değiştiriyor. DB şemasında RLS yok.
- **Kabul testleri:**
  - `qa-independent/a06-cross-site.test.ts` A6.3 (site A, site B rezervasyonlarını okuyamaz), A6.4 (değiştiremez → 403), A6.5 (ekstrede yalnız kendi alacağı).
  - `packages/db/src/schema-probes.test.ts` "QA-F3 (DB)": p1 oturumu p2 satırlarını görmez; defter tablolarında RLS açık ve zorunlu (`AG_TEST_PG=1` ile koşulur).
  - **Uyarı:** A6.3–A6.5 bugün `x-site-id` başlığıyla "site adına" davranıyor. Yalnız başlığa göre süzmek testi geçirir ama izolasyon sağlamaz, çünkü aynı anahtar başlıksız istekle her şeyi görebilir. Bu yüzden şu iki ek test **zorunludur** (Paket-02'de yazılacak, assertion bu metinle aynı):
    - A6.8: site kapsamlı kimlikle `x-site-id` başka siteye çevrilse de yanıt yalnız kendi sitesinin satırlarını içerir veya 403 döner.
    - A6.9: site kapsamlı kimlik platform uçlarına (`/v1/admin/outbox`, başka sitenin kapanışı) erişemez → 403.
- **Dosyalar:** `apps/api/src/http.ts` (kimlik → `Actor`), `apps/api/src/service.ts` (`Actor`'a `scope`; `listBookings`, `cancel`, `weekReport` süzme), `packages/db/migrations/` (yeni göç: `ENABLE` + `FORCE ROW LEVEL SECURITY`, `current_setting('ag.party_id')` politikaları).
- **Önerilen çözüm:**
  - `Actor` = `{ id, role, mfa, scope: { kind: "platform" } | { kind: "site", siteId, partyId } }`.
  - Kapsam yalnız doğrulanmış kimlikten türer, istek başlığından türemez. Yerelde: site başına ayrı yerel anahtar (`AG_SITE_TOKENS` JSON).
  - Servis katmanında her okuma ve yazma kapsamla süzülür. Kapsam dışı kayıt 404 (varlık sızdırmaz), kapsam dışı işlem 403.
  - DB: ayrı göç dosyası; mevcut `0001` değişmez.
- **Bağımlılık:** Gerçek kimlik SEL-332. Yerel anahtar modeli yalnız LOCAL_ONLY; üretim kapısı kapalı kalır.

### 7.2 QA-F10 · Yönetici kimlik doğrulaması ve 2FA (SECURITY, P0)

- **Sorun:** `resolveDispute` ve `clearDuplicate` 2FA, gerekçe ve aktör kaydı istemiyor; HTTP'deki statik anahtar komisyonu serbest bırakabiliyor.
- **Kabul testleri:** `qa-independent/a07-a08-a12-price-2fa.test.ts` A8.3 ve A8.5. A8.4 **`todo` kalır** (H-21 kararı bekliyor).
- **Dosyalar:** `apps/api/src/service.ts` (`resolveDispute`, `clearDuplicate`), `apps/api/src/http.ts` (ilgili uçlar `actor`'ı geçirir), `packages/core/src/booking.ts` (karar kaydı alanları).
- **Önerilen çözüm:**
  - İki fonksiyon da `actor` alır ve `#requireMfa(actor, ["admin", "finance_manager"])` çağırır.
  - Gerekçe en az 5 karakter; `decided_by`, `decided_role`, `decided_at`, `reason` rezervasyona yazılır.
  - HTTP'deki statik anahtar `mfa: false` taşıdığı için 403 `mfa_required` döner. Bu, mevcut K17 fiyat onayıyla aynı desen.
- **Bağımlılık:** Gerçek 2FA SEL-332; yerel testte `MANAGER` aktörü kullanılır.

### 7.3 QA-F9 · Aynı ödeme belgesinin birden fazla rezervasyonda kullanılması (FINANCE, P1)

- **Sorun:** Aynı tedarikçinin aynı makbuz numarası iki rezervasyona tam tutarla yazılabiliyor; çift tahsilat görünür.
- **Kabul testi:** `qa-independent/a05-duplicates.test.ts` A5.4.
- **Dosyalar:** `apps/api/src/service.ts` `recordCollection` (satır ~529), `apps/api/src/store.ts`.
- **Önerilen çözüm (varsayılan reddet):** Aynı tahsil eden + normalize referans başka bir rezervasyonda varsa 409 `reference_used_on_other_booking`. Normalizasyon F8 ile aynı fonksiyon.
- **Açık karar (H-26):** Bir makbuz gerçekten birden fazla rezervasyonu kapsıyorsa (grup ödemesi) açık tahsis modeli gerekir: makbuz kaydı + rezervasyon başına tahsis, tahsislerin toplamı makbuz tutarını geçemez. Paket-02 yalnız reddi uygular; tahsis modeli karar gelince ayrı iş olur.

### 7.4 QA-F11 · Reklam ve site kaynak atfı güvenliği (SECURITY + FINANCE, P1)

- **Sorun:** Tarayıcı dışı bir istemci `Origin` başlığını taklit ederek rezervasyonu (ve gelecekteki %20 komisyonu) istediği siteye yazdırabiliyor. Turnstile doğrulamasında alan adı karşılaştırılmıyor.
- **Kabul testi:** `qa-independent/a10-attribution.test.ts` A10.2. A10.1 ve A10.3–A10.4 yeşil kalır.
- **Dosyalar:** `apps/api/src/main.ts` (`verifyHuman`), `apps/api/src/service.ts` (`submit`, satır ~169), `qa-independent/harness.ts` (sahte `verifyHuman`).
- **Önerilen çözüm:**
  - `verifyHuman(token, ip)` yerine `verifyHuman(token, ip) → { ok, hostname }`. Cloudflare siteverify yanıtındaki `hostname` talep edilen sitenin `domains` listesinde değilse 403 `attribution_not_verified`.
  - Yerel modda (`TURNSTILE_SECRET` yok) belirteç zorunlu kalır. Sahte doğrulayıcı yalnız `local:<alan adı>` biçimindeki belirteci kabul eder; belirteçsiz istek reddedilir.
  - **Harness değişikliği gerekir** (sahte doğrulayıcı alan adını tanır). A10.2'nin assertion'ı değişmez. Değişiklik commit mesajında belirtilir.
  - Reklam tıklama kimlikleri (gclid/fbclid) atıf kanıtı sayılmaz; yalnız ölçüm verisidir. Reklam API'si yok.

### 7.5 QA-F14 · Tahsil edilmiş ama tamamlanmamış rezervasyonların görünmesi (FINANCE, P1)

- **Sorun:** Tedarikçi müşteriden para almış ama iş tamamlanmamışsa rezervasyon hiçbir ekstrede (kayıt, istisna, bakiye) görünmüyor.
- **Kabul testi:** `qa-independent/a02-partial-collection.test.ts` A2.7.
- **Dosyalar:** `packages/core/src/settlement.ts` (`ExceptionReason`, `exceptionReasons`, `OPEN_EXCEPTION_REASONS`), `apps/api/src/report-html.ts` (`REASON_TR`).
- **Önerilen çözüm:**
  - Yeni istisna `collected_not_completed`: iptal edilmemiş, hafta sonuna kadar net tahsilatı > 0, tamamlanma yok veya hafta sonundan sonra.
  - **Durdurucu değil** ve pay üretmez (T2: tamamlanmadan pay yok). Tamamlanana kadar her hafta taşınır.
  - Raporda "Tahsil edildi, transfer tamamlanmadı — tedarikçide müşteri parası" etiketi.
- **Yan etki kontrolü:** W45 örnek raporu (`npm run report:sample`) değişirse fark ayrıca gösterilir.

### 7.6 PKG-F04b · Onaylı nakitsiz kredi / iade işlemleri (FINANCE, P2)

- **Sorun:** 30 € tahsil edildi, kalan 20 € için müşteriye onaylı bir hizmet kredisi verildi. Sistem bunu kaydedemiyor; müşteri borcu 20 € görünmeye devam ediyor.
- **Kabul testi:** `packages/core/src/settlement.regression.test.ts` "paket F04: 30 € tahsil + onaylı 20 € nakitsiz hizmet kredisi → müşteri borcu 0".
- **Dosyalar:** `packages/core/src/settlement.ts` (`SettlementLine.approved_credit_minor`, müşteri bakiyesi), `packages/core/src/booking.ts` (kredi notu kaydı), `apps/api/src/service.ts` (yeni `approveCustomerCredit`, 2FA), `apps/api/src/http.ts`.
- **Önerilen çözüm:**
  - Kredi notu: 2FA'lı yönetici, gerekçe ≥ 5 karakter, tekil referans (normalize), tutar ≤ kalan borç. Statik HTTP anahtarıyla 403 `mfa_required`.
  - Müşteri borcu = fiyat − brüt tahsilat − onaylı kredi.
  - **Komisyon tabanı değişmez:** pay yalnız gerçek nakit tahsilattan (T2). 30 € → 6/3/21.
- **Açık karar (H-25):** Krediyi kim taşır (tedarikçi, satış sitesi, AGOS)? Karar gelene kadar kredi yalnız müşteri borcunu kapatır; taraflar arası hiçbir para kaydı üretmez.

### 7.7 Önerilen sıra ve beklenen sonuç

1. Paket-01b (N1, N2)
2. QA-F10 (küçük, güvenlik)
3. QA-F3 (en büyük; servis + DB göçü)
4. QA-F14
5. QA-F9
6. QA-F11
7. PKG-F04b

Not: Owner sırası F3, F10, F9, F11, F14, F04b. F10'u öne almamın nedeni: F3'teki `Actor` kapsam değişikliği F10'un 2FA desenini kullanır ve F10 tek dosyada kalır. Owner aksini söylerse Owner sırası geçerlidir.

Paket-02 bitince beklenen: A6.3–A6.5, A6.8, A6.9, A8.3, A8.5, A5.4, A10.2, A2.7 ve F04 testleri yeşil; DB QA-F3 testi yeşil. `todo` kalanlar: A8.4 (H-21), A4.11 (H-20), F02 (H-23), QA-F4 Q-probları (Paket-03), düşük bulgular.

## 8. Paket-01b akran incelemesi (`954328c` → `8741de3`)

Sabitlenen sürüm `8741de30af52ba651971b5bc814c54ab471be723`. `npm run check`: 186 test, 167 geçti, 0 kaldı, 18 todo, 1 skip; Codex raporuyla aynı. A4.12 ve A3.13 assertion değişmeden geçiyor.

| Commit | Kalem | Karar | Kanıt |
| -- | -- | -- | -- |
| f2a5bd4 | PR1-N1 ilk kapanış kilitlenmesi | **FAIL (gerileme)** | A4.12 geçiyor; 10 hafta sonra W45 ve W46 kapanıyor; yalnız iptal edilmiş rezervasyon da faaliyet sayılıyor. **Ama** faaliyet varken ilk kapanış olarak faaliyetten önceki boş bir hafta (`2020-W01`) kabul ediliyor. Önceki sürümde bunu 4 hafta sınırı engelliyordu. Sonuç: W45'e ulaşmak için ~350 boş haftanın sırayla kapanması gerekir (PR1-N5). |
| 8741de3 | PR1-N2 mahsup referansı | **PASS** | 4 eşzamanlı harf varyantından tek 201; eski küçük harfli kayıt yeni büyük harfli isteği engelliyor; farklı hafta ayrı mahsup (201). |

**PR1-N5 kabul testi:** `A4.13` (`todo: PR1-N5 · Codex Paket-01c`). En küçük düzeltme: `earliest` tanımlıysa yalnız `weekId === earliest` kabul edilsin; `weekId < earliest` için 409 `close_first_active_week:<earliest>`.

Gözlemler (karar gerektirmez, not):
- PR1-N2 sonrası `written_approval_reference` büyük harfe çevrilerek saklanıyor; belgedeki özgün yazım kaybolur. Denetim için özgün metnin ayrı alanda saklanması önerilir (P3).
- Aynı yazılı onay referansı aynı hafta için farklı taraflar arası ikinci mahsupta da 409 veriyor. Bir onay belgesinin tek mahsuba bağlanması tutucu ve kabul edilebilir; bir belge birden çok mahsubu kapsayacaksa Owner kararı gerekir.
- 4 haftalık sınır yalnız boş defterde çalışıyor; LOCAL_ONLY. Üretim saklama politikası değildir; ayrıca Owner kararı gerektirmez.

**PostgreSQL'de ileride zorunlu kısıtlar (bugün yalnız MemoryStore'da):**
- `bank_receipt`: `UNIQUE (payer_id, upper(regexp_replace(bank_reference, '\s', '', 'g')))`.
- `settlement_adjustment`: `UNIQUE (upper(adjustment_reference))`.
- Haftalık kapanış: `SERIALIZABLE` işlem veya `pg_advisory_xact_lock` ile tek kapanış; `closed_week` üzerinde `UNIQUE (week_id)`.
- Bunlar Paket-03 (QA-F4) kapsamında; `AG_TEST_PG=1` probları bunları doğrulayacak.

## 9. Paket-01b ek doğrulama, PostgreSQL gereksinimleri ve ilk Paket-02 görevi

**Sürüm:** origin `753f0e7` (Codex `8741de3` + A4.13 todo testi). Ek problar bu sürümde koşuldu; geçici dosyalar silindi.

| Prob | Sonuç |
| -- | -- |
| Yıl geçişi: faaliyet 2026-W53, iki ay sonra önce 2027-W01 | 409 `close_first_active_week:2026-W53`; sonra W53 201, 2027-W01 201 |
| Faaliyetsiz defter: W45 sonu + tam 4 hafta / + 4 hafta 1 ms / ~30 hafta | 201 / 409 `first_week_too_old` / 409 |
| Faaliyet W45, 10 hafta sonra W45 ve W46 | 201, 201 (kilitlenme çözüldü) |
| Faaliyet W45, ilk kapanış `2020-W01` | **201 (PR1-N5, gerileme)**; A4.13 `todo` |
| Mahsup: 4 eşzamanlı harf varyantı / eski küçük harfli kayıt + yeni büyük harf / farklı hafta | 1×201 + 3×409 / 409 / 201 |

**Commit kararları değişmedi:** `f2a5bd4` FAIL (PR1-N5), `8741de3` PASS.

### 9.1 Gerçek PostgreSQL'de gereken kontroller (Paket-03, QA-F3/F4)

Bugün bu kontrollerin hepsi yalnız uygulama katmanında ve MemoryStore'da. CRS PostgreSQL'e geçmeden önce şemada da olmalı.

**Benzersizlik:**

| Tablo | Kısıt | Neden |
| -- | -- | -- |
| `bank_receipt` | `UNIQUE (payer_id, upper(regexp_replace(bank_reference, '\s', '', 'g')))` | QA-F8 |
| `settlement_adjustment` | `UNIQUE (upper(adjustment_reference))` | QA-F2, PR1-N2 |
| `money_event` (tahsilat) | `UNIQUE (collector_party_id, upper(regexp_replace(reference, '\s', '', 'g')))` | QA-F9. H-26 "çoklu tahsis" derse yerine tahsis tablosu + toplam kontrolü |
| `settlement_week` (kapanış) | `UNIQUE (week_id)` | çift kapanış |
| `settlement_entry` | `UNIQUE (booking_id, week_id)` | haftada tek fark kaydı |
| `statement_dispute` | `UNIQUE (dispute_ref)` | `ITZ-<hafta>-NNNN` |

**İşlem ve eşzamanlılık:**
- Kapanış ve mahsup yazımı `SERIALIZABLE` veya `pg_advisory_xact_lock(hashtext(week_id))` ile.
- Kapanış sırası kuralı (ilk kapanış = en erken faaliyet haftası; sonra `next_week_id`) bir `BEFORE INSERT` tetikleyicisiyle de doğrulanır; uygulama tek savunma olmaz.
- Kapanmış haftaya ait `settlement_entry`, `bank_receipt` ve `settlement_adjustment` satırları için `UPDATE`/`DELETE` reddeden tetikleyici (değişmezlik).

**Yetki (RLS ve roller):**
- Defter tablolarında `ENABLE` + `FORCE ROW LEVEL SECURITY`. Politika: `selling_party_id = current_setting('ag.party_id')` veya `supplier_id = current_setting('ag.party_id')`. Platform rolü ayrı ve 2FA'lı oturumla.
- Uygulama rolü tablo sahibi olmaz; `BYPASSRLS` yok. Göç rolü ile çalışma rolü ayrı.
- Mahsup, itiraz kararı, mükerrer temizleme ve kredi notu satırlarında `actor_id`, `actor_role`, `mfa_verified_at`, `reason` alanları `NOT NULL` (bugün Q21 probu bu alanların olmadığını gösteriyor).
- Bunların kabul ölçütü mevcut `AG_TEST_PG=1` probları: Q01–Q35, Q21 ve "QA-F3 (DB)".

### 9.2 Codex'e ilk Paket-02 görevi: QA-F10 · itiraz kararı ve mükerrer temizlemede 2FA

**Önkoşul:** Paket-01c (PR1-N5, A4.13) ayrı commit olarak önce kapanır.

**Kapsam (tek commit):**
- `apps/api/src/service.ts`:
  - `resolveDispute(actor, ref, input)` ve `clearDuplicate(actor, ref, input)` imzaları `actor` alır.
  - İkisi de `#requireMfa(actor, ["admin", "finance_manager"])` çağırır.
  - `reason` en az 5 karakter, `redactPii` uygulanır.
  - Rezervasyona `disputeDecidedBy`, `disputeDecidedRole`, `disputeDecisionReason` (ve mükerrer için `duplicateClearedBy`, `duplicateClearedRole`, `duplicateClearReason`, `duplicateClearedAt`) yazılır; outbox olayına aktör kimliği eklenir.
- `apps/api/src/http.ts` satır 184–187: iki uç da `actor`'ı geçirir. Statik anahtar `mfa: false` taşıdığı için yanıt 403 `mfa_required`. K17 fiyat onayı ve mahsupla aynı desen.
- `packages/core/src/booking.ts`: yeni alanlar (isteğe bağlı, geriye uyumlu).

**Kabul testleri:**
- `qa-independent/a07-a08-a12-price-2fa.test.ts` A8.3 ve A8.5: `todo` kaldırılır, assertion değişmeden geçer.
- A8.4 `todo` kalır (H-21: haklı itirazın mali etkisi kararı yok; bu görev mali sonucu değiştirmez).

**Değişmesi gereken mevcut testler (açıkça bildirilmeli):**
- `apps/api/src/api.test.ts` satır 460: statik anahtarla `clear-duplicate` → **200** bekliyor.
- `apps/api/src/api.test.ts` satır 476: statik anahtarla `resolve-dispute` → **200** bekliyor.
- Bu iki assertion bugünkü güvensiz davranışı kodluyor ve A8.3/A8.5 ile doğrudan çelişiyor. Gevşetme değil sıkılaştırma: beklenti **403 `mfa_required`** olur. Aynı testlerdeki sonraki adımlar (mükerrerin hesaba girmesi, itirazın çözülmesi) `MANAGER` aktörüyle servis çağrısına taşınır, böylece olumlu yol da test edilir.
- `qa-independent/a04-weekly-close.test.ts` satır 72 ve A8.4'teki `resolveDispute(ref, …)` çağrıları yeni imzaya `MANAGER` ile güncellenir; assertion değişmez.
- Commit mesajı bu dört çağrı değişikliğini tek tek listeler; inceleyici her birini ayrıca onaylar.

**Beklenen durum:** 187 test; PR1-N5 + QA-F10 sonrası 170 geçti, 16 todo, 1 skip.

**Kapsam dışı:** gerçek IdP / 2FA (SEL-332), kiracı kapsamı (QA-F3, sıradaki görev), haklı itirazın mali etkisi (H-21).

### 9.3 Açık Owner kararları (Paket-02'yi etkileyen)

| Karar | Etkilediği kalem | Karar gelene kadar uygulanacak (kesinleştirme değil) |
| -- | -- | -- |
| **H-25** · nakitsiz krediyi kim taşır | PKG-F04b | Kredi yalnız müşteri borcunu kapatır; taraflar arası para kaydı üretmez; komisyon tabanı gerçek nakit. |
| **H-26** · bir makbuz birden çok rezervasyona tahsis edilebilir mi | QA-F9 | Varsayılan red (409). Tahsis modeli yazılmaz. |
| H-21 · haklı itirazın mali etkisi | QA-F10 (A8.4) | A8.4 `todo` kalır. |
| H-20 · 7 takvim günü sayımı | A4.11 | `todo` kalır. |
| H-23 · küsurat dağıtımı | D-F02 | Algoritma değişmez. |

### 9.4 Skill birleştirme planının doğrulanması

- Org skill SHA-256 (bu tur yeniden hesaplandı): `agos-pricing-matrix` `86ef0045`, `agos-pool-finance` `9876d38a`. Değişmedi; hiçbir aktif skill dosyasına yazılmadı.
- Üç yönlü birleştirme provası (geçici çalışma alanında): taban `451b53a` (`96ebf0a`'daki aday), bizim taraf repo adayı, karşı taraf V2.5 paketi. `git merge-file --diff3`: **4 çakışma**, önceki turla aynı. Repo'ya uygulanmadı.
- Plan geçerli. Sıra:
  1. PR1-N5 ve QA-F10 kapanır.
  2. 4 çakışma elle çözülür; Paket-01 kuralları (§5.2) eklenir; tek commit.
  3. Taban ölçümü (eski org skill) ve aday ölçümü (H-14 bütçesi).
  4. Bağımsız inceleyici onayı.
  5. Org kurulumu ayrı kapı; Owner GO.

## 10. Paket-01c ve QA-F10 akran incelemesi (`3839bc7` → `66d5ecb`)

Sabitlenen sürüm `66d5ecba2c481dc7a3345dff32d4deff38c857a8`. `npm run check`: **188 test: 171 geçti, 0 kaldı, 16 todo, 1 skip**, Codex raporuyla aynı. Bu turda eklenen iki `todo` testle: 190 test, 171 geçti, 18 todo, 1 skip.

| Commit | Kalem | Karar | Kanıt |
| -- | -- | -- | -- |
| de0b8f5 | Paket-01c / PR1-N5 | **PASS** | A4.13, A4.12, A4.4, A4.5 geçiyor. W44 tarihli dekont varken önce W44, sonra W45 kapanıyor. **A4.8 beklentisi değişti:** boş W52'nin W53 faaliyetinden önce kapanması artık 409. Bu, A4.13 ile aynı kuralın tutarlı uygulanması; gevşetme değil sıkılaştırma. Kabul ediyorum; W52→W53 geçişi `nextWeekId` assertion'ıyla hâlâ test ediliyor. |
| 66d5ecb | Paket-02 / QA-F10 | **NEEDS REVIEW** | A8.3, A8.5, A8.6 geçiyor. HTTP gövdesinde ve başlıklarda sahte aktör / `mfa: true` → 403 `mfa_required` (aktör sunucuda kuruluyor). 3 eşzamanlı karar → 1×200, 2×409. Yalnız boşluktan oluşan gerekçe → 422. Gerekçedeki e-posta ve telefon maskeleniyor. `api.test.ts`'teki iki 200 → 403 değişikliği gerçek sıkılaştırma; olumlu yol 2FA'lı yöneticiyle ayrıca test ediliyor. **Ama** denetim geçmişi korunmuyor (PR2-N1). |

### Yeni bulgular

| # | Önem | Bulgu | Kabul testi |
| -- | -- | -- | -- |
| **PR1-N6** | P2 | İlk kapanış kuralı dekontları "faaliyet" sayıyor ve dekontun `paidAt` / `weekId` değerleri sınırlanmıyor. Tek bir yanlış girilmiş dekont (ör. `paidAt` 2016 veya `weekId` 2020-W01) ilk kapanışı o haftaya zorluyor: yüzlerce boş haftanın sırayla kapanması gerekir. Koşuldu: `close(W45)` → 409 `close_first_active_week:2016-W09` ve `:2020-W01`. 6a48921'den beri var; de0b8f5'in gerilemesi değil. | `A4.14` (`todo: PR1-N6 · Codex Paket-01d`) |
| **PR2-N1** | P2 | Aynı rezervasyonda ikinci itiraz kararı ilk kararın denetim kaydını (`disputeResolutionAudit`) üzerine yazıyor. İkinci kararın `audit.booking_dispute_resolved` outbox olayı `dedupeKey = type:bookingId` yüzünden sessizce düşüyor. Sonuç: ilk kararın gerekçesi kayboluyor, ikinci kararın olayı hiç yazılmıyor. | `A8.7` (`todo: PR2-N1 · Codex Paket-02`) |
| PR2-N2 | Gözlem | İkinci itiraz açıkken rezervasyonda önceki kararın denetim kaydı duruyor. PR2-N1 çözülürken geçmiş listesi olarak tutulursa kendiliğinden çözülür. | — |

**Önerilen en küçük düzeltmeler:**
- **PR1-N6:** `addReceipt` gelecekteki `paidAt` değerini ve rezervasyon faaliyeti başlamadan önceki haftaları reddetsin (`weekId` en erken rezervasyon haftasından eski olamaz; `paidAt` ile `weekId` arasında makul bir fark sınırı, ör. 8 hafta). Alternatif: ilk kapanış için yalnız rezervasyon faaliyeti sayılsın; dekontlar eşleşmeyen dekont olarak raporlansın. İkisi de para kuralı değiştirmez.
- **PR2-N1:** Denetim alanı tek kayıt yerine ekleme-yalnız liste (`…AuditHistory: SensitiveDecisionAudit[]`). Denetim olaylarının `dedupeKey`'i karar kimliğini içersin (ör. `audit.booking_dispute_resolved:<bookingId>:<at>`).

**Yerel aktör uyarısı (Codex'in notuyla aynı):** `Actor.mfa = true` servis testlerinde güvenilir çağıranın temsili. Gerçek IdP iddiası, imzalı oturum veya 2FA zamanı değildir. SEL-332 bitmeden hiçbir 2FA'lı finans işlemi HTTP'de açılmamalı. Bugün HTTP'de hepsi 403; doğru.

**Kapsam dışında kalan 2FA'sız finans uçları (kayıt için):** statik anahtarla `cancel`, `refund`, `collection`, `/v1/admin/receipts` ve haftalık kapanış hâlâ 2FA istemiyor. Bunlar QA-F10'un kapsamında değildi. Kişi ve rol modeli (H-12) ve SEL-332 ile birlikte ele alınmalı; QA-F3'te `Actor` kapsamı eklenirken bu uçlar da aktör alacak şekilde hazırlanmalı.

## 11. Sıradaki Paket-02 görevi: QA-F3 · kiracı izolasyonu ve RLS

**Önkoşul:** PR1-N6 (A4.14) ve PR2-N1 (A8.7) ayrı küçük commit'ler olarak kapanır.

**İlke:** Yetki yalnız sunucuda doğrulanmış kimlikten türer. `Origin`, `x-site-id` gibi istemci başlıkları, alan adı ve satış kaynağı atfı hiçbir zaman yetki vermez; en fazla zaten sahip olunan yetkiyi daraltır.

**Kabul testleri:**
- Mevcut: A6.3, A6.4, A6.5 (`qa-independent/a06-cross-site.test.ts`), "QA-F3 (DB)" (`packages/db/src/schema-probes.test.ts`, `AG_TEST_PG=1`).
- Yeni, Paket-02'de yazılır (assertion bu metinle aynı):
  - **A6.8:** site kapsamlı kimlik `x-site-id` başlığını başka siteye çevirse de yanıtta yalnız kendi sitesinin satırları bulunur veya 403 döner. Başlıksız istek de yalnız kendi sitesini görür.
  - **A6.9:** site kapsamlı kimlik platform uçlarına (`/v1/admin/outbox`, `/v1/admin/receipts`, haftalık kapanış, başka sitenin ekstresi) erişemez → 403.
  - **A6.10:** başka sitenin rezervasyon referansı tahmin edilse bile site kapsamlı kimlik için 404 (varlık sızdırmaz).
- Platform kimliğiyle mevcut tüm testler değişmeden geçer.

**Dosyalar:** `apps/api/src/http.ts`, `apps/api/src/service.ts` (`Actor.scope`), `apps/api/src/main.ts` (yerel site anahtarları), `qa-independent/harness.ts` (site kimliğiyle istek yardımcıları), yeni göç `packages/db/migrations/0002_tenant_rls.sql`.

**PostgreSQL en az yetki (göç adayı; canlı veritabanına uygulanmaz):**
- Roller: `ag_owner` (tablo sahibi, yalnız göç), `ag_app` (uygulama; `NOBYPASSRLS`, tablo sahibi değil), `ag_platform` (2FA'lı platform işlemleri), `ag_readonly` (rapor).
- Defter ve rezervasyon tablolarında `ENABLE` + `FORCE ROW LEVEL SECURITY`.
- Politika: `current_setting('ag.party_id', true)` boşsa hiç satır yok (kapalı varsayılan); doluysa `selling_party_id` veya `supplier_id` eşleşmeli. Platform politikası yalnız `ag_platform` rolünde.
- `ag_app` için `DELETE` yetkisi yok; kapanmış hafta satırlarına `UPDATE` tetikleyiciyle reddedilir.
- Kabul: "QA-F3 (DB)" probu (p1 oturumu p2'nin para hareketini ve dekontunu göremez; RLS açık ve zorunlu).

**Kapsam dışı:** gerçek IdP (SEL-332), staging veritabanı (SEL-329), canlı göç.

**Sonraki sıra (değişmedi):** QA-F14 → QA-F9 (H-26) → QA-F11 → PKG-F04b (H-25).

## 12. PR1-N6, PR2-N1 ve QA-F3 akran incelemesi (`6f29d50` → `afaac11`)

Sabitlenen sürüm `afaac11eb5644687a0c68ffd0ddf459ed83255aa`.

**Bu oturumda koşulanlar:**
- `npm run check`: **193 test: 179 geçti, 0 kaldı, 13 todo, 1 skip** (Codex ile aynı).
- PostgreSQL 16.15, atılabilir yerel küme (ağ yok, gerçek veri yok): `AG_TEST_PG=1 AG_TEST_PG_ISOLATED=YES` ile `tenant-rls.test.ts` + `schema-probes.test.ts`: **42 test: 7 geçti, 0 kaldı, 35 todo.** RLS testleri 4/4; "QA-F3 (DB)" geçti; P1–P16 ve C01–C05 reddedildi. **Q01–Q35 (QA-F4) hâlâ todo; geçti sayılmaz.** Küme sonra durduruldu.
- Test dosyalarında **assertion değişikliği yok**; yalnız `todo` işaretleri kaldırıldı. Fikstür değişikliği yok.

| Commit | Kalem | Karar | Kanıt ve not |
| -- | -- | -- | -- |
| 759580a | PR2-N1 denetim geçmişi | **PASS** | A8.7 geçiyor. Her karar `disputeResolutionHistory` listesine ekleniyor; outbox anahtarı karar sırasıyla ayrışıyor. Tekrar gönderim `no_open_dispute` (409). Yerel defter kalıcı CRS değildir. |
| 768667a | PR1-N6 dekont tarihi | **NEEDS REVIEW** | A4.14 geçiyor; 6 hafta geç gelen gerçek ödeme (faaliyetli hafta) kabul ediliyor. **Ama** kendi içinde tutarlı eski dekont (`weekId` 2020-W01, `paidAt` 2020-01-01) kabul ediliyor ve ilk kapanışı 2020-W01'e zorluyor (**PR1-N7**, A4.15 `todo`). 28 gün eşiği yalnız `paidAt − hafta sonu` farkına bakıyor; haftanın **bugüne göre** yaşına bakmıyor. Gelecek tarihli dekont da kabul ediliyor (P3). 28 gün yerel bir eşik; finansal saklama politikası değil. |
| fb3df6a | QA-F3 API | **PASS (yerel)** | A6.3, A6.4, A6.8, A6.9, A6.10 geçiyor. Site anahtarıyla `Origin` ve `x-site-id` kapsamı değiştirmiyor; outbox ve platform uçları 403; bilinmeyen `x-site-id` 403; site anahtarıyla gövdede `raisedBy: p-003` gönderilen ekstre itirazı `p-001` adına kaydediliyor. Site anahtarları sentetik ve yalnız yerel. |
| 794daff | QA-F3 ekstre | **PASS (yerel)** | A6.5 ve A6.8 ekstre kısmı geçiyor. Kendi tarama probum: rakip site rezervasyonu, rakip tedarikçi, rakip dekont, eşleşmeyen dekont, rakip itiraz notu, rakip mahsup ve rakip ekstre itirazı varken partner-site W45 ve W46 ekstrelerinde **sızıntı yok**. `supplier_statements`, `agos_fees` ve `unmatched_receipts` site görünümünde boş. Platform raporu değişmedi (`weekReport` aynı yol). |
| afaac11 | QA-F3 DB | **PASS (aday)** | 12 tabloda `ENABLE` + `FORCE RLS`; tablolar `ag_owner`'a ait; `ag_app` `NOBYPASSRLS`, `DELETE` yok, `ag_platform` üyeliği yok; kapsamsız oturum 0 satır; sahte `app.scope=platform` 0 satır. Yalnız atılabilir veritabanında. |

**Yeni bulgular ve notlar:**

| # | Önem | Bulgu | Kabul |
| -- | -- | -- | -- |
| **PR1-N7** | P2 | Eski ama kendi içinde tutarlı dekont ilk kapanışı yıllar öncesine zorluyor (768667a eksik kalan durum). Öneri: faaliyetsiz haftaya ait dekontta `now − hafta sonu > 28 gün` ise reddet; ya da ilk kapanış hesabında dekontları sayma, eşleşmeyen dekont olarak raporla. | `A4.15` (`todo: PR1-N7`) |
| PR1-N8 | P3 | Gelecek tarihli `paidAt` kabul ediliyor. | gözlem |
| QA-F3-N1 | P3 | `listBookingsForActor` önce tüm sitelerden son 200 kaydı alıp sonra süzüyor; yoğun bir başka site, sitenin eski kayıtlarını listeden düşürebilir. Sızıntı değil, eksik liste. Sayfalama ve kapsamlı sorgu CRS adaptöründe. | gözlem |
| QA-F3-N2 | Tasarım | `ag_app` yalnız okuyabiliyor; yazma `ag_platform` gerektiriyor ve ona geçiş yok. Uygulamanın yazma yolu (doğrulanmış ağ geçidi + kapsamlı bağlantı) SEL-331/332 tasarımında çözülmeli. `app.party_id` kriptografik kimlik değil; bağlantıyı ele geçiren onu ayarlayabilir. | SEL-332 |
| QA-F3-N3 | Tasarım | `ag_app` `LOGIN … PASSWORD NULL`: yerel `trust` doğrulamasında parolasız giriş. Atılabilir küme için kabul; staging ve üretimde yasak. | SEL-329 |
| QA-F3-N4 | Kapsam | `partner`, `site`, `subscription_invoice` gibi kayıt tablolarına hiçbir role izin verilmedi (platform dahil). Platform ekranları için ayrı izin gerekecek. | sonraki DB paketi |

**Durum:** 194 test (A4.15 eklendi): 179 geçti, 0 kaldı, 14 todo, 1 skip.

**Sıradaki iş:**
1. Paket-01e: PR1-N7 (A4.15), küçük tek commit.
2. Paket-02 devam: **QA-F14** (tahsil edilmiş ama tamamlanmamış rezervasyonun görünmesi, A2.7). Şartname §7.5.
3. Sonra QA-F9 (H-26), QA-F11, PKG-F04b (H-25). QA-F4 DB kısıtları (35 prob) ayrı paket.

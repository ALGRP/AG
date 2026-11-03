# V2.5 ilk teslim: karşılaştırma, bulgu önceliği, Codex Paket-01

**Tarih:** 03.11.2026
**Girdi:**
- `AGOS_Skill_Paketi_V2_5.zip` (SHA-256 `0b6d73a8…`, 81 dosya, güvensiz yol ve sembolik bağlantı yok)
- `Claude_Devir_Talimati_V2.md` (önceki devir belgesiyle birebir aynı)

**Kapsam:**
- LOCAL_ONLY. Yeni araştırma turu yok, sıfırdan yazılım yok.
- PR merge, canlı rezervasyon, ödeme, reklam hesabı ve harcama yok.
- Aktif org skill'lerine yazılmadı.

Kanonik eşleme: [TEK-KARAR-SKILL-ESLEMESI.md](./TEK-KARAR-SKILL-ESLEMESI.md).

## 1. Kaynak doğrulama

| | Değer |
| -- | -- |
| Son görülen HEAD (Owner) | `f9cbb6e` |
| Bu turdan önceki gerçek HEAD | `3eb5758` (yerel = uzak) |
| Arada kalan commit'ler | Hepsi bu oturumun (Claude): `e866a3c` kırmızı testler, `4b305b7` V2 finans düzeltmesi, `3eb5758` V2 belgeleri |
| Başka biri push etti mi | Hayır |
| `f9cbb6e` → `3eb5758` farkı | 18 dosya. Uygulama kodunda `settlement.ts`, `service.ts`, `booking.ts`, `report-html.ts` ve migration değişti |
| Paketin sabitlediği commit | `96ebf0a`. **Güncel sayılmadı:** paket bulguları `3eb5758` üzerinde yeniden değerlendirildi (§2) |

## 2. Karşılaştırma: paket ↔ PR (güncel) ↔ docs/konsey

| Paket bulgusu | `3eb5758` durumu | Not |
| -- | -- | -- |
| PKG-F01 (V1 kısmi tahsilat) | Yalnız V1 | PR'da T2 uygulandı (`settlement.test` T2) |
| PKG-F02 (9→10 kuruşta AGOS −1) | **Açık** | Test todo (D-F02); karar H-23 |
| PKG-F03 (net sıfır netleşme) | **Kapandı** | `4b305b7`; tam karşıörnek (+1000/−1000) teste eklendi, geçiyor |
| PKG-F04 (kredi + iade sonrası borç) | **Kısmen** | Nakit iade kapandı. **Nakitsiz onaylı kredi açık** (PKG-F04b, todo): kredi notu kaydı yok |
| PKG-F05 (güncel politikayla yeniden hesap) | **Kısmen** | Kayıtlı paylar + dondurulmuş politika kapandı. **Aynı tabanda pay farkı hâlâ sessizce atlanıyor** (PKG-F05b, todo) |
| PKG-F06 (iptal ters kaydı) | **Kapandı (çekirdek)** | API'de teslim edilmiş iş iptal edilemiyor (`booking.ts`: `delivered` → yok), yani bu yol API'den tetiklenmez. CRS eşlemesinde yeniden bakılır |
| PKG-F07 (eski kurallar karışıyor) | Repo'da ayrıldı | Org skill'leri hâlâ eski metinde. Ekler hash'e bağlı ve hash'ler değişmedi: `agos-pricing-matrix` `86ef0045…`, `agos-pool-finance` `9876d38a…` |
| PKG-F08 (durum uyumsuzluğu) | Kapandı | Skill "yalnız yerel QA için onaylı" diyor |
| PKG-F09 (üç yönlü birleştirme tabanı) | **Taban bulundu** | `agos-consortium-settlement` için taban `96ebf0a` blob'u `451b53a…`, paket provenance'ıyla aynı (§5) |
| PKG-F11–F13, F15 (reklam araştırması) | Bu oturumda doğrulanamadı | Paket resmî Google gövdesine erişmiş (S04); Meta 429. Bu oturumda üç resmî alan adı engelli. Not: [reklam-entegrasyonu-hazirlik.md](./reklam-entegrasyonu-hazirlik.md) |
| PKG-F14 (somut güvenlik testleri yok) | Testlere bağlandı | DB probları, RLS ve 2FA testleri `todo` (§3) |
| PKG-F17 (yasal taraf ≠ domain; yöntem ≠ tahsil eden) | Kısmen | Tahsil eden yöntemden ayrı ✓; kendi aracı doğrulama tarihine bağlı ✓; yasal taraf modeli yok (Paket-02) |
| PKG-F18 (açık kararlar) | Tutarlı | `config/policy-decisions.json` ile kod uyumlu (`policy-decisions.test` geçer) |

**docs/konsey tarafında düzelenler:**
- B'deki yeni `agos-release-gate` önerisi geri çekildi; Mac'te `agos-release-preflight` zaten var.
- V2 turunda önerdiğim politika kimlikleri paketin kapsam adlarına takma ad oldu.
- D'deki 22 senaryo klasörü tek senaryo setiyle değiştirildi (§5).

## 3. Açık bulguların öncelik sırası

Bulgular PR testlerine bağlı: `todo` testi bulgu kimliğini taşır.

**Öncelik ilkesi:**
- **P0:** sessiz para kaybı veya iki kez sayım, ya da açık kalan bir güvenlik kapısı. Küçük ve yerel düzeltilebilir.
- **P1:** kimlik, CRS veya karar bekleyen daha büyük işler.
- **P2:** düşük önem.

| Sıra | Kimlik | Sorun | Paket | PR testi (todo) |
| -- | -- | -- | -- | -- |
| P0-1 | QA-F1 | Atanmış sefere sonradan katılan rezervasyon hiç hesaplanmıyor (site %20 ve AGOS %10 kayboluyor) | **Paket-01** | `qa-independent` A2.6 |
| P0-2 | QA-F2 | Aynı mahsup iki kez kaydediliyor | **Paket-01** | A3.8 |
| P0-3 | QA-F7 + QA-L2 | İlk kapanış önceki aktif haftayı veya keyfî eski bir haftayı atlayabiliyor | **Paket-01** | A4.4, A4.5 (A1.3 ön koşulu geçersizleşir; Paket-01 notu) |
| P0-4 | QA-F13 | `NODE_ENV=prod` / `Production` korumasız sunucu açıyor | **Paket-01** | A13.3 |
| P0-5 | QA-F12 | Tarifeye 5. eleman eklenince 5 kişi otomatik 80 € | **Paket-01** | A12.5 |
| P0-6 | QA-F8 | Dekont tekrarı harf farkıyla geçiyor (10 € iki kez ödenmiş sayılıyor) | **Paket-01** | A5.6 |
| P0-7 | PKG-F05b | Aynı tabanda kayıtlı pay hedeften farklıysa sessizce atlanıyor | **Paket-01** | `settlement.regression.test` "paket F05" |
| P1-1 | QA-F3 | Kiracı (site) yetkisi yok; global anahtar her siteyi görüyor ve değiştiriyor | Paket-02 (SEL-332, kiracı modeli) | A6.3–A6.5; DB RLS |
| P1-2 | QA-F10 | İtiraz çözümü ve mükerrer kaldırma 2FA'sız. Aynı sorun kapanış, iade, tahsilat ve dekont girişinde de var (yazar bulgusu) | Paket-02 (SEL-332) | A8.3, A8.5 (A8.4: H-21) |
| P1-3 | PKG-F04b | Onaylı nakitsiz kredi notu yok | Paket-02 | `settlement.regression.test` "paket F04" |
| P1-4 | QA-F11 | Satış atfı taklit edilebilir `Origin`'e dayanıyor; Turnstile alan adı kontrolü yok | Paket-02 | A10.2 |
| P1-5 | QA-F14 | Tahsil edilmiş ama tamamlanmamış iş hiçbir ekstrede görünmüyor | Paket-02 | A2.7 |
| P1-6 | QA-F9 | Aynı makbuz iki işte; tek ödemenin işlere dağıtım modeli yok | Paket-02 (tahsis tasarımı) | A5.4 |
| P1-7 | QA-F4 (+QA-F3 DB) | DB defter tablolarında 34 kural ihlali kabul ediliyor; RLS kısmi | **Paket-03:** CRS eşlemesiyle birlikte (SEL-331). Staging erişimi (SEL-329) önkoşul | `schema-probes.test` Q01–Q35, RLS |
| P2 | QA-L1, L3, L5, L6, L7 | Önizleme tekrarı, "---" onay referansı, sorgulama jetonunun düz metin saklanması, gelecek tarihli doğrulama, dev origin | Paket-02 | A1.4, A3.9, A6.7, A10.6, A10.7 |
| Karar | H-8, H-20…H-24, K17, K8, pro-rata, Salı 18:00, vergi | Owner / mali müşavir | — | A4.11, A8.4, A12.6, D-F02 |

**Neden QA-F4 en sonda:** Şema bir CRS eşleme adayı. DB kısıtlarını CRS şeması görülmeden adaya yazmak boşa iş olabilir. Problar bugünden gereksinim olarak sabitlendi; uygulama CRS eşlemesinde yapılır.

## 4. Codex Paket-01 (ilk küçük düzeltme paketi)

**Genel kurallar:**
- **Taban:** PR #9 dalının güncel HEAD'i. Her kalem ayrı commit (`Paket-01/QA-F1: …`); kalemler birbirine dokunmaz.
- **Kabul:**
  - İlgili testteki `todo` kaldırılır ve test geçer.
  - `npm run check` 0 hatayla biter.
  - Başka hiçbir testin beklentisi gevşetilmez. Kodu teste uydurmak için test değiştirilmez.
- **Kapsam dışı:**
  - şema değişikliği (Paket-03)
  - kimlik ve kiracı (Paket-02)
  - canlı sistem, gerçek veri, ağ çağrısı
- **İnceleme:** her commit'i Claude akran olarak inceler. Kabulü insan bağımsız inceleyici verir.
- **Paket sonu beklentisi:** ana sette `todo` 27'den 18'e düşer (8 test geçer, A1.3 `skip`). DB paketi değişmez (36 `todo`).

| Kalem | Beklenen davranış | Dokunulacak yer | Testler |
| -- | -- | -- | -- |
| **QA-F1** | Tedarikçisi atanmış sefere yeni rezervasyon eklenirse rezervasyon o tedarikçiyi alır. Aynı kontroller uygulanır (`#checkSupplier`: kendi aracı doğrulaması). Kontrol geçmezse rezervasyon yeni bir açık sefere gider. Tedarikçisi olmayan rezervasyon "teslim edildi" yapılmaz. | `apps/api/src/service.ts` (yerleştirme, `assignRun`, `completeRun`), gerekirse `packages/core/src/pool.ts` | A2.6 |
| **QA-F2** | Aynı `adjustment_reference` ikinci kez kaydedilmez: ikinci istek 409 döner, hiçbir zaman ikinci kayıt oluşmaz. Mahsup ve itiraz kararı düzeltmelerinin ikisi için de. | `service.ts` `createOffset`, `decideStatementDispute`; `store.ts` `appendAdjustments` | A3.8 |
| **QA-F7 + QA-L2** | Hiç hafta kapanmamışken ilk kapanış, faaliyeti olan **en erken** hafta olmalı (tahsilat, iade, tamamlanma veya dekont). Faaliyeti olmayan eski hafta (ör. 2020-W01) reddedilir. | `service.ts` `closeWeek` | A4.4, A4.5. **A1.3:** ön koşulu ("W46 önce kapanır", 201) artık oluşamaz. `skip: "QA-F7 düzeltmesiyle ön koşul oluşmaz; kural A4.4 ile korunur"` yapılır; silinmez, inceleyici onaylar. |
| **QA-F13** | Yerel mod yalnız açık seçimle açılır: `NODE_ENV` tam olarak `development` veya `test`. Bunun dışındaki her değer (boş, `prod`, `Production`) üretim sayılır ve kapı kapalı kalır. `npm run dev:api` `NODE_ENV=development` ile çalışır. | `apps/api/src/main.ts`, `package.json` `dev:api` | A13.3 (A10.7 yan etkiyle geçerse `todo` kaldırılabilir; geçmezse Paket-02) |
| **QA-F12** | `parseShuttleTariff`, 4'ten fazla otomatik toplam içeren tarifeyi reddeder; hata mesajı K17 kuralını anar. 4 sınırı karar kaydındaki `group_total_minor` ile aynıdır (`policy-decisions.test` korur). | `packages/core/src/shuttle.ts` | A12.5 |
| **QA-F8** | Dekont tekrarı, aynı ödeyen için normalize edilmiş banka referansıyla denetlenir (baş/son boşluk, iç boşluklar, büyük/küçük harf). Gösterimde özgün metin kalır. | `service.ts` `addReceipt`, `store.ts` `appendReceipt` | A5.6 |
| **PKG-F05b** | Taban değişmediği hâlde kayıtlı paylar rezervasyonun dondurulmuş politikasından farklıysa sessizce geçilmez. `share_mismatch` istisnası yazılır (durdurmaz; beklenen ve kayıtlı paylar notta). Otomatik düzeltme yapılmaz (H-24). | `packages/core/src/settlement.ts` (`ExceptionReason`, `weeklyReport`), `apps/api/src/report-html.ts` etiketi | `settlement.regression.test` "paket F05" |

## 5. Aday skill'lerin izole değerlendirmesi

**Yer:**
- Paket, oturumun geçici çalışma alanına (scratchpad) açıldı.
- Repo'ya yalnız iki şey yazıldı: karar kaydı ve senaryo dosyaları.
- Aktif org skill'leri ve kurulu dosyalar değişmedi.

**Birleştirme durumu:**

| Aday | Taban | Sonuç |
| -- | -- | -- |
| agos-consortium-settlement | `96ebf0a` blob'u (`451b53a…`, paketle aynı) | **Gerçek üç yönlü deneme:** `git merge-file --diff3` 4 çakışma bloğu verdi. Aday kısa ana metin + `references/` yapısında yeniden yazılmış (35 satır; taban 130, güncel 164). Öneri: adayın yapısı alınır; repo'ya özgü içerik (politika takma adları, test bağlantıları) `references/` altına taşınır. Senaryo tarifleri kopyalanmaz, kimlikleriyle anılır. **Repo'ya uygulanmadı.** |
| agos-weekly-settlement | Yok | Takma ad yönlendiricisi; formül içermiyor ✓. İki yollu inceleme. |
| agos-consortium-policy, agos-tenant-ads-onboarding, agos-ads-budget-control, agos-ads-attribution | Repo'da tabanı yok | İki yollu inceleme. Karar kaydıyla çelişki bulunmadı. |
| 12 mevcut skill eki | Mac kurulu sürümün hash'i (paket envanteri) | Ekler eklemelidir: `INSERTION.md` + `references/consortium-v2.md`. İki yönetilen org skill'inin hash'i bu oturumdakiyle aynı, önkoşul tutuyor. Diğer 10 Mac skill'i bu oturumdan görülemez, hash doğrulaması BLOCKED. |

**Senaryolar tek yerde (tekrar yok):**
- `skills/evals/cases.json`: paketin 72 senaryosu, birebir.
- `skills/evals/cases.repo-ek.json`: çakışmayan 6 senaryo.
- Önceki 22 klasörün eşlemesi:

| Önceki klasör | Paketteki karşılığı |
| -- | -- |
| dort-kisi-shuttle-toplam-ve-paylar | POLICY-01 |
| bes-kisi-otomatik-fiyat-yok | POLICY-04 |
| alanyagroup-satisi-paylari | POLICY-02 |
| kendi-araci-dogrulanmamis-site | POLICY-03 |
| vip-agos-komisyonu-yok | POLICY-05 |
| reklam-gideri-agos-karti | ADS-08, POLICY-10 |
| kismi-tahsilat-t2 | FINANCE-01, FINANCE-02 |
| fazla-tahsilat-iade | FINANCE-04 |
| kapanmis-haftada-iade | FINANCE-06, FINANCE-12 |
| yazili-onaysiz-mahsup | FINANCE-07 |
| yedi-gun-sonra-itiraz | FINANCE-17 |
| iki-adimsiz-finans-onayi | SECURITY-01, SECURITY-06 |
| partner-icin-reklam-hesabi-ac | ADS-02, ADS-03 |
| rizasiz-capi-olayi | MEASUREMENT-02 |
| yazar-kendi-isini-kabul-etmez | RELEASE-07 |
| pr-merge-ve-canli | RELEASE-01 |
| yapistirilmis-owner-karari, ayt-gzp-hat-talebi, manuel-fiyat-bir-cent, b2b-dagitici-orani, hafta-siniri-istanbul, capraz-kiraci-ekstre | Ek dosyaya taşındı: POLICY-13, POLICY-14, POLICY-15, POLICY-16, FINANCE-19, SECURITY-11 |

**Testler: iki ayrı rapor.**

*(a) Referans hesaplama testleri (deterministik; gerçek ajan değil). Bu oturumda koşuldu, paket klasörüne bir şey yazılmadı:*

| Komut | Sonuç |
| -- | -- |
| `python3 -I -B scripts/validate_pack.py --verify-manifest` | PASS (6 skill, 12 ek, 72 senaryo, manifest doğrulandı, 0 ajan koşusu) |
| `python3 -I -B -m unittest discover -s tests` | 72/72 OK (Python 3.13.18) |
| `node --test evidence/baseline-v1/tests/consortium.test.mjs` | 29/29 (eski V1 davranışı; yeni kurala uyum kanıtı değil) |
| `node scripts/reproduce_findings.mjs` | 6 dar bulgu yeniden üretildi (F01–F06) |

*(b) Gerçek ajan davranış testleri:* **NOT_RUN.** 78 senaryonun hiçbiri bir ajanla koşulmadı.
- **Gerekenler:** sahte araçlar, eski ve yeni skill hash'i, aynı model ve araç seti, senaryo başına en az 3 koşu, iz kaydı.
- **Engeller:** bütçe onayı (H-14) ve insan inceleyicinin yazarın görmediği gizli set eklemesi.

## 6. Paralel ve ayrı işler

- **SEL-324/326 (Hermes güvenliği):** paralel yürür. G0 HOLD canlı Hermes, gateway ve yayın içindir; yerel ürün geliştirmesini durdurmaz. Paket-01 ve Paket-02 yerelde ilerler.
- **Staging erişimi (SEL-329), ayrı doğrulanacak:**
  - kimin yetki verdiği
  - salt okunur şema dökümü
  - gerçek müşteri verisi olmadan sentetik kayıt
  - kimlik bilgilerinin kapsamı ve süresi
  - geri alma

  Bu doğrulanmadan Paket-03 (CRS eşlemesi ve DB kısıtları) başlamaz.

## 7. Rapor

**Değişen dosyalar (bu tur):**
- **Test bağlama** (commit `6f70cd6`):
  - `package.json` (typecheck ve test desenleri)
  - `qa-independent/*.test.ts` (24 `todo` işareti)
  - `qa-independent/README.md`
  - `packages/core/src/settlement.regression.test.ts` (paket karşıörnekleri)
  - `packages/core/src/policy-decisions.test.ts` (yeni)
  - `packages/db/src/schema-probes.test.ts` (yeni)
  - `config/policy-decisions.json` (yeni, birebir)
- **Bu belge commit'i:**
  - `docs/konsey/TEK-KARAR-SKILL-ESLEMESI.md` (yeni)
  - bu dosya
  - `docs/konsey/B`, `D`, `H`, `README`
  - `skills/evals/cases.json`, `skills/evals/cases.repo-ek.json`
  - 22 eski senaryo klasörü kaldırıldı
- **Uygulama kodu değişmedi.**

**Gerçekten koşulan testler:**
- `npm run check`: tsc temiz; 184 test, 157 geçti, **0 kaldı**, 27 todo; DB paketi atlandı (geçti sayılmadı).
- `AG_TEST_PG=1` (PostgreSQL 16.15, yerel atılabilir küme): 38 test, 2 geçti, 0 kaldı, 36 todo.
  - P1–P16 ve C01–C05 reddedildi.
  - Q01–Q35 kabul edildi (QA-F4).
  - p1 oturumu p2'nin 2 defter satırını görüyor (QA-F3).
  - Mahsup kaydında aktör/2FA sütunu 0.
- Paket referans testleri: §5 (a).
- Ajan davranış testi: NOT_RUN.

**Kalan engeller:**
- İnsan bağımsız inceleyici (H-1)
- Kimlik sağlayıcı ve 2FA (SEL-332)
- Staging erişimi (SEL-329)
- Ajan değerlendirme bütçesi (H-14)
- Owner kararları: H-8, H-20…H-24, K17 sınırları, K8 kapsamı, pro-rata, Salı 18:00
- Resmî reklam sayfaları bu oturumda engelli
- 10 Mac skill'inin hash doğrulaması bu oturumdan yapılamıyor

**Sıradaki tek iş:** Codex Paket-01'i (§4) uygular, her kalem ayrı commit. Claude her commit'i inceler.

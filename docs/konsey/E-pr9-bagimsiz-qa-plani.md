# E · PR #9 bağımsız QA planı ve yeniden değerlendirme

**Önemli:**
- PR #9'un kodunu bu oturum (Claude) yazdı. Bu yüzden §2'deki tablo **yazarın öz değerlendirmesidir**, bağımsız değerlendirme değildir.
- §3 ayrı bir AI ajanın saldırgan okumasıdır: benim sonuçlarımı görmeden, aynı commit üzerinde, kendi testleriyle.
- **İkisi de insan bağımsız kabulünün yerine geçmez.** `INDEPENDENT_ACCEPTED=NO`.

## 1. Yazarın yeniden koşumu (kanıt)

| Öğe | Değer |
| -- | -- |
| Sabitlenen commit | `c0b3175313082589449fd497d3fa572b3c7acc36` (temiz, ayrı checkout; çalışma ağacı değişikliği 0) |
| Sonraki commit | `96ebf0a`: yalnız belge değişikliği (`docs/KARARLAR-VE-CELISKILER.md`, `docs/MIMARI.md`); kod aynı |
| Ortam | Node v22.23.4 · PostgreSQL 16.15 |
| `npm run check` | çıkış 0 · tip kontrolü temiz · **78/78** (core 23, settlement 21, api 23, ssg 11) |
| `npm run report:sample` | çıkış 0 · W45: 9 fark kaydı, 3 istisna, 1 açık müşteri borcu, 5 borç/ihtilaf · W46: −5000 iade düzeltmesi, +2000 tahsilat |
| Rapor tekrarlanabilirliği | Yeniden üretilen `docs/ornek-hafta-2026-W45.html/.json` commit'teki dosyayla **byte düzeyinde aynı** |
| Migration | `0001_network_core.sql` SHA-256 `bd14b6c6…25e1` · temiz kümede çıkış 0 |
| Negatif problar | `0001_probes.sql` SHA-256 `85a9dbad…031f` · **16/16 reddedildi**, olumlu durumlar geçti. **Sınır:** problar ağırlıkla `booking` özet tablosunu kapsıyor; 03.11'de eklenen defter tablolarının kuralları denenmemişti (bkz. §3 F4). |

## 2. Owner'ın 12 alanı: yazar öz değerlendirmesi

> Bu tablo bağımsız okumadan **önce** yazıldı ve kayıt olarak değiştirilmeden bırakıldı. §3 onu 10 alanda düzeltiyor. Ana yollar doğruydu; kenar durumları yazar göremedi.

Etiketler:
- **PASS:** test veya probla gösterildi.
- **FAIL:** kurala aykırı.
- **NOT TESTED:** test yok ya da özellik yok.

| # | Alan | Sonuç | Kanıt / açıklama |
| -- | -- | -- | -- |
| 1 | Komisyonların çift hesaplanması | **PASS** (yerel) · eşzamanlılık **NOT TESTED** | Kümülatif fark modeli: `settlement.test` "partial collections never drift"; `api.test` "next week … +4/+2/+14 … W45 is unchanged", "closes once". DB: rezervasyon+hafta tekil (P7). Gerçek veritabanında eşzamanlı kapanış test edilmedi; PostgreSQL bağdaştırıcısı yok. |
| 2 | Kısmi tahsilat | **PASS** | `settlement.test` T2 bloğu (Owner örneği 6/3/21 → 4/2/14, tahsil edilmeyen ödenmez, tamamlanmadan pay yok); `api.test` "collection rules", "QA 1" (kapanıştan sonra giren tahsilat) |
| 3 | İadeler ve mahsup | **PASS** | `settlement.test` T1 bloğu; `api.test` "a refund recalculates…", "T1: an offset … needs a written approval reference and 2FA"; DB P2 (iade azaltılamaz), P16 (iade ≤ tahsilat), P13 (yazılı onaysız mahsup) |
| 4 | Haftalık kapanış | **PASS** (yerel) · eşzamanlılık **NOT TESTED** | `api.test` "refuses to close before Sunday 23:59…; then closes once", sıra dışı kapanış reddi (`close_weeks_in_order`); `settlement.test` hafta sınırları ve 53. hafta |
| 5 | Aynı rezervasyonun tekrar kaydı | **PASS** | `api.test` "is idempotent", "rejects a missing idempotency key", "QA 2" (mükerrer şüphesi), "each slip once", "rejects a duplicate receipt"; DB P4 |
| 6 | Farklı sitelerin birbirinin verisine erişmesi | Müşteri sorgusu **PASS** · partner/tenant erişimi **NOT TESTED** | `api.test` "look up a booking only with its token". **Partner girişi ve kiracı kapsamlı yetki yok.** Admin API tek, global, statik bir anahtar; her kiracıyı görür. Çok kiracılı izolasyon bu commit'te uygulanmadı. |
| 7 | Yetkisiz fiyat değişikliği | **PASS** | `api.test` "prices shuttle on the server, ignores client prices", K17 testleri, "new tariff version does not change the price frozen…"; DB: kapanmış işin tutarları donuk |
| 8 | 2FA olmadan finansal onay | Fiyat onayı / itiraz kararı / mahsup **PASS** · diğer admin işlemleri **FAIL (hedef kurala göre)** | 2FA isteyen üç işlem testli. Ancak **haftalık kapanış, iade, tahsilat ve dekont girişi aktör ve 2FA istemiyor** (statik anahtarla yapılabiliyor). SEL-332 hedefi "2FA'sız admin hiçbir işlem yapamaz" ile çelişir. Bugün yalnız yerelde mümkün; üretim kapısı statik anahtarı reddediyor. F4'te düzeltilmeli. |
| 9 | Reklam hesaplarının tenant izolasyonu | **NOT TESTED** | Reklam modülü bu commit'te yok |
| 10 | Yanlış siteye reklam gideri veya komisyon yazılması | Reklam **NOT TESTED** · komisyon atfı **kısmen** | Site `siteId` + `Origin` (sitenin kendi https domaini) ile bağlanıyor; kayıtsız origin reddediliyor (`api.test`). Ancak `Origin` başlığı tarayıcı dışından taklit edilebilir. Kimin müşteriyi getirdiğini kanıtlayan bir atıf (imzalı oturum, tıklama kimliği) yok; test yok. |
| 11 | Private/VIP kısmi tahsilat | **PASS** (aday kural) | `settlement.test` "private/VIP partial collection (candidate rule)…pro rata"; `api.test` pass akışları. Hak edişin satışı aşması kodda reddediliyor ama bunun için ayrı test yok. |
| 12 | 5+ yolcu fiyat sınırları | **PASS** | `settlement.test` "refuses 0.01 €, out-of-bound and unapproved-bound prices", "never reactivate the old 80 €"; `api.test` K17 testleri |

**Yazarın kendi bulguları (düzeltilmedi, Faz 1'de kod değişikliği yok):**
1. Alan 8: 2FA'sız admin işlemleri (yukarıda).
2. Alan 6 ve 9: tenant kapsamlı yetki yok.
3. Alan 10: atıf kanıtı yok.
4. Alan 1 ve 4: gerçek veritabanında eşzamanlılık test edilmedi.

## 3. AI bağımsız saldırgan okuma (ayrı ajan, yazarın sonuçlarını görmeden)

**Ajanın yaptıkları:**
- Sabitlenmiş commit `c0b3175` üzerinde ayrı bir worktree'de çalıştı.
- Mevcut testleri koştu: 78/78.
- Kendi 83 testini yazdı: **56 geçti, 27 `[RULE]` testi kaldı**.
- 34 SQL negatif probu yazdı: **hiçbiri reddedilmedi**. 5 kontrol probu reddedildi; bu, düzeneğin reddi doğru ayırt ettiğini gösterir.
- Testler ve problar repo'da: [`qa-independent/`](../../qa-independent/).

**Ana oturumun doğrulaması:**
- Testleri ana checkout'ta yeniden koştum: aynı sonuç, 83 / 56 / 27.
- F4'ü kendi temiz veritabanımda tekrarladım: 34 prob kabul edildi, yalnız 5 kontrol reddedildi.
- F1, F2, F5, F7, F12 ve F13'ü test çıktısından veya koddan ayrıca teyit ettim.
- F5 committed örnek raporda da görülüyor: tamamen iade edilmiş `AG-Q3ES5G` W46'da "müşteri 50 € borçlu" listesinde.

### 3.1 Alan bazında sonuç

| # | Alan | Yazar (§2) | Ayrı AI ajanı | Bulgular |
| -- | -- | -- | -- | -- |
| 1 | Çift sayım | PASS | **FAIL** | F7, F2; DB'de fark kaydı zinciri yok (F4) |
| 2 | Kısmi tahsilat | PASS | **FAIL** | F1, F14 |
| 3 | İade ve mahsup | PASS | **FAIL** | F2, F5, F6 |
| 4 | Haftalık kapanış | PASS | **FAIL** | F7. Geçenler: 6 eşzamanlı istekte tek kapanış, hafta sınırları, 53. hafta, dondurulmuş görüntü, süre dışı itirazın otomatik reddedilmemesi |
| 5 | Mükerrer kayıt | PASS | **FAIL** | F8, F9. Geçenler: idempotency, 8 eşzamanlı istekte tek rezervasyon |
| 6 | Siteler arası erişim | NOT TESTED | **FAIL** | F3 |
| 7 | Yetkisiz fiyat değişikliği | PASS | **FAIL (yalnız DB)** | Kod ve API geçti; DB'de hesaplanmış işin fiyatı değiştirilebiliyor (F4) |
| 8 | 2FA'sız finansal onay | FAIL | **FAIL** | F10 |
| 9 | Reklam hesabı izolasyonu | NOT TESTED | NOT TESTED | Modül yok |
| 10 | Yanlış siteye kredi | NOT TESTED | **FAIL** | F11 ve düşük bulgular |
| 11 | Private/VIP kısmi tahsilat | PASS | **FAIL (yalnız DB)** | Kod ve API geçti; DB'de private satıra AGOS payı ve satıştan büyük hak ediş yazılabiliyor (F4) |
| 12 | 5+ fiyat sınırları | PASS | **FAIL** | F12; alt sınır 0,01 € onaylanmışsa 0,01 € fiyat geçiyor |
| Ek | Canlı kapı ve ödeme | — | **FAIL (kısmen)** | F13. Geçenler: onaylı her bayrakla bile üretim reddi; ödeme, banka veya payout istemcisi yok |

### 3.2 Bulgular

**Yüksek:**
- **F1 · Atanmış sefere sonradan katılan rezervasyon hiç hesaplanmıyor.**
  - Havuz yeni rezervasyonu atanmış sefere de koyuyor (`pool.ts`), ama tedarikçi yalnız atama anındaki rezervasyonlara yazılıyor (`assignRun`).
  - Tahsilat `supplier_not_assigned` ile reddediliyor; iş yine de teslim edilmiş sayılıyor.
  - Hiçbir raporda görünmüyor; site %20 ve AGOS %10 sessizce kayboluyor.
- **F2 · Aynı mahsup iki kez kaydediliyor.** Aynı `adjustment_reference` ile iki istek de 201 dönüyor; borç iki katına çıkıyor.
- **F3 · Kiracı (site) bazında yetki yok.**
  - Global statik anahtar her sitenin rezervasyonunu ve ekstresini görüyor, başka sitenin rezervasyonunu iptal edebiliyor.
  - DB'de RLS yalnız `booking` SELECT için var ve zorunlu değil (FORCE yok); defter tablolarında RLS yok.
- **F4 · DB şema adayı defter tablolarında iş kurallarını uygulamıyor.** 34 ihlalin hepsi kabul edildi, örneğin:
  - aynı tabana ikinci fark kaydı
  - kapanmış haftaya kayıt
  - bitmemiş ya da sıra dışı hafta kapanışı
  - shuttle'da sitenin tahsilatı
  - tahsilatsız iade
  - boş yazılı onaylı mahsup
  - 0,01 € manuel fiyat
  - tarifede 5 kişi 80 €
  - AYT-GZP ve pasif hatta rezervasyon
  - fiyatın kapanıştan sonra değişmesi
  - private'ta AGOS payı

  Tetikleyiciler yalnız `booking` özet satırını ve "yalnız ekleme" kuralını koruyor. K15 raporundaki bazı "kod + DB" ifadeleri bu yüzden fazla iddialıydı; raporda düzeltme notu var.

**Orta:**
- **F5:** müşteriye iade edilen tutar "müşteri borcu" olarak listeleniyor.
- **F6:** aynı haftada iade düzeltmesi ile yeni komisyon tek kalemde netleşiyor. Bunun yazılı onaysız mahsup sayılıp sayılmayacağı Owner kararı (H-19).
- **F7:** hiç hafta kapanmamışken ilk kapanış önceki haftayı atlayabiliyor; aynı tutar iki raporda görünüyor.
- **F8:** dekont mükerrer kontrolü büyük/küçük harfe duyarlı.
- **F9:** aynı tedarikçinin aynı makbuzu iki rezervasyona yazılabiliyor.
- **F10:** rezervasyon itirazını çözmek ve mükerrer işaretini kaldırmak 2FA, gerekçe ve aktör kaydı istemiyor. Ayrıca "haklı" ve "haksız" itiraz sonucu aynı hesaplanıyor (H-21).
- **F11:** satış atfı taklit edilebilir `Origin` başlığına dayanıyor; Turnstile yanıtında alan adı karşılaştırılmıyor.
- **F12:** tarifeye 5. eleman eklenirse 5 kişi otomatik 80 € fiyatlanıyor; parser bunu reddetmiyor.
- **F13:** canlı kapı yalnız `NODE_ENV` tam olarak "production" ise devreye giriyor. `prod` veya `Production` ile korumasız sunucu açılıyor.
- **F14:** tahsil edilmiş ama tamamlanmamış iş hiçbir ekstrede görünmüyor.

**Düşük:**
- açık iki haftanın önizlemesinde aynı fark tekrar görünüyor
- ilk kapanışta 2020-W01 kabul ediliyor
- yazılı onay referansı olarak "---" kabul ediliyor
- 7 günün tam 168 saat sayılması (H-20)
- lookup jetonu idempotency kaydında düz metin
- gelecek tarihli kendi aracı doğrulaması bugün geçerli sayılıyor
- yerel geliştirme origin'i her site adına rezervasyon açabiliyor
- K15 raporundaki bazı istisna adları kodda üretilmiyor

### 3.3 W45 satır satır mutabakat (ajan, bağımsız aritmetik)

- Dokuz satırın hepsi kurala uygun.
- Toplam: 490 € = tedarikçi 344,50 + site 104,50 + AGOS 41.
- Oranlar %70,3 / %21,3 / %8,4; global 70/20/10'a uymaması doğru:
  - bir satır kendi aracıdır (0/10/90),
  - bir satır private'tır (AGOS 0).
- Hesaba girmeyenler doğru: itirazlı iş bloklu, iptal tahsilatsız.
- **Hata:** W46'da iade edilmiş iş müşteri borcu görünüyor (F5).
- **Not:** 6 kişilik 90 € satırı örnek betikte servise doğrudan verilen 2FA'lı sahte aktörle onaylanıyor. HTTP API bugün bu satırı üretemez.

### 3.4 Sonuç ve sonraki adım

- Yazarın öz değerlendirmesi ana yolları doğru gösterdi, ama 10 alanda kenar durumları kaçırdı. Yazar ile inceleyiciyi ayırmanın değeri tam olarak bu.
- **Faz 1'de kod değişikliği yapılmadı.**
- Önerilen sıra:
  1. Owner mutabakatı.
  2. Düzeltme turu Codex'te (H-5). Claude şartname ve akran incelemesi yapar.
  3. Kabul ölçütü: `qa-independent` testlerindeki tüm `[RULE]` testlerinin yeşile dönmesi + yeni DB kısıtları + PostgreSQL'de eşzamanlılık testleri.
  4. Son olarak insan bağımsız inceleyici.
- Owner kararı isteyen dört nokta H-19…H-22'de.

## 4. İnsan bağımsız inceleyici için QA planı

**Kapsam:** SEL-163 ve Owner'ın PR #9 yorumu. **Yöntem:** inceleyici kendi testlerini yazar; yazarın testleri yalnız başlangıç noktasıdır.

1. **Sabitleme.**
   - `git checkout --detach c0b3175…`
   - `git rev-parse HEAD`, `node --version` ve `postgres --version` kaydedilir.
   - Ayrı bir makine veya kullanıcı tercih edilir.
2. **Tekrar.**
   - `npm run check` ve `npm run report:sample` çalıştırılır.
   - Temiz PostgreSQL 16 kümesinde migration ve `0001_probes.sql` çalıştırılır.
   - Çıkış kodları ve SHA-256'lar kaydedilir.
3. **Hesap ayrıştırması.**
   - W45 toplamı (490 € = 344,50 + 104,50 + 41) **satır satır** açıklanır.
   - Karışık hizmet (shuttle, private) ve kendi aracı satırları ayrı kuraldır; tek bir 70/20/10 oranı varsayılmaz.
4. **Saldırgan testler** (her biri PASS / FAIL / NOT TESTED):
   - çok sayıda kısmi tahsilat
   - tahsilat ile tamamlanma sırası
   - hafta sınırı (Pazar 23:59:59 / Pazartesi 00:00 İstanbul)
   - eksik veya mükerrer dekont
   - başka rezervasyonun referansıyla tahsilat
   - eşzamanlı kapanış
   - negatif hareket
   - kuruş yuvarlaması
   - iade > tahsilat
   - kapanmış haftanın değiştirilmesi
   - 7 gün sonrası itiraz
   - 2FA'sız ve sahte aktörle onay
   - sınırı olmayan hatta 5+ fiyat
   - 0,01 €
   - pasif hat
   - AYT-GZP (kod, API, şema)
   - doğrulanmamış sitenin kendi aracı
   - sahte `selling_site_id` ve sahte `Origin`
   - başka kiracının komisyonunu talep etme
5. **Kapsam dışı kalanlar:** reklam modülü, partner girişi ve gerçek CRS bağdaştırıcısı bu commit'te yok. Bunlar NOT TESTED olarak listelenir ve kabul kapsamına girmez.
6. **Skill karşılaştırması.** `agos-consortium-settlement` (repo), kurulu `agos-pricing-matrix` ve `agos-pool-finance`, SEL-456 adayları arasında üç yönlü fark kanıtı istenir (A §7).
7. **Karar.**
   - Çıktı: `INDEPENDENT_ACCEPTED=YES/NO` + kanıt ve SHA'lar + FAIL listesi + geri dönüş notu.
   - Rapor SEL-163 ve PR #9'a yazılır; sonra ikinci Owner kapısı.

**Kabulün anlamı:** YES yalnız "bu commit, yerel aday olarak, iş kurallarını doğru uyguluyor" demektir. Canlıya geçişin diğer 7 koşulu ayrıca gerekir.

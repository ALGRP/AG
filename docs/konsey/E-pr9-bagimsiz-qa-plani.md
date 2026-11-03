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
| Negatif problar | `0001_probes.sql` SHA-256 `85a9dbad…031f` · **16/16 reddedildi**, olumlu durumlar geçti |

## 2. Owner'ın 12 alanı: yazar öz değerlendirmesi

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

*Sonuç bekleniyor; ajan raporunu tamamlayınca bu bölüm doldurulacak.*

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

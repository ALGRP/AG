# Kararlar, çelişkiler ve açık noktalar · 03.11.2026

> **EN SON — OWNER KARAR TASLAĞI 03.11.2026 (T1 / T2 / T3 / K17 / K8 / K1 / canlıya geçiş): TASLAK, Owner kabulü bekliyor.** Bu PR'da yalnız **yerel aday** olarak uygulandı; canlı rezervasyon, ödeme veya reklam sisteminde değişiklik yok. Ayrıntı ve çelişkiler: [aşağıda "03.11 karar taslağı"](#0311-owner-karar-taslağı--çelişki-tablosu).
>
> **K15 OWNER KARARI — SUPPLIER COLLECTION + WEEKLY SETTLEMENT (KESİN TİCARİ KARAR):** Shuttle'da müşteri ödemesini **tedarikçi** tahsil eder. Satış kanalı %20, AGOS %10, tedarikçi %70; **alanyagroup.com dahil bütün siteler aynı kurala** tabidir. Site kendi aracıyla yaparsa %90 kendisinde, %10 AGOS; kendine komisyon oluşmaz. Hesap dönemi Pzt 00:00 – Paz 23:59 İstanbul; önerilen ödeme son tarihi Salı 18:00. Private/VIP'de sabit komisyon yok; hak edişi site belirler; AGOS ek komisyon almaz. Gerçek müşteri verisi, canlı ödeme, banka transferi, otomatik borç tahsilatı ve canlı rezervasyon değişikliği **ayrıca Owner GO** ister; fatura, vergi, yasal taşıma/acentacılık yetkisi ve tahsilatın hukuki sorumlusu mali müşavir ve hukuk incelemesine tabidir.
>
> Bu karar önceki K4 önerisini (AG sitesi 90/10), K12'deki sabit pass modelini ve K15 önerisindeki "online tahsilat merkezden" kuralını **geçersiz kılar** (aşağıda "PR denetimi — K15 kesin karar").
>
> **Önceki paket (03.11.2026, K4 / K8 / K12 / K15 / K17):** Shuttle fiyatı ve 70/20/10 KESİN; K8 öneri olarak geçerli; K17 manuel fiyat.
>
> **Önceki karar (03.11.2026, shuttle fiyat ve komisyon):** Fiyat rezervasyon toplamıdır (1 kişi 30 €, 2 kişi 50 €, 3 kişi 60 €, 4 kişi 70 €). Satış tutarının %70'i tedarikçiye, %20'si uydu siteye, %10'u Alanya Group'a gider. 35 € kişi başı varsayımı iptal. Tek fiyat kaynağı. **Canlıya geçiş ayrıca onaya tabidir.**
>
> **Güncelleme (03.11, Konsorsiyum Partner Sunumu V3):** K2 netleşti. Sunum özel/VIP modelini değiştiriyor (K12); sunumun shuttle rakamları geçersiz (K18).

Bu belge, Owner'ın 03.11.2026 tarihli talebini Linear'daki mevcut kararlarla karşılaştırır. Kural: yeni karar eskisini otomatik silmez. Çelişki **ÇELİŞKİ** olarak kaydedilir ve Owner kararını bekler. Koddaki varsayılanlar yalnız yerel adaydır.

| # | Konu | Linear'daki durum | 03.11 talebi | Koddaki varsayılan | Karar gerekiyor mu? |
| -- | -- | -- | -- | -- | -- |
| K1 | Web teknolojisi | ADR-WEB-001: beş domain için Next.js + TypeScript, kademeli geçiş; Glass pilotu (Next.js 16) | Uydu siteler statik HTML + SSG | Bağımlılıksız TypeScript SSG (`@ag/ssg`) yalnız **partner uydu siteleri** için. Kendi beş domainimiz ADR-WEB-001'de kalır | **Taslak K1 (03.11): hedef Next.js + TypeScript** (SSG + gerektiğinde SSR). `@ag/ssg` ara aday; canlı siteler hemen değişmez (Ç25) |
| K2 | Site ücreti | SEL-222'de "€100 Growth Pro" taslağı; ayrıca "partner ücretsiz katılır" kararı | **Sunum V3: 200 €/ay SaaS aboneliği**, uydu site sahibi Alanya Group'a öder. Google Ads (40 €/gün) partnerin kendi gideridir, AG cirosu değildir. Site başı iç maliyet varsayımı 40 € | `subscription_plan` = 20000 cent/ay, `site_cost_minor` = 4000; reklam bütçesi sistemde AG geliri olarak tutulmaz | **NETLEŞTİ** (sunum taslak). "Ücretsiz katılım" kararının kalktığı Linear'a işlenmeli |
| K3 | Shuttle gelir paylaşımı | White-label SaaS v1: shuttle merkezin ürünüdür, üyeye %20. Sürücü havuzu v1.1: %70 sürücü / %30 AGOS | **OWNER KARARI 03.11:** her shuttle rezervasyonunda **satış tutarının** %70'i transferi yapan tedarikçiye, %20'si uydu siteye, %10'u Alanya Group'a | `shuttle-split-v1` = 7000/2000/1000 baz puan, satış tutarı üzerinden; her pay ayrı defter satırı. Örnekler testli: 30 → 21/6/3, 50 → 35/10/5, 60 → 42/12/6, 70 → 49/14/7 | **KARAR.** KDV'nin faturada nasıl gösterileceği mali müşavir konusudur, paylaşım kuralını değiştirmez |
| K4 | AG'nin kendi sitesinden gelen shuttle | 03.11 öneri: %90 tedarikçi / %10 AG | **K15 KESİN KARAR:** alanyagroup.com da satış kanalıdır: %20 site (Alanya Group) / %10 AGOS / %70 tedarikçi | Aynı `shuttle-split-v1`; AG sitesinin payı `alanya-group` tarafına yazılır. Eski `shuttle-direct-v1` politikası kaldırıldı | **KARAR** (önceki öneri geçersiz) |
| K5 | Özel transfer bildirimi | Her bildirim tek bir outbox olayından doğar (tasarım değişmezi 6) | "Doğrudan site sahibinin e-postasına" | Outbox olayı (`private.request_received.notify_site_owner`) üzerinden n8n ile anında gönderilir; form doğrudan e-posta atmaz | Hayır. Değişmezle uyumlu yorum |
| K6 | WhatsApp numarası | D-WA-20261102-01: dört AG uydu sitesi tek hattı paylaşır, site başına ayrı numara açılmaz | Her sitenin kendi WhatsApp numarası | `site.json` → `contact.whatsapp`. AG markalı sitelerde ortak hat yazılır, partner sitelerinde partnerin kendi numarası | Uyumlu: tek hat kuralı AG markalarına, ayrı numara partner sitelerine uygulanır. Teyit önerilir |
| K7 | Shuttle kapasitesi | En fazla 10 kişi; ana sitedeki "11" ifadesiyle fark açık (SEL-245/327) | — | Araç kapasitesi 10, grup üst sınırı tarifede 10 | Araç ruhsatı / koltuk teyidi |
| K8 | Shuttle hatları ve tarihleri | 4 hat, kodlar AYT-ALANYA vb. | **ÖNERİ (03.11):** AYT↔Alanya, AYT↔Side, AYT↔Belek, AYT↔Kemer, AYT↔Konyaaltı, GZP↔Alanya Merkez (pilot). Her yön ayrı kod. **AYT↔GZP açılmaz.** Başlangıç yayın tarihine bağlı; geçmiş fiyat değişmez | Kodlar: `AYT-ALN/ALN-AYT`, `AYT-SID/SID-AYT`, `AYT-BLK/BLK-AYT`, `AYT-KMR/KMR-AYT`, `AYT-KNY/KNY-AYT`, `GZP-ALN/ALN-GZP` (pilot). AYT-GZP/GZP-AYT kod, şema ve veritabanında reddedilir. `validFrom ≥ publishedAt`. Tarife `approval: proposed`; üretim modunda API onaysız tarifeyle **açılmaz**. Rezervasyondaki fiyat dondurulur (testli) | **Owner onayı:** hat listesi, kodlar, başlangıç tarihi. Soru: kararınızdaki 30/50/60/70 € Kemer ve Konyaaltı dahil tüm hatlarda aynı mı? (Kodda şimdilik aynı) |
| K9 | Yönetim girişi | Kimlik sağlayıcı AÇIK; admin için 2FA zorunlu (SEL-332) | — | Geçici `AG_ADMIN_TOKEN`; tanımlı değilse admin uçları kapalı | Kimlik sağlayıcı seçimi |
| K10 | Rezervasyon veritabanı | Tek kaynak CRS PostgreSQL (`agos-reservation-postgres`); yeni rezervasyon deposu açılmaz | — | `MemoryStore` (yalnız yerel). `0001_network_core.sql` bir eşleme ADAYIDIR, uygulanmaz | Hayır. G1 sonrası SEL-331 eşlemesi |
| K11 | Yorumlar | Uydurma `aggregateRating`/`Review` yasak | Her sitede yorum paneli | Yalnız `verified: true` yorumlar gösterilir; yorum şeması yok; örnek sitede yorum yok (`[]`) | Hayır |
| K12 | Özel/VIP operasyonu | Önceki öneri: sabit pass (47,50 € / 60 €), Model A/B site ayarı | **K15 KESİN KARAR:** sabit komisyon yok; site her iş için kendi aracı / tedarikçiye pass / havuz seçer; **tedarikçi hak edişini site belirler**; müşteri tedarikçiye öderse tedarikçi (satış − hak ediş) farkını siteye aktarır; AGOS ek komisyon yok | Atama her rezervasyonda: `self` (yalnız yetkisi doğrulanmış site), `pass` (hak ediş girilir, satıştan büyük olamaz). Müşteri siteye öderse site → tedarikçi hak edişi. `pool` bu sürümde yok (501). Sabit pass politikası kaldırıldı | **KARAR.** Havuz modu (şoför teklif akışı) ayrı iş |
| K13 | Shuttle fiyat birimi | Grup toplamı: 1 kişi 30 €, 2 kişi 50 €, 3 kişi 60 €, +10 €/kişi | Sunum: kişi başı 35 € bilet. **OWNER KARARI 03.11:** 1 kişi 30 €, 2 kişi 50 €, 3 kişi 60 €, 4 kişi 70 € **rezervasyon toplamı**; 35 € **iptal**; tek fiyat kaynağı | Tarife: `[3000, 5000, 6000, 7000]`, kişi başı ek ücret alanı **kaldırıldı** (eski yapılandırma reddedilir). Sitelerdeki fiyat tablosu aynı tarifeden üretilir; sayfa metninde elle yazılmış fiyat varsa site derlenmez | **KARAR** |
| K14 | Araç hak edişi | Şoför teklifi × 1,30 (pool-finance); white-label: araç neti ayrı alan | Shuttle: **OWNER KARARI 03.11: %70 tedarikçi.** Özel/VIP: sunum "sözleşmeye göre" | Shuttle: %70 sabit. Özel/VIP (pass): hak ediş tamamlamada girilir, pass'ı aşamaz | Shuttle **KARAR**. Özel/VIP hâlâ açık (K12 ile birlikte) |
| K15 | Tahsilat ve haftalık kapanış | Önceki öneri: online kart merkezden | **KESİN KARAR:** tahsilatı tedarikçi yapar; haftalık kapanış; 20 alan; 10 kural | `settlement.ts` + DB. Tahsilat rezervasyon başına **bir kez** (kod + DB trigger); shuttle'da yalnız tedarikçi (kod + DB CHECK); kapanış hafta bitince ve **bir kez**; bir iş **tek haftaya** girer, sonra tutarları dondurulur (DB trigger); iade/düzeltme yeni haftaya ters hareket (eski hafta değişmez); dekont eşleştirme, eksik/geciken ödeme, fazla ödeme, eşleşmeyen dekont listeleri; SaaS ayrı. **Ödeme/borç tahsilatı yürüten kod yok** (`payout_execution` sabit) | **KARAR.** Hukuk/mali müşavir: tahsilatın hukuki sorumlusu, fatura, vergi |
| K16 | Sunumdaki iddialar | AGNET-SEO / yönetişim: doğrulanmamış iddia yazılmaz | Slayt 4–5: deneyim, otel/acenta bağlantıları, referanslar | Sistemde yok | Sunumun kendisi "pilot görüşmesinde yazılı doğrulanır" diyor. Dış paylaşımdan önce belge eklenmeli |
| K17 | 5+ kişilik shuttle | Tanımsız | **Mevcut karar (03.11):** manuel teklif/onay; kesinleşmeden müşteriye nihai ücret, tedarikçiye kesin hak ediş gösterilmez | Otomatik fiyat yok. Fiyatsız rezervasyon onaylanamaz, tahsilat alınamaz (`price_not_set`), pay doğmaz. Fiyat `approve-price` ile bir kez onaylanır | **Taslak K17:** hat bazında min/max sınır, 2FA, denetim kaydı (yukarıda). Sayısal sınırlar bekleniyor |
| K18 | Partner sunumu düzeltmeleri | Sunum V3 | **KARAR (03.11):** dış sunumda AG iç SaaS kâr projeksiyonu yok; 35 € / 7 € / 200 bilet kaldırılır; 1–4 kişilik tarife kullanılır; risk ve zarar ihtimali açıkça yazılır; temkinli hesaplar garanti değildir; doğrulanmamış otel/acenta/entegrasyon/pazar liderliği iddiası başarı gibi sunulmaz | Sistemde sunum yok. `economics.ts` içindeki `centreMonth` **yalnız iç kullanım** olarak işaretlendi. Doğru yeni rakam: 2 kişilik 50 € → siteye 10 €; 1.400 €'yu yalnız bununla karşılamak için **ayda 140 rezervasyon** (testli) | Sunumda değişecek slaytlar aşağıda, "PR denetimi" bölümünde |
| K19 | AG'nin kendi sitesinden satılan özel/VIP | Önceki: satıcı marjı | **K15:** alanyagroup.com da site gibi davranır | (satış − hak ediş) `alanya-group` site payı olarak yazılır | **KARAR** (K15 ile kapandı) |
| K20 | İade ve düzeltmeler | Önceki: payı yazılmış işte her iade tüm payları geri alıyordu | **K15 kural 8:** eski hafta silinmez, düzeltme hareketi | Kapanmamış iş → istisna listesi. Kapanmış shuttle → iade tutarı **aynı 20/10/70 ile** bölünüp yeni haftaya ters hareket (kısmi iade dahil). Kapanmış private/VIP → `finance.manual_adjustment_required` (hak edişi site belirlediği için otomatik bölünmez) | **Taslak T1 ile kapandı** (Ç23); private/VIP orantı açık |
| K21 | Ödeme son tarihi | — | Salı 18:00 "önerilen" | Rapor son tarihi hesaplar; geçince `late` / "Geciken ödeme" | **EVET:** son tarih kesinleşsin mi; gecikmede yaptırım (yeni iş kısıtı vb.)? |
| K22 | Tedarikçinin tahsil edemediği / eksik tahsil ettiği iş | — | Kural 5: istisna listesi | Otomatik hesaplanmaz; çözülene kadar her haftanın istisna listesinde kalır. Kapanış öncesi kısmi iade de aynı şekilde açık istisnadır | **Taslak T2 ile kapandı:** tahsil edilen üzerinden (Ç16) |
| K23 | Kapatılmış haftanın tedarikçi itirazı | — | Kural 5 | İtiraz eski haftadaki işe sonradan gelirse itiraz haftasında listelenir; sonuç düzeltme hareketiyle | **Taslak T3 ile kapandı:** 7 gün, gerekçeli karar (Ç22) |

## 03.11 Owner karar taslağı — çelişki tablosu

Durum: **TASLAK**. Kod yerel adaydır; Owner kabulü, insan bağımsız inceleme, mali müşavir ve hukuk incelemesi olmadan canlıya alınmaz. Kural numaraları Owner metnindekidir.

### Taslak kararlar ve koddaki karşılığı

| # | Taslak kural | Koddaki karşılık (yerel aday) | Test | Açık nokta |
| -- | -- | -- | -- | -- |
| T1.1 | Müşteriden fazla alınan tutar müşteriye iade edilir | Fazla tahsilat kaydedilir (önceden reddediliyordu). Pay satış fiyatına kadar hesaplanır; fazlası `customer_refund_due` ile istisna listesinde, hesaplamayı durdurmaz | `settlement.test.ts` T1 fazla tahsilat; `api.test.ts` 35/30 | İade kanalı (nakit/POS iadesi) operasyon prosedürü |
| T1.2 | Tedarikçinin fazla ödediği komisyon ödeyene iade edilir | Dekont durumu `credit_due`; iade dekontu `purpose: overpayment_refund` (alacaklı → borçlu) | T1 overpayment refund | — |
| T1.3 | İade sonrası komisyon yeniden hesaplanır | Her hafta `split(net tahsilat) − split(önceki kapanış)` → `refund_correction` fark kaydı; eski hafta değişmez | W46 −50 € → −10/−5/−35 | — |
| T1.4 | Sonraki haftaya mahsup yalnız tarafların yazılı onayıyla | `createOffset`: `writtenApprovalReference` zorunlu, 2FA + yetkili rol; DB CHECK | offset testi | Yazılı onayın biçimi (e-posta / imzalı form) |
| T1.5 | Her iade ve düzeltme ayrı kayıt ve kanıt | `booking_money_event` (referans tekil, append-only), `settlement_adjustment.adjustment_reference` UNIQUE | DB probları P4–P5 | Kanıt dosyasının saklanacağı yer |
| T1.6 | Kapanmış kayıtlar silinmez/değiştirilmez | Kapanmış hafta dondurulmuş görüntü; DB append-only + no-delete/TRUNCATE tetikleyicileri | DB probları | — |
| T2.1 | Komisyon yalnız fiilen tahsil edilen tutar üzerinden; orijinal fiyat değişmez | `splitOnCollected` (tahsilat fiyatla sınırlı); `final_booking_price` donuk | 50 € / 30 € → 6/3/21; kalan 20 € → 4/2/14 (Owner örneği, birebir) | — |
| T2.2 | Transfer tamamlanmadan komisyon ödenebilir olmaz | `completedAt` yoksa fark kaydı oluşmaz | "completion required" | — |
| T2.3 | Tahsil edilmeyen para ödemeye dahil edilmez | Kalan müşteri borcu ayrı "müşteri bakiyeleri" listesinde; ödemeye girmez | uncollected | Kalan borcu kim, ne kadar süre takip eder |
| T2.4 | Yetkisiz indirim/fiyat değişikliği yok | Fiyat yalnız tarife veya K17 onayıyla; DB fiyatı kapanıştan sonra dondurur | mevcut testler | — |
| T3.1 | Kapanmış haftaya itiraz: ekstre tarafa iletildikten sonra 7 takvim günü | `recordStatementSent` (ilk iletim geçerli), `disputeTiming` | T3 timing | — |
| T3.2 | Kayıt numarası, itiraz eden, gerekçe | `ITZ-<hafta>-NNNN`; gerekçede e-posta/telefon maskelenir | T3 akışı | — |
| T3.3 | Dekont, rezervasyon ve tahsilat kayıtları karşılaştırılır | Raporda ekstre + dekont eşleştirme + para hareketleri yan yana | — | Karşılaştırma kontrol listesi (operasyon) |
| T3.4 | Yetkili yönetici gerekçeli karar verir | `decideStatementDispute`: 2FA + admin/finance_manager, gerekçe ≥ 5 karakter; DB: bir kez karar | T3 akışı; DB probu (gerekçesiz karar reddi) | Gerçek kimlik sağlayıcı yok (SEL-332) |
| T3.5 | Kabul edilen fark sonraki açık döneme yazılır | Düzeltme `nextWeekId(son kapanış)` haftasına | T3 akışı | — |
| T3.6 | Yasal hak, sahtecilik, hesap hatası 7 gün nedeniyle otomatik reddedilmez | Süre dışı itiraz kaydedilir, yalnız "süre dışı" notu düşülür; otomatik ret yok | T3 timing | — |
| K17.1 | 5+ manuel fiyat hat bazında min/max sınır içinde | `checkManualPrice`; tarife `manualPriceBounds`; DB `shuttle_route` | K17 testleri | **Sayısal sınırlar ayrı Owner fiyat tablosu** (bugün tüm hatlarda boş → 5+ fiyat onaylanamaz) |
| K17.2 | 0,01 € gibi geçersiz değer engellenir | Sınır dışı / sıfır / ondalık-dışı tutar reddi | K17 | — |
| K17.3 | Sınırı onaylanmamış hatta fiyat kabul edilmez | `no_bounds_for_route`, `bounds_not_approved` | K17 | — |
| K17.4 | Eski 80 € (5 kişi) otomatik aktif olmaz | Tarifede 5. eleman yok; `extraPerPassengerMinor` reddedilir | mevcut | — |
| K17.5 | Onaylayanın kimliği, rolü, zamanı, eski/yeni fiyat, gerekçe kaydı | `PriceApprovalRecord` + `audit.manual_price_approved` olayı; DB `manual_price_approval` | K17 audit | — |
| K17.6 | Admin girişi + 2FA olmadan fiyat onayı yok | `mfa: true` olmayan aktör `mfa_required`. HTTP statik token `mfa: false` → HTTP üzerinden onay **kapalı** | K17 mfa | Kimlik sağlayıcı + 2FA (SEL-332) |
| K17.7 | Onaysız fiyat müşteriye kesin teklif olarak gösterilmez | Fiyatsız rezervasyon `requires_approval`; onaylanamaz, tahsil edilemez | mevcut | — |
| K8.1 | Pilot aday hatlar; AYT↔GZP yok | 12 yön kodu; AYT-GZP/GZP-AYT kod, şema ve DB'de reddedilir | mevcut + DB probu P14 | — |
| K8.2 | Her yön: kod, fiyat sürümü, başlangıç tarihi, kapsam, aktif/pasif | `routeInfo {active, coverage}` her hat için zorunlu; pasif hatta fiyat yok (`route_inactive`); tarife sürümü + `validFrom ≥ publishedAt` | K8 route metadata | Kapsam metinleri taslaktır (Owner teyidi) |
| K8.3 | Canlı fiyat ayrı Owner onayı | Tarife `approval: proposed`; üretim açılışı reddeder | live gate | — |
| K1 | Hedef: Next.js + TypeScript, SSG + gerektiğinde SSR, ortak şablon, çok dil/bölge; merkezi AGOS booking API; tek kaynak mevcut CRS PostgreSQL; WordPress içerik/SEO kontrollü geçiş; Google Ads, GA4/GTM, Meta Pixel/CAPI | Bu PR'daki `@ag/ssg` **ara aday** olarak kalır (yalnız partner örnek sitesi). API ve şema CRS eşleme adayıdır, yeni rezervasyon DB'si kurulmaz. İzleme entegrasyonu **yok** | — | Next.js geçiş planı, WordPress içerik göçü, izleme/consent (KVKK) — ayrı iş, canlı siteler değişmez |
| Canlı | 8 koşul + SEL-324/SEL-326 kapıları | `main.ts` üretim kapısı eksik koşulları listeler ve çıkar. Kimlik sağlayıcı ve CRS bağdaştırıcısı bu sürümde **yok** → üretim her durumda reddedilir (bayraklar set edilse bile; doğrulandı) | live gate | 8 koşulun her biri |

### Önceki kodla çelişkiler (bu PR'da düzeltildi)

| # | Önceki durum | Taslak kural | Düzeltme |
| -- | -- | -- | -- |
| Ç16 | Eksik tahsilat istisnaydı; hiç pay hesaplanmıyordu (K22 sorusu) | T2: tahsil edilen üzerinden | Kısmi tahsilat hesaplanır; kalan borç ayrı liste. **K22 kapandı** |
| Ç17 | Fiyatı aşan tahsilat reddediliyordu; DB `collected ≤ price` CHECK | T1.1 | Fazla tahsilat kaydedilir, fazlası müşteriye iade listesinde; CHECK kaldırıldı |
| Ç18 | Rezervasyon başına tek tahsilat (kural 9 yorumu) | T2 (kalan tutar sonradan tahsil) | Çoklu tahsilat hareketi (`booking_money_event`, referans tekil); tahsil eden ve ilk yöntem değişmez |
| Ç19 | İade = `refundAdjustments` ile tek seferlik ters hareket; private/VIP elle | T1.3 | Kümülatif fark kaydı (`settlement_entry`) tüm türler için; private/VIP orantılı (aday kural, aşağıda) |
| Ç20 | Fiyat onayında sınır, denetim kaydı ve 2FA yoktu | K17 | Sınır + denetim + 2FA + rol |
| Ç21 | Hat aktif/pasif ve kapsam bilgisi yoktu | K8 | `routeInfo` zorunlu |
| Ç22 | Kapanmış haftaya itiraz süreci yoktu (K23) | T3 | Ekstre iletimi, `ITZ-` kayıtları, gerekçeli karar, sonraki döneme düzeltme. **K23 kapandı** |
| Ç23 | Fazla ödemenin iadesi mi mahsubu mu açıktı (K20) | T1.2 / T1.4 | İade varsayılan; mahsup yalnız yazılı onayla. **K20 kapandı** (private/VIP orantı hariç) |
| Ç24 | Üretim açılışı yalnız tarife onayına bakıyordu | Canlı koşulları | 8 koşullu kapı; eksikleri listeler |
| Ç25 | Statik SSG hedef teknoloji gibi anlatılıyordu | K1 | Ara aday olarak işaretlendi |

### Senkronize org skill'leriyle çelişkiler (skill'ler bu oturumdan değiştirilemez)

Org skill'leri senkronize ve salt okunurdur. Önerilen metin değişiklikleri: [`skills/ORG-SKILL-UPDATES-2026-11-03.md`](../skills/ORG-SKILL-UPDATES-2026-11-03.md). Uygulamayı skill sahibi yapar (SEL-456 skill adaylarıyla üç yönlü birleştirme).

| # | Skill / satır | Mevcut metin (özet) | Çelişen karar |
| -- | -- | -- | -- |
| S1 | agos-pricing-matrix §A başlığı | "Alanya Group kendisi satıp işletir" | K15: shuttle'ı tedarikçi yapar ve tahsil eder; satış kanalı %20, AGOS %10, tedarikçi %70 |
| S2 | agos-pricing-matrix §A tarife | "4. yolcudan itibaren her ek yolcu +10 € (… 5 = 80 €)" | Owner fiyat kararı + K17.4: 5+ otomatik fiyat yok; 80 € aktif edilmez |
| S3 | agos-pricing-matrix üye kuralı | "üye %20 komisyon (taban: müşteri fiyatı varsayımı — teyit et)"; açık soru 8 | T2: taban **fiilen tahsil edilen** tutar (fiyatla sınırlı). Soru kapandı (taslak) |
| S4 | agos-pricing-matrix test verisi | "Shuttle 1-8 yolcu" | Otomatik fiyat 1–4; 5+ manuel ve sınırlı |
| S5 | agos-pool-finance §3 | "Shuttle Alanya Group'un kendi işidir; havuza girmez" | K15: shuttle tedarikçiye atanır. Havuza girmemesi uyumlu; "kendi işi" ifadesi değil |
| S6 | agos-pool-finance kararlar | "nakit/kart otomatik mahsup" | T1.4: mahsup yalnız tarafların yazılı onayıyla |
| S7 | agos-pool-finance / pricing ×1,30 | Havuz teklif kuralı | Uyumlu: yalnız private/VIP havuz; shuttle'a uygulanmaz. Bu PR'da havuz modu yok (501) |

### Açık kalanlar

1. **Private/VIP kısmi tahsilat:** kod hak edişi ve site payını tahsilatla **orantılı** böler (aday kural). Owner/mali müşavir teyidi gerekir.
2. **K17 sayısal sınırlar:** ayrı Owner fiyat tablosu. Gelene kadar 5+ fiyat hiçbir hatta onaylanamaz.
3. **K8 kapsam metinleri** ve hatların hangilerinin ilk açılacağı.
4. **K1 geçişi:** Next.js şablonu, WordPress içerik/SEO göçü, GA4/GTM, Meta Pixel/CAPI, Google Ads, çerez onayı. Ayrı iş; canlı siteler bu PR ile değişmez.
5. **Kimlik sağlayıcı + 2FA (SEL-332)** ve **CRS bağdaştırıcısı (SEL-331)**: canlı kapının kalıcı engelleri.

## PR denetimi — K15 kesin karar (supplier collection)

| # | Önceki PR durumu | K15 kuralı | Düzeltme |
| -- | -- | -- | -- |
| Ç9 | Online kart tahsilatı **yalnız merkezden** zorunluydu; merkez müşteri parası tutuyordu | Tahsilatı tedarikçi yapar | Tahsilat yöntemleri nakit / POS / havale; shuttle'da tahsil eden yalnız tedarikçi (kod + DB). Merkezde müşteri parası yok |
| Ç10 | AG sitesinden gelen shuttle için ayrı 90/10 "proposed" politika vardı | alanyagroup.com aynı kurala tabi | `shuttle-direct-v1` kaldırıldı; AG sitesi `alanya-group` satış kanalı |
| Ç11 | Site kendi aracıyla yapınca ayrı bir kural yoktu | %90 site / %10 AGOS, kendine komisyon yok | `self_supplied`: site payı 0, AGOS %10, hak ediş %90; yalnız yetkisi doğrulanmış site (kod) ve DB CHECK |
| Ç12 | Özel/VIP'de sabit pass (47,50 €) ve site düzeyinde model vardı | Hak edişi site belirler, iş başına seçim | Sabit pass kaldırıldı; iş başına `self` / `pass` + hak ediş |
| Ç13 | Tahsilat/iade için çoklu kayıt (`payment_event`) ve pay defteri (`ledger_entry`) vardı | Kural 9: tek tahsilat; 20 alan | Tek tahsilat kaydı + Owner alan listesi rezervasyonda; eski defter ve ödeme tabloları kaldırıldı |
| Ç14 | Haftalık kapanış "kazanılan − elde tutulan" netlemesiydi; dekont, son tarih, istisna yoktu | Kural 4–7 | Tedarikçi ekstresi, site alacakları, AGOS payları, dekont eşleştirme, geciken/eksik/fazla ödeme, istisna listesi |
| Ç15 | Pazartesi tarihli hafta anahtarı | ISO hafta, Pzt 00:00 – Paz 23:59 İstanbul, son tarih Salı 18:00 | `2026-W45` kimliği; sınırlar testli (Paz 23:59:59 → W45, Pzt 00:00 → W46, 53. hafta) |

## PR denetimi — 03.11 ikinci karar paketi (tarihçe)

Owner talimatı: "Mevcut PR ve karar kayıtları bu modele göre incelensin, çelişkiler raporlansın." Bulunanlar ve yapılanlar:

| # | Çelişki (önceki PR durumu) | Karar | Bu PR'daki düzeltme |
| -- | -- | -- | -- |
| Ç1 | AG'nin kendi sitesinden gelen shuttle'da %20 site payı **otomatik merkeze** yazılıyordu (70/0/30) | K4 | Kaldırıldı. 90/10 önerisi `proposed`; onaya kadar otomatik pay yok, finans incelemesi |
| Ç2 | Özel/VIP Model B'de merkez **pass − araç hak edişi** farkını alıyordu; araç hak edişi elle giriliyordu | K12 | Pass'ın tamamı tedarikçiye; AG ek komisyonu 0 €; elle hak ediş girişi kaldırıldı |
| Ç3 | `self_operate` modeli **yetki doğrulaması olmadan** açılabiliyordu | K12 | `self_operated` yalnız `selfOperationVerifiedAt` ile; kod ve DB reddeder |
| Ç4 | Ödeme yalnız "tahsil edildi" bayrağıydı (`paidRefs`, `paid: true`); ön ödeme, kalan, tahsil eden, iade, kapanış yoktu | K15 | Tahsilat/iade kayıtları, kurallar, haftalık kapanış eklendi; bayraklar kaldırıldı |
| Ç5 | Hat kodları `AYT-ALANYA`, `GZP-ALANYA` biçimindeydi; tarife onay durumu ve yayın tarihi yoktu | K8 | Yeni kodlar, `approval`, `publishedAt`, `validFrom ≥ publishedAt`, AYT↔GZP yasağı, üretimde onaysız tarife reddi |
| Ç6 | Örnek sitede GZP hattı vardı ama tarifeyle tutarlılık kontrolü yoktu | K8, tek fiyat kaynağı | Site, tarifede olmayan hattı listelerse derlenmez |
| Ç7 | `economics.ts` merkez SaaS projeksiyonunu (slayt 13–15) partner hesabıyla yan yana sunuyordu | K18 | Fonksiyon kalıyor ama **yalnız iç kullanım** olarak işaretlendi; dış sunum için kullanılmaz |
| Ç8 | Ödeme dağıtımı için açık bir kilit yoktu | K15 | `payoutExecution` sabit `disabled_pending_legal_review` (kodda ve DB CHECK'te); ödeme gönderen kod yok |

**Partner sunumu (Konsorsiyum Partner Sunumu V3) — K18'e göre değişmesi gerekenler** (sunum dosyası bu PR'da değiştirilmedi):

| Slayt | Sorun | Gerekli değişiklik |
| -- | -- | -- |
| 4–5 | Deneyim, otel/acenta bağlantıları, "bölge bilgisi" iddiaları | Doğrulanmadıkça başarı gibi sunulmaz; "hedef" diliyle ya da belgeyle |
| 8 | 80 € / 47,50 € / 32,50 € | Kalabilir, ancak "örnek, sabit tarife değil" ve "AG ek komisyonu 0 €" yazılmalı (K12) |
| 9 | Shuttle 35 € bilet, %20 = 7 € | Kaldır → 1–4 kişi tarifesi (30/50/60/70) ve 6/10/12/14 € site payı |
| 10–12 | Senaryolar ve "200 shuttle bileti" eşiği 7 €'ya dayanıyor | Kaldır/yeniden hesapla: 2 kişilik rezervasyon 10 € → 140 rezervasyon/ay |
| 13–15 | Merkezin SaaS kâr projeksiyonu (10–100 site, 168.000 €) | Dış sunumdan çıkar (iç belge) |
| 7, 17 | Gider ve "rezervasyon garantisi yok" | Risk ve zarar ihtimali açıkça; temkinli senaryonun garanti olmadığı (slayt 11'de −5 € örneği iyi bir başlangıç) |

## Bilinen sınırlar (v0.1)

- Shuttle'da gidiş-dönüş tek formda alınmıyor: dönüş ayrı rezervasyon olarak yapılır (`shuttle_return_must_be_booked_separately`).
- İptal, açık ya da atanmış seferdeki koltuğu boşaltır; tamamlanmış seferde değişiklik yapılmaz.
- Sefer saat dilimi sabit 60 dakika. Uçuş saatine göre akıllı gruplama ve bekleme süresi kuralı yok.
- Haftalık kapanış yalnız ekstre üretir; ödeme talimatı, banka/PSP entegrasyonu ve fatura yok (K15 hukuki onayı bekliyor).
- Kapanışta kullanıcı kimliği (kimin kapattığı) yönetim girişi (SEL-332) gelene kadar kaydedilemiyor. Fiyat onayı, itiraz kararı ve mahsup 2FA'lı aktör ister; HTTP statik token 2FA'sız olduğundan bu üç işlem HTTP'de kapalıdır.
- Turnstile ancak `TURNSTILE_SECRET` ve `turnstileSiteKey` tanımlanınca çalışır. Yerelde insan doğrulaması kapalıdır.
- Rate limit uygulama belleğindedir; çok süreçli üretimde edge (Cloudflare) kuralı gerekir.

## Bağımsız QA

K15 için bağımsız QA yapıldı (kodu yazmayan ayrı bir yapay zekâ ajanı). 10 bulgunun hepsi düzeltildi ve teste bağlandı: [K15-QA-VE-KARAR-RAPORU.md](./K15-QA-VE-KARAR-RAPORU.md). Bu inceleme insan bağımsız kabulünün yerine geçmez.

## Durum etiketi

Canlıya geçiş Owner kararıyla ayrıca onaya tabidir (03.11.2026).


`LOCAL_ONLY` · `LIVE_CHANGED=NO` · `PRODUCTION_CHANGED=NO` · `AUTOMATION_ENABLED_NEW=NO`.
Bağımsız inceleme henüz yapılmadı. Yazan kendi işini kabul edemez (Linear kuralı).

# Kararlar, çelişkiler ve açık noktalar · 03.11.2026

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
| K1 | Web teknolojisi | ADR-WEB-001: beş domain için Next.js + TypeScript, kademeli geçiş; Glass pilotu (Next.js 16) | Uydu siteler statik HTML + SSG | Bağımlılıksız TypeScript SSG (`@ag/ssg`) yalnız **partner uydu siteleri** için. Kendi beş domainimiz ADR-WEB-001'de kalır | **EVET.** Seçenekler: (a) partner siteleri bu SSG ile, (b) Glass'ın Next.js `output: 'export'` statik çıktısı ile tek tasarım sistemi. (b) tasarım birliği sağlar ama her sitede React çalışma zamanı taşır |
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
| K17 | 5+ kişilik shuttle | Tanımsız | **Mevcut karar (03.11):** manuel teklif/onay; kesinleşmeden müşteriye nihai ücret, tedarikçiye kesin hak ediş gösterilmez | Otomatik fiyat yok. Fiyatsız rezervasyon onaylanamaz, tahsilat alınamaz (`price_not_set`), pay doğmaz. Fiyat `approve-price` ile bir kez onaylanır | Kalıcı 5+ tarifesi için yeni karar. Onaylayanın kimliği, yönetim girişi (SEL-332) gelene kadar kaydedilemiyor |
| K18 | Partner sunumu düzeltmeleri | Sunum V3 | **KARAR (03.11):** dış sunumda AG iç SaaS kâr projeksiyonu yok; 35 € / 7 € / 200 bilet kaldırılır; 1–4 kişilik tarife kullanılır; risk ve zarar ihtimali açıkça yazılır; temkinli hesaplar garanti değildir; doğrulanmamış otel/acenta/entegrasyon/pazar liderliği iddiası başarı gibi sunulmaz | Sistemde sunum yok. `economics.ts` içindeki `centreMonth` **yalnız iç kullanım** olarak işaretlendi. Doğru yeni rakam: 2 kişilik 50 € → siteye 10 €; 1.400 €'yu yalnız bununla karşılamak için **ayda 140 rezervasyon** (testli) | Sunumda değişecek slaytlar aşağıda, "PR denetimi" bölümünde |
| K19 | AG'nin kendi sitesinden satılan özel/VIP | Önceki: satıcı marjı | **K15:** alanyagroup.com da site gibi davranır | (satış − hak ediş) `alanya-group` site payı olarak yazılır | **KARAR** (K15 ile kapandı) |
| K20 | İade ve düzeltmeler | Önceki: payı yazılmış işte her iade tüm payları geri alıyordu | **K15 kural 8:** eski hafta silinmez, düzeltme hareketi | Kapanmamış iş → istisna listesi. Kapanmış shuttle → iade tutarı **aynı 20/10/70 ile** bölünüp yeni haftaya ters hareket (kısmi iade dahil). Kapanmış private/VIP → `finance.manual_adjustment_required` (hak edişi site belirlediği için otomatik bölünmez) | **EVET:** private/VIP kısmi iade kuralı ve fazla ödemenin iadesi mi mahsubu mu |
| K21 | Ödeme son tarihi | — | Salı 18:00 "önerilen" | Rapor son tarihi hesaplar; geçince `late` / "Geciken ödeme" | **EVET:** son tarih kesinleşsin mi; gecikmede yaptırım (yeni iş kısıtı vb.)? |
| K22 | Tedarikçinin tahsil edemediği / eksik tahsil ettiği iş | — | Kural 5: istisna listesi | Otomatik hesaplanmaz; çözülene kadar her haftanın istisna listesinde kalır | **EVET:** eksik tahsilatta komisyon tam satış üzerinden mi, tahsil edilen üzerinden mi? |
| K23 | Kapatılmış haftanın tedarikçi itirazı | — | Kural 5 | İtiraz eski haftadaki işe sonradan gelirse itiraz haftasında listelenir; sonuç düzeltme hareketiyle | Süreç ve süre sınırı |

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
- Kapanışta kullanıcı kimliği (kimin kapattığı) yönetim girişi (SEL-332) gelene kadar kaydedilemiyor.
- Turnstile ancak `TURNSTILE_SECRET` ve `turnstileSiteKey` tanımlanınca çalışır. Yerelde insan doğrulaması kapalıdır.
- Rate limit uygulama belleğindedir; çok süreçli üretimde edge (Cloudflare) kuralı gerekir.

## Durum etiketi

Canlıya geçiş Owner kararıyla ayrıca onaya tabidir (03.11.2026).


`LOCAL_ONLY` · `LIVE_CHANGED=NO` · `PRODUCTION_CHANGED=NO` · `AUTOMATION_ENABLED_NEW=NO`.
Bağımsız inceleme henüz yapılmadı. Yazan kendi işini kabul edemez (Linear kuralı).

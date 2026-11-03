# Kararlar, çelişkiler ve açık noktalar · 03.11.2026

> **OWNER KARARLARI (03.11.2026, ikinci paket — K4 / K8 / K12 / K15 / K17):** Shuttle fiyatı ve 70/20/10 paylaşımı **KESİN**. K4, K8, K12 ve K15 **ÖNERİ** olarak geldi ve Owner onayına tabidir; kodda "proposed" olarak uygulandı ve canlıda hiçbir ödeme, fiyat veya operasyon sistemi değiştirilmedi. K17: manuel fiyat (mevcut karar). Sunum düzeltmeleri: K18. Bu paketle bulunan çelişkiler aşağıda, "PR denetimi" bölümünde.
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
| K4 | AG'nin kendi sitesinden gelen shuttle | Tanımlı değil | **ÖNERİ (03.11, onay bekliyor):** bağımsız uydu site yok → %10 Alanya Group, %90 tedarikçi (50 € → 5 € / 45 €). "Onaylanana kadar eski %20'nin merkeze aktarılması doğru değildir." | `shuttle-direct-v1` = 9000/0/1000, durumu **proposed**. Onaylanana kadar bu rezervasyonlara **otomatik pay yazılmaz**; `finance.review_required` olayı oluşur. Eski "%20 merkeze" davranışı kaldırıldı | **Owner onayı** → politikayı `approved` yap |
| K5 | Özel transfer bildirimi | Her bildirim tek bir outbox olayından doğar (tasarım değişmezi 6) | "Doğrudan site sahibinin e-postasına" | Outbox olayı (`private.request_received.notify_site_owner`) üzerinden n8n ile anında gönderilir; form doğrudan e-posta atmaz | Hayır. Değişmezle uyumlu yorum |
| K6 | WhatsApp numarası | D-WA-20261102-01: dört AG uydu sitesi tek hattı paylaşır, site başına ayrı numara açılmaz | Her sitenin kendi WhatsApp numarası | `site.json` → `contact.whatsapp`. AG markalı sitelerde ortak hat yazılır, partner sitelerinde partnerin kendi numarası | Uyumlu: tek hat kuralı AG markalarına, ayrı numara partner sitelerine uygulanır. Teyit önerilir |
| K7 | Shuttle kapasitesi | En fazla 10 kişi; ana sitedeki "11" ifadesiyle fark açık (SEL-245/327) | — | Araç kapasitesi 10, grup üst sınırı tarifede 10 | Araç ruhsatı / koltuk teyidi |
| K8 | Shuttle hatları ve tarihleri | 4 hat, kodlar AYT-ALANYA vb. | **ÖNERİ (03.11):** AYT↔Alanya, AYT↔Side, AYT↔Belek, AYT↔Kemer, AYT↔Konyaaltı, GZP↔Alanya Merkez (pilot). Her yön ayrı kod. **AYT↔GZP açılmaz.** Başlangıç yayın tarihine bağlı; geçmiş fiyat değişmez | Kodlar: `AYT-ALN/ALN-AYT`, `AYT-SID/SID-AYT`, `AYT-BLK/BLK-AYT`, `AYT-KMR/KMR-AYT`, `AYT-KNY/KNY-AYT`, `GZP-ALN/ALN-GZP` (pilot). AYT-GZP/GZP-AYT kod, şema ve veritabanında reddedilir. `validFrom ≥ publishedAt`. Tarife `approval: proposed`; üretim modunda API onaysız tarifeyle **açılmaz**. Rezervasyondaki fiyat dondurulur (testli) | **Owner onayı:** hat listesi, kodlar, başlangıç tarihi. Soru: kararınızdaki 30/50/60/70 € Kemer ve Konyaaltı dahil tüm hatlarda aynı mı? (Kodda şimdilik aynı) |
| K9 | Yönetim girişi | Kimlik sağlayıcı AÇIK; admin için 2FA zorunlu (SEL-332) | — | Geçici `AG_ADMIN_TOKEN`; tanımlı değilse admin uçları kapalı | Kimlik sağlayıcı seçimi |
| K10 | Rezervasyon veritabanı | Tek kaynak CRS PostgreSQL (`agos-reservation-postgres`); yeni rezervasyon deposu açılmaz | — | `MemoryStore` (yalnız yerel). `0001_network_core.sql` bir eşleme ADAYIDIR, uygulanmaz | Hayır. G1 sonrası SEL-331 eşlemesi |
| K11 | Yorumlar | Uydurma `aggregateRating`/`Review` yasak | Her sitede yorum paneli | Yalnız `verified: true` yorumlar gösterilir; yorum şeması yok; örnek sitede yorum yok (`[]`) | Hayır |
| K12 | Özel/VIP operasyonu | Pass modeli (sunum V3); araç hak edişi ≤ pass, merkez = pass − hak ediş | **ÖNERİ (03.11):** iki model; varsayılan NETWORK_PASS. **Model A SELF_OPERATED:** yalnız doğrulanmış yasal şart/yetkiyle; AG işlem komisyonu almaz. **Model B NETWORK_PASS:** 80 € → tedarikçi 47,50 €, site 32,50 €, **AG ek komisyon 0 €**. Tutarlar sabit tarife değil | `privateMode`: `network_pass` (varsayılan) / `self_operated` (yalnız `selfOperationVerifiedAt` doluysa; kod ve DB reddeder). Pass'ın **tamamı** tedarikçiye yazılır; Alanya Group satırı yok. Eski "araç hak edişi + merkez farkı" kaldırıldı | **Owner onayı.** Pass tutarı (47,50 € / 60 €) rota/araçtan bağımsız örnek; gerçek pass tablosu karar ister |
| K13 | Shuttle fiyat birimi | Grup toplamı: 1 kişi 30 €, 2 kişi 50 €, 3 kişi 60 €, +10 €/kişi | Sunum: kişi başı 35 € bilet. **OWNER KARARI 03.11:** 1 kişi 30 €, 2 kişi 50 €, 3 kişi 60 €, 4 kişi 70 € **rezervasyon toplamı**; 35 € **iptal**; tek fiyat kaynağı | Tarife: `[3000, 5000, 6000, 7000]`, kişi başı ek ücret alanı **kaldırıldı** (eski yapılandırma reddedilir). Sitelerdeki fiyat tablosu aynı tarifeden üretilir; sayfa metninde elle yazılmış fiyat varsa site derlenmez | **KARAR** |
| K14 | Araç hak edişi | Şoför teklifi × 1,30 (pool-finance); white-label: araç neti ayrı alan | Shuttle: **OWNER KARARI 03.11: %70 tedarikçi.** Özel/VIP: sunum "sözleşmeye göre" | Shuttle: %70 sabit. Özel/VIP (pass): hak ediş tamamlamada girilir, pass'ı aşamaz | Shuttle **KARAR**. Özel/VIP hâlâ açık (K12 ile birlikte) |
| K15 | Müşteri ödemeleri ve haftalık kapanış | Ödeme yalnız "paid" bayrağıydı | **ÖNERİ (03.11):** merkezi, kayıtlı tahsilat. Rezervasyon başına toplam, ön ödeme, kalan, tahsil eden, site/tedarikçi/AG payı, iade/iptal, haftalık kapanış. Araçta ödeme yalnız izinli yöntemse; araçta tahsil edilen kapanışa girer; mükerrer yok. Hukuki muhatap, faturalama ve ödeme kuruluşu sözleşmesi doğrulanmadan canlı otomatik dağıtım yok | `payments.ts` + `payment_event` (silinmez). Online kart **yalnız merkez**, nakit **yalnız işi yapan tedarikçi**, yöntem sitenin/rezervasyonun izinli listesinde olmalı, kalan ve iade sınırı kontrollü. Pay yalnız **tam tahsil + teslim** sonrası. Kapanış: Pzt–Paz İstanbul, hafta bitmeden yapılmaz, aynı hafta iki kez yapılmaz, her kayıt **tek kapanışa** girer (DB `UNIQUE`), korunum testli. **Ödeme gönderimi yok:** `payoutExecution = disabled_pending_legal_review` (DB'de de sabit) | **Owner onayı + hukuk/mali müşavir:** tahsilatın muhatabı, faturalama, ödeme kuruluşu (PSP) |
| K16 | Sunumdaki iddialar | AGNET-SEO / yönetişim: doğrulanmamış iddia yazılmaz | Slayt 4–5: deneyim, otel/acenta bağlantıları, referanslar | Sistemde yok | Sunumun kendisi "pilot görüşmesinde yazılı doğrulanır" diyor. Dış paylaşımdan önce belge eklenmeli |
| K17 | 5+ kişilik shuttle | Tanımsız | **Mevcut karar (03.11):** manuel teklif/onay; kesinleşmeden müşteriye nihai ücret, tedarikçiye kesin hak ediş gösterilmez | Otomatik fiyat yok. Fiyatsız rezervasyon onaylanamaz, tahsilat alınamaz (`price_not_set`), pay doğmaz. Fiyat `approve-price` ile bir kez onaylanır | Kalıcı 5+ tarifesi için yeni karar. Onaylayanın kimliği, yönetim girişi (SEL-332) gelene kadar kaydedilemiyor |
| K18 | Partner sunumu düzeltmeleri | Sunum V3 | **KARAR (03.11):** dış sunumda AG iç SaaS kâr projeksiyonu yok; 35 € / 7 € / 200 bilet kaldırılır; 1–4 kişilik tarife kullanılır; risk ve zarar ihtimali açıkça yazılır; temkinli hesaplar garanti değildir; doğrulanmamış otel/acenta/entegrasyon/pazar liderliği iddiası başarı gibi sunulmaz | Sistemde sunum yok. `economics.ts` içindeki `centreMonth` **yalnız iç kullanım** olarak işaretlendi. Doğru yeni rakam: 2 kişilik 50 € → siteye 10 €; 1.400 €'yu yalnız bununla karşılamak için **ayda 140 rezervasyon** (testli) | Sunumda değişecek slaytlar aşağıda, "PR denetimi" bölümünde |
| K19 | AG'nin kendi sitesinden satılan özel/VIP (Model B) | Tanımlı değil | Tanımlı değil | Satıcı Alanya Group: satış − pass, **satıcı marjı** olarak Alanya Group satırına yazılır (komisyon değil); tedarikçi pass'ın tamamını alır | **EVET**, teyit (K4'ün özel/VIP karşılığı) |
| K20 | Teslimden sonra kısmi iade | Tanımlı değil | Tanımlı değil | Teslim edilmiş ve payı yazılmış işte **herhangi bir iade** tüm payları bir kez ters kayıtla kapatır ve finans incelemesine düşer; paylar otomatik yeniden yazılmaz | **EVET**: kısmi iadede payların oransal düşülmesi mi, tam inceleme mi? |

## PR denetimi — 03.11 ikinci karar paketi

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

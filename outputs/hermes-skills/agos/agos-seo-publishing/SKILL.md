---
name: "agos-seo-publishing"
description: "AGOS 5 web sitesinde rezervasyon kaynağı takibi, site başına WhatsApp, Search Console/Bing/Yandex kaydı ve indeksleme, silo/landing sayfa yapısı, spam'e düşmeden zamanlı yayın takvimi, lokal SEO, global SEO (hreflang), GEO (yapay zekâ aramaları) ve llms.txt. 'SEO', 'Search Console', 'index', 'landing', 'silo', 'yayın takvimi', 'llms.txt', 'WhatsApp butonu', 'mesaj hangi siteden geldi' işlerinde kullan."
---

# AGOS SEO, site kaynağı ve yayın kuralları

Linear: SEL-439 (bu iş), SEL-442 (kayıt düzeni: piramit, oturum kapanışı, Master Index §6), SEL-441 (AGNET-SEO standardı), SEL-438 (alanyagroup.com SEO + llms.txt), SEL-281 (site başına rezervasyon), SEL-315/319 (SEO otopilot ve yayın kapıları),
SEL-151/233 (silo ve landing standardı), doküman "AGOS Web & Growth OS — Transfer / Taxi / Uber Silo Architecture".
Linear'daki güncel metin bu dosyadan farklıysa **Linear geçerlidir**. Yetki sınırı için önce agos-roadmap bölüm 0.

## 0. Değişmez kurallar

1. **Canlı yayın Owner-L3 ister.** Her yayın partisi (batch) için ayrı onay alınır. Bir onay sonraki partiyi kapsamaz. Hermes yalnız şunları yapar:
   - salt-okunur denetim;
   - taslak (GitHub PR veya staging);
   - yayın takvimi önerisi;
   - yayından sonra ölçüm.
2. **Otomatik yayın KAPALI** (`AUTO_PUBLISH=OFF`). Zamanlanmış yayın, Owner'ın onayladığı partinin önceden belirlenmiş saatte açılmasıdır. Hermes yeni sayfa üretip kendi başına yayınlamaz.
3. **Uydurma yok:**
   - fiyat, süre, lisans ve araç bilgisi yetkili kayıttan gelir (fiyat: agos-pricing-matrix);
   - sahte yorum, sahte yıldız veya uydurma istatistik yok;
   - Uber'i ortak gibi gösterme yok.
4. **Bir arama niyeti = bir canonical sayfa.** Aynı metin 5 sitede tekrar edilmez. Her site farklı dil ya da farklı niyete hizmet eder (bölüm 2). Bunu bozan sayfa doorway (kapı sayfası) riski taşır; yayın listesine giremez.
5. **Mevcut URL'ler korunur.** Kanıtlı aday listesi ve ayrı Owner onayı olmadan URL silme, 301 yönlendirme, noindex veya slug değişikliği yapılmaz.
6. **Gizli değer yok.** Token, Search Console servis hesabı anahtarı, telefon numarası ve müşteri verisi sohbete, Linear'a veya loga yazılmaz. WhatsApp numarası raporda yalnız `****1234` biçiminde görünür.

## 1. Rezervasyon: hangi siteden geldi?

Akış:
- **Web formu:** site formu → transfer-platform API → source-bridge → canonical DB (`agos-reservation-postgres`) → Telegram bildirimi.
- **WhatsApp:** gelen mesaj → aynı API.

Her kayıtta zorunlu alanlar:

| Alan | Örnek | Not |
|---|---|---|
| source_domain | antalyaflughafen.com | Formun gönderildiği alan adı. Kullanıcının beyanı değil, sunucunun gördüğü Origin/Host. |
| source_channel | web_form / whatsapp_click / whatsapp_direct / phone | |
| landing_path | /de/flughafen-transfer-alanya/ | Sorgu parametreleri hariç. |
| locale | de | |
| utm_* | yalnız ilk temas | İç linkler UTM taşımaz. |

**Telegram bildirimi** her rezervasyonda ilk satırda kaynağı gösterir. Örnek: `🌐 antalyaflughafen.com · web_form · de`. Domain alanı boş gelen kayıt `KAYNAK=BİLİNMİYOR` diye raporlanır ve sayılır. Hermes boş alanı tahminle doldurmaz.

## 2. Site rolleri (Owner onaylı — AGNET-SEO v1.0 / SEL-441 ve AGLOCAL-OWNERSHIP-MAP v1.1)

Kaynak: Owner onaylı AGNET-SEO v1.0 (SEL-441) ve AGLOCAL-OWNERSHIP-MAP v1.1 (SEL-363). Bu tablo onlarla çelişirse **harita kazanır**.

| Kod | Site | Rol | Dil |
|---|---|---|---|
| AG | alanyagroup.com | Ana marka ve operatör: Alanya + Gazipaşa (GZP) otoritesi, TR/RU tüm transfer niyetleri, merkezi rezervasyon | EN, TR, RU |
| AGT | antalyagettransfer.com | Antalya Havalimanı (AYT) genel, Antalya merkez, Side/Manavgat | EN |
| AAT | antalyaairporttransfers.net | Belek/Kadriye + Kemer koridoru (genel AYT niyeti AGT'dedir) | EN |
| AFH | antalyaflughafen.com | Öncelikli altı bölgenin tüm transfer niyetleri | DE |
| SLT | safelinetravel.com | Tur, aktivite, bölge keşfi; transfer SEO'sunu tekrar etmez | EN |

Kurallar:
- İki site aynı dil ve aynı niyetle sayfa yayınlayamaz. Sayfanın `owner_id`'si haritada o domaine ait değilse sayfa açılmaz; sahip URL'ye link verilir.
- Siteler arası benzerlik eşiği: 5-gram Jaccard en çok %15 (AGNET-SEO §10).
- Footer'da marka beyanı zorunludur (AGNET-SEO §2).
- Siteler arası link sayısı ve `rel` kuralları AGNET-SEO §3'e göre uygulanır.

## 3. Site başına WhatsApp

- **Numara (Owner kararı D-WA-20261102-01):** dört uydu site ortak hattı kullanır; numara SEL-439 kararında yazılıdır.
  - Site başına ayrı numara açılmaz.
  - Hermes raporlarında numara yalnız `****1234` biçiminde görünür.
  - WhatsApp Business Cloud API numarası, Owner kararıyla yalnız rezervasyon sonrası teyit içindir (agos-notification-automations bölüm 1).
- **Kaynak etiketi:** her sitedeki buton `wa.me` linkidir ve ön-dolu metnin başında site kodu bulunur. Örnek: `[AFH] antalyaflughafen.com/flughafentransfer-antalya-kemer/ – Hallo, ich möchte einen Transfer buchen.` Kod ile birlikte sayfa yolu da yazılır. Bu kod ilk mesajla gelir; intake bunu `source_domain` ve `source_channel=whatsapp_click` olarak kaydeder.
  - Kod yoksa kayıt `whatsapp_direct` olur.
  - Müşteri kodu silerse kaynak bilinmez. Bu normaldir; tahmin edilmez.
  - Butonun kendisi de analitik olayı üretir (`whatsapp_click`, site, sayfa).
- **Teknik ilke:** butona hiçbir numara gizli kodla gömülmez. Numara sayfada açıkça yazılır; site kodu yalnız metindedir.
- **Kişisel veri:** mesaj içeriği Linear'a ve loga yazılmaz. Raporda yalnız sayım bulunur (site × kanal).

## 4. Search Console, Bing, Yandex ve indeksleme

Kayıt:
- **Google Search Console:** her site için **Domain property** önerilir (DNS TXT kaydı). DNS erişimi yoksa URL-prefix property ile HTML dosyası doğrulaması yapılır.
  - Dosya sitenin köküne konur. Bu bir deploy'dur: Owner-L3 gerekir.
  - GSC hesabına Owner giriş yapar. Hermes Google hesabına girmez.
- **Hermes'in erişimi:** ayrı bir Google Cloud servis hesabı her property'ye kısıtlı kullanıcı olarak eklenir. Bu hesapla sorgu verisi okunur ve sitemap gönderilir.
  - Anahtar yalnız sunucuda root dosyasında durur. Hermes onu forced-command kapısından kullanır, değerini görmez.
- **Bing Webmaster Tools:** GSC'den içe aktarılır.
- **Yandex Webmaster:** Rus pazarı için eklenir.
- **IndexNow:** Bing/Yandex için. Sitenin köküne bir anahtar dosyası konur; yayınlanan URL'ler IndexNow ile bildirilir.

İndeksleme kuralları:
- Google'a yeni sayfa **sitemap** ile bildirilir. Sitemap'te doğru `lastmod` olur ve yalnız indexlenebilir canonical URL'ler bulunur.
- **Google Indexing API kullanılmaz.** Bu API yalnız iş ilanı ve canlı yayın sayfaları içindir; başka sayfada kullanmak spam sinyalidir.
- **"URL denetimi → Dizine eklenmesini iste"** düğmesine yalnız Owner basar. Günde site başına en çok 10 URL ve yalnız yeni ya da büyük güncelleme almış öncelikli sayfalar için.
- **İndex garantisi yok.** Raporda "gönderildi", "tarandı" ve "dizinde" ayrı durumlardır. "Tarandı – dizine eklenmedi" sayısı artarsa yayın durur (bölüm 6).

## 5. Sayfa standardı (her landing yayından önce bu listeyi geçer)

- [ ] Niyet ve canonical sahibi belli; başka sitede ya da URL'de aynı niyet yok.
- [ ] Silo yeri belli (Airport → Bölge → İlçe → Otel → Hizmet). Breadcrumb ve iç linkler üst ve kardeş sayfalara gidiyor.
- [ ] Özgün içerik: gerçek alış noktası ve süre, gerçek araç, bölgeye/otele özel bilgi, gerçek SSS. Şablon cümleleri sayfanın yarısından azını oluşturur.
- [ ] Fiyat yetkili tariften geliyor (shuttle 1=30, 2=50, 3=60, 4+ kişi +10 €). Fiyat yoksa "teklif alın" yazılır.
- [ ] Rezervasyon formu çalışıyor ve `source_domain` gidiyor. WhatsApp butonu site kodunu taşıyor.
- [ ] title (≤60), meta description (≤155) ve tek H1 var; başlıkta eski yıl yok.
- [ ] Şema yalnız gerçek bilgiyle kullanılıyor: Organization/TravelAgency (ya da TaxiService), Service, BreadcrumbList, uygunsa FAQPage. Kendi hizmetine verilmiş yorum yıldızı (self-serving review) yok.
- [ ] Dil sürümleri arasında karşılıklı hreflang ve `x-default` var. Canonical kendine işaret ediyor.
- [ ] Mobil hız: LCP < 2,5 s, CLS < 0,1. Görseller sıkıştırılmış ve `alt` metinli.
- [ ] Kurumsal güven bilgisi: lisans (ör. TÜRSAB belge no) yalnız gerçekse yazılır; iletişim, iptal koşulları.
- [ ] Bağımsız inceleyici kontrol etti. Hermes kendi taslağını kabul edemez.

**Lokal SEO:**
- Google İşletme Profili (GBP) yalnız gerçek ofis adresi için açılır. Uydu sitelere sahte adres veya sahte GBP açılmaz.
- Ad/adres/telefon (NAP) tüm sitelerde aynı olur.
- Bölge sayfaları yerel gerçek bilgi taşır: havalimanı terminali, yol süresi, buluşma noktası.

**Global SEO:**
- Her dil kendi URL'sinde yayınlanır (`/de/`, `/ru/` …). Otomatik çeviri insan kontrolünden geçmeden yayınlanmaz.
- Para birimi ve tarih biçimi dile uygun olur.

**GEO (yapay zekâ aramaları):**
- Sayfanın ilk paragrafı soruyu doğrudan yanıtlar (ör. "Antalya Havalimanı'ndan Alanya'ya transfer kaç dakika, kaç €?").
- Gerçek veriler tablo halinde verilir; kaynak ve güncelleme tarihi yazılır.
- "AI'a girmek için" toplu benzer içerik üretilmez.

**llms.txt ve robots.txt (SEL-438 Owner kararı):**
- Her sitenin kökünde llmstxt.org biçiminde `/llms.txt` bulunur:
  - `# Site adı`;
  - `> tek cümle özet`;
  - kısa açıklama;
  - `## Hizmetler`, `## Bölgeler`, `## Rehberler`, `## Politika` başlıkları altında `- [Başlık](https://tam-url): açıklama` satırları.
- İsteğe bağlı `/llms-full.txt` sayfaların düz metnini içerir.
- Linkler yalnız yayında olan, 200 dönen canonical URL'lerdir.
- robots.txt'te eğitim botları (GPTBot, ClaudeBot, Google-Extended, CCBot) engelli kalır. AI arama botlarına izin verilir: OAI-SearchBot, Claude-SearchBot, PerplexityBot.
- `Sitemap:` satırı bulunur.

## 6. Spam'e düşmeden yayın takvimi

İlke: hız partinin büyüklüğüyle değil, kaliteyle sınırlıdır. Belli gün ve saat kuralı Google için bir kalite sinyali değildir. Amacı, her partiyi gözlemleyebilmek ve sorun çıkınca hemen durdurabilmektir.

| Faz | Süre | Ne yayınlanır | Sınır |
|---|---|---|---|
| F0 Teknik temel | 1. hafta | GSC/Bing/Yandex kaydı, sitemap, robots, llms.txt, şema düzeltmeleri, kırık form/WhatsApp düzeltmesi | Yeni sayfa yok |
| F1 Pilot | 2. hafta | Site başına 3 mevcut yüksek niyetli sayfanın iyileştirilmesi | 15 sayfa toplam |
| F2 İlk genişleme | 3.–4. hafta | Site başına haftada en çok 3 yeni landing | Haftada en çok 15 sayfa |
| F3 Ölçekli | 5. hafta + | Site başına haftada en çok 5–8 sayfa | Ancak F2 sayfalarının %70'i 14 gün içinde dizine girdiyse |

- **Yayın penceresi:** Salı, Çarşamba, Perşembe 10:00–12:00 TRT (operasyon ekibi izlerken).
- **Kademeli günler:** aynı gün iki site birden yayın almaz. Önerilen sıra:
  - Salı: AG, AFH;
  - Çarşamba: AGT, SLT;
  - Perşembe: AAT.
- **Her partiden sonra 48 saat gözlem** yapılır. Kontroller: 200/canonical/noindex, form ve WhatsApp testi, sitemap, IndexNow, GSC kapsam raporu.
- **Durdurma kuralları.** Aşağıdakilerden biri olursa yayın durur ve Owner'a rapor gider:
  - GSC'de manuel işlem ya da güvenlik sorunu;
  - "Tarandı – dizine eklenmedi" sayısında partiden sonra %30'dan fazla artış;
  - 5xx/404 artışı;
  - CWV kötüleşmesi;
  - form ya da WhatsApp testinin başarısız olması.
- Geri alma paketi her partide hazırdır: önceki sürüm klasörü, Caddy/Nginx yedeği, sitemap'in eski hâli.

## 7. Hermes'in raporları

- Linear olay anahtarı: `HERMES:SEO:<site-kodu>:<iş>:<YYYYMMDD>`.
- Haftalık özet: site × (yeni rezervasyon, WhatsApp tıklaması, kaynak bilinmeyen, GSC tıklama/gösterim, dizindeki sayfa, hata).
- Yalnız sayı. Müşteri adı, telefon ve mesaj içeriği yok.
- Sonuç dili PASS / FAIL / BLOCKED / NOT RUN. "Gönderildi" ile "dizinde" karıştırılmaz.

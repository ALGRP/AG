# Kararlar, çelişkiler ve açık noktalar · 03.11.2026

> **Güncelleme (03.11, Konsorsiyum Partner Sunumu V3):** K2 netleşti; K3 shuttle tarafında sunumla uyumlu. Sunum, özel/VIP modelini değiştiriyor ve yeni açık noktalar getiriyor: K12–K16.

Bu belge, Owner'ın 03.11.2026 tarihli talebini Linear'daki mevcut kararlarla karşılaştırır. Kural: yeni karar eskisini otomatik silmez. Çelişki **ÇELİŞKİ** olarak kaydedilir ve Owner kararını bekler. Koddaki varsayılanlar yalnız yerel adaydır.

| # | Konu | Linear'daki durum | 03.11 talebi | Koddaki varsayılan | Karar gerekiyor mu? |
| -- | -- | -- | -- | -- | -- |
| K1 | Web teknolojisi | ADR-WEB-001: beş domain için Next.js + TypeScript, kademeli geçiş; Glass pilotu (Next.js 16) | Uydu siteler statik HTML + SSG | Bağımlılıksız TypeScript SSG (`@ag/ssg`) yalnız **partner uydu siteleri** için. Kendi beş domainimiz ADR-WEB-001'de kalır | **EVET.** Seçenekler: (a) partner siteleri bu SSG ile, (b) Glass'ın Next.js `output: 'export'` statik çıktısı ile tek tasarım sistemi. (b) tasarım birliği sağlar ama her sitede React çalışma zamanı taşır |
| K2 | Site ücreti | SEL-222'de "€100 Growth Pro" taslağı; ayrıca "partner ücretsiz katılır" kararı | **Sunum V3: 200 €/ay SaaS aboneliği**, uydu site sahibi Alanya Group'a öder. Google Ads (40 €/gün) partnerin kendi gideridir, AG cirosu değildir. Site başı iç maliyet varsayımı 40 € | `subscription_plan` = 20000 cent/ay, `site_cost_minor` = 4000; reklam bütçesi sistemde AG geliri olarak tutulmaz | **NETLEŞTİ** (sunum taslak). "Ücretsiz katılım" kararının kalktığı Linear'a işlenmeli |
| K3 | Shuttle gelir paylaşımı | White-label SaaS v1: shuttle merkezin ürünüdür, üyeye %20. Sürücü havuzu v1.1: %70 sürücü / %30 AGOS | %70 taşıyıcı / %20 site sahibi / %10 merkez | `shuttle-split-v1` = 7000/2000/1000 baz puan | Oranlar Owner talebiyle uyumlu. **Matrah** (KDV, indirim, iade, ödeme komisyonu) hâlâ AÇIK |
| K4 | Rezervasyon AG'nin kendi sitesinden gelirse | Tanımlı değil | Tanımlı değil | Shuttle'da partner payı (%20) merkeze eklenir (araç %70, merkez %30); pass işinde site katkısı merkeze yazılır | **EVET**, teyit |
| K5 | Özel transfer bildirimi | Her bildirim tek bir outbox olayından doğar (tasarım değişmezi 6) | "Doğrudan site sahibinin e-postasına" | Outbox olayı (`private.request_received.notify_site_owner`) üzerinden n8n ile anında gönderilir; form doğrudan e-posta atmaz | Hayır. Değişmezle uyumlu yorum |
| K6 | WhatsApp numarası | D-WA-20261102-01: dört AG uydu sitesi tek hattı paylaşır, site başına ayrı numara açılmaz | Her sitenin kendi WhatsApp numarası | `site.json` → `contact.whatsapp`. AG markalı sitelerde ortak hat yazılır, partner sitelerinde partnerin kendi numarası | Uyumlu: tek hat kuralı AG markalarına, ayrı numara partner sitelerine uygulanır. Teyit önerilir |
| K7 | Shuttle kapasitesi | En fazla 10 kişi; ana sitedeki "11" ifadesiyle fark açık (SEL-245/327) | — | Araç kapasitesi 10, grup üst sınırı tarifede 10 | Araç ruhsatı / koltuk teyidi |
| K8 | Shuttle hatları ve tarihleri | 4 hat iki yönde eşit fiyat; `RUNTIME_PRICE_AUTHORITY=UNVERIFIED` | — | `config/shuttle-tariff.example.json`: AYT/GZP ⇄ ALANYA, örnek | **EVET**: hat kodları ve geçerlilik tarihleri |
| K9 | Yönetim girişi | Kimlik sağlayıcı AÇIK; admin için 2FA zorunlu (SEL-332) | — | Geçici `AG_ADMIN_TOKEN`; tanımlı değilse admin uçları kapalı | Kimlik sağlayıcı seçimi |
| K10 | Rezervasyon veritabanı | Tek kaynak CRS PostgreSQL (`agos-reservation-postgres`); yeni rezervasyon deposu açılmaz | — | `MemoryStore` (yalnız yerel). `0001_network_core.sql` bir eşleme ADAYIDIR, uygulanmaz | Hayır. G1 sonrası SEL-331 eşlemesi |
| K11 | Yorumlar | Uydurma `aggregateRating`/`Review` yasak | Her sitede yorum paneli | Yalnız `verified: true` yorumlar gösterilir; yorum şeması yok; örnek sitede yorum yok (`[]`) | Hayır |
| K12 | Özel/VIP operasyonu | White-label v1: üye "kendim yaparım" (A) ya da "havuza aktar" (B) | İlk mesaj: operasyonu site sahibi yapar. **Sunum V3:** site sahibi satar; iş sabit **pass** bedeliyle (private 47,50 €, VIP 60 €) AG/araç ağına aktarılır; site satış − pass'ı alır (80 → 32,50 €; 120 → 60 €) | Site ayarı `privateMode`: `pass_to_network` (varsayılan, sunum) ve `self_operate` (ilk mesaj). Satış < pass ise satış reddedilir | **EVET.** Varsayılan sunum modeli mi, yoksa site başına seçim mi? |
| K13 | Shuttle fiyat birimi | Grup toplamı: 1 kişi 30 €, 2 kişi 50 €, 3 kişi 60 €, +10 €/kişi | Sunum: **kişi başı 35 € bilet** ("örnek varsayım"); site komisyonu %20 = 7 € | Tarife motoru ikisini de taşır (grup: `[3000,5000,6000]+1000`; kişi başı: `[3500]+3500`). Örnek dosya grup tarifesinde | **EVET.** Satışta hangisi geçerli? İki model aynı anda yayımlanırsa sitelerde çelişkili fiyat görünür |
| K14 | Araç hak edişi | Şoför teklifi × 1,30 (pool-finance); white-label: araç neti ayrı alan | 70/20/10 (ilk mesaj); sunum: "rota / araç / sözleşmeye göre netleşir" | Shuttle: 70/20/10 politikası. Özel/VIP: araç hak edişi tamamlamada girilir, **pass'ı aşamaz**; merkez = pass − hak ediş | **EVET.** Shuttle'da araç payı sabit %70 mi, sözleşme mi? |
| K15 | Özel işte tahsilat | Kart / araçta nakit; MoR üyede mi AG'de mi açık | Sunum: "80 € müşteri öder; 32,50 € sitede kalır, 47,50 € aktarılır": site tahsil edip pass'ı aktarıyor gibi | Defter yalnız payları yazar; para akış yönü (kim kime borçlu) henüz modellenmedi | **EVET.** Müşteri parayı kime öder (site, AG, şoföre nakit)? Haftalık mahsup buna göre kurulacak |
| K16 | Sunumdaki iddialar | AGNET-SEO / yönetişim: doğrulanmamış iddia yazılmaz | Slayt 4–5: deneyim, otel/acenta bağlantıları, referanslar | Sistemde yok | Sunumun kendisi "pilot görüşmesinde yazılı doğrulanır" diyor. Dış paylaşımdan önce belge eklenmeli |

## Bilinen sınırlar (v0.1)

- Shuttle'da gidiş-dönüş tek formda alınmıyor: dönüş ayrı rezervasyon olarak yapılır (`shuttle_return_must_be_booked_separately`).
- İptal edilen shuttle rezervasyonu seferdeki koltuğu henüz boşaltmıyor.
- Sefer saat dilimi sabit 60 dakika. Uçuş saatine göre akıllı gruplama ve bekleme süresi kuralı yok.
- Özel/VIP pass işinde tahsilatın yönü (K15) ve haftalık kapanış, nakit/kart mahsubu ve ödeme kaydı (`agos-pool-finance`) henüz yok. Bugün yalnız pay satırları ve bakiye var.
- Turnstile ancak `TURNSTILE_SECRET` ve `turnstileSiteKey` tanımlanınca çalışır. Yerelde insan doğrulaması kapalıdır.
- Rate limit uygulama belleğindedir; çok süreçli üretimde edge (Cloudflare) kuralı gerekir.

## Durum etiketi

`LOCAL_ONLY` · `LIVE_CHANGED=NO` · `PRODUCTION_CHANGED=NO` · `AUTOMATION_ENABLED_NEW=NO`.
Bağımsız inceleme henüz yapılmadı. Yazan kendi işini kabul edemez (Linear kuralı).

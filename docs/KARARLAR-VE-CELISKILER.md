# Kararlar, çelişkiler ve açık noktalar · 03.11.2026

Bu belge, Owner'ın 03.11.2026 tarihli talebini Linear'daki mevcut kararlarla karşılaştırır. Kural: yeni karar eskisini otomatik silmez. Çelişki **ÇELİŞKİ** olarak kaydedilir ve Owner kararını bekler. Koddaki varsayılanlar yalnız yerel adaydır.

| # | Konu | Linear'daki durum | 03.11 talebi | Koddaki varsayılan | Karar gerekiyor mu? |
| -- | -- | -- | -- | -- | -- |
| K1 | Web teknolojisi | ADR-WEB-001: beş domain için Next.js + TypeScript, kademeli geçiş; Glass pilotu (Next.js 16) | Uydu siteler statik HTML + SSG | Bağımlılıksız TypeScript SSG (`@ag/ssg`) yalnız **partner uydu siteleri** için. Kendi beş domainimiz ADR-WEB-001'de kalır | **EVET.** Seçenekler: (a) partner siteleri bu SSG ile, (b) Glass'ın Next.js `output: 'export'` statik çıktısı ile tek tasarım sistemi. (b) tasarım birliği sağlar ama her sitede React çalışma zamanı taşır |
| K2 | Site ücreti | SEL-222'de "€100 Growth Pro" taslağı; ayrıca "partner ücretsiz katılır, tamamlanan satıştan komisyon" kararı ile eski aylık SaaS taslağı arasında ÇELİŞKİ | Site başına aylık / kurulum 200 € | Kodda tutar yok; `subscription_plan` tablosunda veri olarak tutulur | **EVET.** 200 € aylık mı, kurulum mu, ikisi birden mi? Ücretsiz katılım kararı kalkıyor mu? |
| K3 | Shuttle gelir paylaşımı | White-label SaaS v1: shuttle merkezin ürünüdür, üyeye %20. Sürücü havuzu v1.1: %70 sürücü / %30 AGOS | %70 taşıyıcı / %20 site sahibi / %10 merkez | `shuttle-split-v1` = 7000/2000/1000 baz puan | Oranlar Owner talebiyle uyumlu. **Matrah** (KDV, indirim, iade, ödeme komisyonu) hâlâ AÇIK |
| K4 | Rezervasyon AG'nin kendi sitesinden gelirse | Tanımlı değil | Tanımlı değil | Partner payı (%20) merkeze eklenir: taşıyıcı %70, merkez %30 | **EVET**, teyit |
| K5 | Özel transfer bildirimi | Her bildirim tek bir outbox olayından doğar (tasarım değişmezi 6) | "Doğrudan site sahibinin e-postasına" | Outbox olayı (`private.request_received.notify_site_owner`) üzerinden n8n ile anında gönderilir; form doğrudan e-posta atmaz | Hayır. Değişmezle uyumlu yorum |
| K6 | WhatsApp numarası | D-WA-20261102-01: dört AG uydu sitesi tek hattı paylaşır, site başına ayrı numara açılmaz | Her sitenin kendi WhatsApp numarası | `site.json` → `contact.whatsapp`. AG markalı sitelerde ortak hat yazılır, partner sitelerinde partnerin kendi numarası | Uyumlu: tek hat kuralı AG markalarına, ayrı numara partner sitelerine uygulanır. Teyit önerilir |
| K7 | Shuttle kapasitesi | En fazla 10 kişi; ana sitedeki "11" ifadesiyle fark açık (SEL-245/327) | — | Araç kapasitesi 10, grup üst sınırı tarifede 10 | Araç ruhsatı / koltuk teyidi |
| K8 | Shuttle hatları ve tarihleri | 4 hat iki yönde eşit fiyat; `RUNTIME_PRICE_AUTHORITY=UNVERIFIED` | — | `config/shuttle-tariff.example.json`: AYT/GZP ⇄ ALANYA, örnek | **EVET**: hat kodları ve geçerlilik tarihleri |
| K9 | Yönetim girişi | Kimlik sağlayıcı AÇIK; admin için 2FA zorunlu (SEL-332) | — | Geçici `AG_ADMIN_TOKEN`; tanımlı değilse admin uçları kapalı | Kimlik sağlayıcı seçimi |
| K10 | Rezervasyon veritabanı | Tek kaynak CRS PostgreSQL (`agos-reservation-postgres`); yeni rezervasyon deposu açılmaz | — | `MemoryStore` (yalnız yerel). `0001_network_core.sql` bir eşleme ADAYIDIR, uygulanmaz | Hayır. G1 sonrası SEL-331 eşlemesi |
| K11 | Yorumlar | Uydurma `aggregateRating`/`Review` yasak | Her sitede yorum paneli | Yalnız `verified: true` yorumlar gösterilir; yorum şeması yok; örnek sitede yorum yok (`[]`) | Hayır |

## Bilinen sınırlar (v0.1)

- Shuttle'da gidiş-dönüş tek formda alınmıyor: dönüş ayrı rezervasyon olarak yapılır (`shuttle_return_must_be_booked_separately`).
- İptal edilen shuttle rezervasyonu seferdeki koltuğu henüz boşaltmıyor.
- Sefer saat dilimi sabit 60 dakika. Uçuş saatine göre akıllı gruplama ve bekleme süresi kuralı yok.
- Haftalık kapanış, nakit/kart mahsubu ve ödeme kaydı (`agos-pool-finance`) henüz yok. Bugün yalnız pay satırları ve bakiye var.
- Turnstile ancak `TURNSTILE_SECRET` ve `turnstileSiteKey` tanımlanınca çalışır. Yerelde insan doğrulaması kapalıdır.
- Rate limit uygulama belleğindedir; çok süreçli üretimde edge (Cloudflare) kuralı gerekir.

## Durum etiketi

`LOCAL_ONLY` · `LIVE_CHANGED=NO` · `PRODUCTION_CHANGED=NO` · `AUTOMATION_ENABLED_NEW=NO`.
Bağımsız inceleme henüz yapılmadı. Yazan kendi işini kabul edemez (Linear kuralı).

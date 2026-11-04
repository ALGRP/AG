# AG Network — Teknik mimari, dosya yapısı ve yol haritası

> **Durum:** LOCAL_ONLY aday · 03.11.2026. Canlı sistemde, DNS'te, CRS veritabanında, ödemede veya müşteri mesajında hiçbir şey değişmedi.
> Linear kapıları aynen geçerli: G0 HOLD (SEL-324/326) → G1 (SEL-327/329) → G2.
> Bağlı kayıtlar: SEL-222 (Partner Economy / SaaS), SEL-88 (komisyon), SEL-197 (tedarikçi), SEL-281 (merkezi intake ve atıf), SEL-331 (CRS eşleme), SEL-332 (kimlik ve 2FA).
> Linear kararlarıyla çelişen ya da onay bekleyen maddeler: [KARARLAR-VE-CELISKILER.md](./KARARLAR-VE-CELISKILER.md).
> **K1 (03.11.2026):** ana site alanyagroup.com için hedef **Next.js + TypeScript** (SSG + gerektiğinde SSR, çok dil/bölge). **Partner uydu siteler statik HTML/SSG** (TypeScript build) + merkezi TypeScript/Node API. Kanonik kayıt mevcut CRS PostgreSQL. Her sitenin kendi markası, domaini ve reklam hesapları var. WordPress içerik ve SEO eşdeğerliği ayrı kapı. Google Ads, GA4/GTM ve Meta Pixel/CAPI entegrasyonları ayrı iş. Aşağıdaki bağımlılıksız SSG **yalnız partner uydu siteleri için build adayıdır**; ana Next.js sitenin yerine geçen nihai mimari değildir. Bu karar canlı siteleri hemen değiştirmez.

## 0. Özet

```
 10–20 uydu site (statik HTML, SSG)          Merkez (TypeScript / Node.js)
 ┌───────────────────────────┐   HTTPS    ┌──────────────────────────────────────────┐
 │ form.js (≈4 KB, defer)    │──POST────▶ │ Public API  /v1/public/*                 │
 │ shuttle fiyat önizleme    │──GET─────▶ │  origin allowlist · Turnstile · rate     │
 │ rezervasyon sorgulama     │──GET─────▶ │  limit · Idempotency-Key · fiyat sunucuda │
 └───────────────────────────┘            │                                          │
          ▲ build (SSG)                    │ BookingService (domain: @ag/core)        │
          │                                │   private/VIP ─▶ site sahibi + merkez    │
 sites/<id>/site.json + content/*.md       │   shuttle     ─▶ havuz (sefer) + merkez  │
 config/shuttle-tariff (merkezi tarife)    │                                          │
 reviews.json (merkezden doğrulanmış)      │ CRS PostgreSQL (tek gerçek kaynak)       │
                                           │   booking · shuttle_run · settlement_week│
                                           │   outbox_event ─▶ n8n ─▶ e-posta/WA      │
                                           │ Admin API /v1/admin/* (panel)            │
                                           └──────────────────────────────────────────┘
```

Temel ilke: **uydu siteler yalnız vitrindir; hiçbir şeye karar vermez.** Fiyat, rezervasyon durumu, komisyon ve yetki kararlarını merkez verir. Statik bir sayfa sır (secret) saklayamaz. Bu yüzden güvenlik form tarafında değil, merkez API'de kurulur.

## 1. Proje dosya yapısı (monorepo)

npm workspaces kullanılır. Node ≥ 22.18, TypeScript doğrudan çalışır (type stripping). Derleme adımı yoktur; `tsc` yalnız tip kontrolü yapar.

```
ag/
├─ packages/
│  ├─ core/            @ag/core — saf domain mantığı, bağımlılık yok, I/O yok
│  │  └─ src/ money · shuttle (tarife) · commission (20/10/70) · booking (durumlar)
│  │         site (site kaydı, origin çözümü) · intake (form doğrulama)
│  │         pool (shuttle sefer birleştirme) · settlement (K15 satırı, haftalık rapor, düzeltme)
│  ├─ ssg/             @ag/ssg — statik site üretici
│  │  ├─ src/ build · markdown · config · strings (TR/EN/DE) · cli
│  │  └─ assets/ style.css (inline + CSP hash) · form.js
│  └─ db/migrations/   PostgreSQL şema ADAYI (CRS eşlemesine kadar uygulanmaz)
├─ apps/
│  └─ api/             @ag/api — merkez HTTP API (node:http, framework yok)
│     └─ src/ service (iş akışı) · http (uçlar, CORS, rate limit) · store (depo arayüzü) · main
├─ sites/
│  └─ <site-id>/       site.json + content/<dil>/*.md + content/reviews.json
├─ config/             site kayıt defteri + shuttle tarifesi (örnek, DOĞRULANMADI)
└─ docs/
```

Neden bu yapı?

- **`core` saf kalır.** Fiyat, komisyon ve durum kuralları hem API'de hem SSG'de (fiyat tablosu) aynı koddan gelir; iki yerde iki ayrı fiyat oluşmaz. Birim testleri veritabanı olmadan saniyeler içinde koşar.
- **`store.ts` bir arayüzdür.** Bugün MemoryStore ile çalışır. G1 açılınca CRS PostgreSQL adaptörü yazılır ve servis kodu değişmez.
- **Siteler kod değil, veridir.** Yeni uydu site eklemek kod değişikliği istemez: `sites/<id>/` klasörü ve `config/sites.registry` satırı yeterlidir.
- **Yönetim paneli** (`apps/admin`) ilk sürümde yok. Admin API hazır; panel kimlik sağlayıcı ve 2FA kararından sonra yazılır (SEL-332). Linear'daki Next.js kararı (ADR-WEB-001) panel için de geçerli olabilir.

## 2. SSG ve SEO stratejisi

### 2.1 Üretim ve hız (Core Web Vitals)

- Her sayfa saf HTML'dir. Framework JS'i yoktur. Tek script `form.js` (~4 KB, `defer`) render'ı engellemez.
- CSS yaklaşık 3 KB'tır ve `<style>` içinde satır içi verilir. CSP'de `sha256` hash'iyle sabitlenir; `unsafe-inline` kullanılmaz.
- Sistem fontları kullanılır, harici font isteği yoktur. Form ilk ekrandadır, sonradan yüklenen içerik yoktur, bu yüzden CLS sıfıra yakındır.
- Her site için `_headers` dosyası üretilir: CSP, `X-Robots-Tag` (önizlemede), uzun önbellekli `/assets/*`. Cloudflare Pages ve Netlify bu biçimi doğrudan okur; Hetzner + Caddy'de aynı başlıklar yapılandırmaya taşınır.
- Ölçüm: hız iddiası yalnız ölçülmüş LCP/INP/CLS ile yapılır (Linear kararı). Her yayından önce Lighthouse CI çalıştırılır; sahadan CrUX ve GSC raporu izlenir.

### 2.2 İçerik yönetimi (bölge rehberleri, blog)

- İçerik `sites/<id>/content/<dil>/*.md` dosyalarındadır. Ön bilgide (frontmatter) şunlar bulunur: `title`, `description`, `h1`, `type` (home/route/guide/page/lookup), `translationKey`, `nav`, `updated`, `form`.
- **Kısa kodlar:** `{{booking_form}}`, `{{shuttle_prices}}` (merkezi tarifeden: 1–4 kişi rezervasyon toplamı, 5+ "talep üzerine"; tarife yoksa hiç basılmaz), `{{reviews}}` (yalnız doğrulanmış yorumlar), `{{lookup_form}}`.
- **Derleme kalite kapısı.** Şu durumlarda derleme durur:
  - title 60 karakteri aşarsa,
  - gövdede H1 varsa (H1 yalnız ön bilgiden gelir),
  - aynı URL iki kez üretilirse,
  - ana sayfa yoksa,
  - sayfa metninde, başlıkta ya da açıklamada elle yazılmış bir fiyat varsa (tek fiyat kaynağı kuralı; Owner kararı 03.11).

  Şu durumlarda uyarı verilir: description 140–155 aralığı dışındaysa, bilinmeyen kısa kod varsa, kırık iç link varsa.
- **Editör akışı:** önce Git + PR (önizleme derlemesi) kullanılır. Editör sayısı artarsa headless CMS eklenir; Payload mı WordPress içeriği mi sorusu Linear §8-2'de açık karardır. CMS yalnız Markdown/JSON üretir, SSG değişmez.
- **Özgünlük:** ortak olan yalnız şablondur. Her sitenin metni özgündür. Logo değiştirilmiş kopya site yasaktır (doorway riski). Domainler arası 5-gram Jaccard ≤ %15 iç eşiği CI'ya eklenecek. Toplu otomatik çeviri yoktur.

### 2.3 Otomatik güncelleme

| Tetikleyici | Ne olur |
| -- | -- |
| İçerik PR'ı birleşti | CI yalnız değişen siteleri derler (`build-manifest.json` sayfa hash'leri) ve yayınlar |
| Merkezde yeni tarife sürümü onaylandı | Merkez, derleme webhook'unu çağırır; tüm sitelerin fiyat tabloları yenilenir |
| Yeni doğrulanmış yorumlar | Merkez `reviews.json` dışa aktarır (yalnız tamamlanmış yolculuğa bağlı yorum), ilgili site derlenir |
| Gece | Güvenlik ağı olarak tam derleme; değişmeyen dosya yeniden yüklenmez |

Yayın hedefi önerisi: **site başına bir Cloudflare Pages projesi.** Özel alan adı, ücretsiz TLS ve `_headers` desteği vardır. Alternatif: Hetzner üzerinde Caddy ve site başına bir klasör.

### 2.4 Sitemap ve Search Console

- Yalnız `indexable: true` sitelerde `sitemap.xml` üretilir. Her URL `lastmod` (ön bilgideki `updated`) ve `xhtml:link` hreflang alternatiflerini taşır. `robots.txt` sitemap'i gösterir.
- Önizleme sitelerinde şunlar uygulanır: `noindex` meta, `X-Robots-Tag`, `Disallow: /` ve sitemap yok. Bir siteyi indekse açmak (`indexable: true`) **OWNER GO** ister.
- **Tek Google hesabından yönetim:** her site için GSC'de Domain mülkü açılır (DNS TXT doğrulaması). Merkezin servis hesabı her mülke kullanıcı olarak eklenir. Yayından sonra CI, Search Console API `sitemaps.submit` çağrısını yapar. Google'ın eski "sitemap ping" ucu 2023'te kapatıldı; kullanılmaz. Bing ve Yandex (RU pazarı) için IndexNow anahtarı site başına eklenecek.
- Şema (JSON-LD):
  - Ana sayfada `WebSite`.
  - Partner sitesinde kendi `TravelAgency` kaydı.
  - AG markalı sitede `publisher` → `alanyagroup.com/#organization`.
  - Rota sayfasında `Service`, alt sayfalarda `BreadcrumbList`.
  - **`aggregateRating`/`Review` şeması bilerek yok.** Uydurma puan yasaktır (AGNET-SEO §4).
- Footer'da siteler arası link ağı (mesh) yoktur. AG markalı uydu sitelerde yalnız tek satırlık marka beyanı vardır (AGNET-SEO §2). Partner sitelerinde Alanya Group linki ve AG'nin TÜRSAB belgesi yoktur; her üye kendi belgesini gösterir.

## 3. Rezervasyon ve API mimarisi

### 3.1 Güvenli aktarım

Statik formda sır tutulamaz. Bu yüzden form imzalanmaz; merkez her isteği şüpheli kabul eder:

1. **Origin allowlist.** `siteId` site kayıt defterinde aranır. `Origin` başlığı, o sitenin kayıtlı `https://` hostlarından biri olmalıdır.
2. **İnsan doğrulaması.** Cloudflare Turnstile jetonu sunucuda doğrulanır (`TURNSTILE_SECRET`). Bal küpü alanı (`website`) dolu gelirse istek reddedilir.
3. **Hız sınırı.** IP başına dakikada 20 public istek (uygulamada). Üretimde buna ek olarak Cloudflare WAF kuralı uygulanır.
4. **`Idempotency-Key` zorunludur.** Aynı anahtar ve aynı gövde aynı rezervasyonu döner. Aynı anahtar farklı gövdeyle gelirse 409 döner. Çift tıklama ya da ağ tekrarı ikinci kayıt açmaz.
5. **İstemciden fiyat kabul edilmez.** Shuttle fiyatı sunucuda onaylı tarife sürümünden hesaplanır ve rezervasyona dondurulur (`tariff_version_id`).
6. **Atıf yalnız bir iddiadır.** Origin, tarayıcı dışı istemcilerce taklit edilebilir. Bu yüzden partner payı ancak yolculuk tamamlanıp tahsil edildikten sonra doğar. Mükerrer parmak izi ve test kaydı pay doğurmaz.
7. **Sorgulama.** Rezervasyon kodu ve 24 baytlık erişim jetonuyla yapılır. Jeton veritabanında yalnız hash olarak tutulur. Eşleşmezse her durumda 404 döner (varlık sızdırılmaz).
8. **Outbox olaylarında kişisel veri yoktur.** İşçi (n8n), kaydı API üzerinden yeniden okur.

### 3.2 Akış: Shuttle (K15 — supplier collection)

```
form ─▶ POST /v1/public/bookings (product=shuttle, routeCode)
        ├─ fiyat = tarife(hat, tarih, kişi) — rezervasyon TOPLAMI: 1 kişi 30 € · 2 kişi 50 € · 3 kişi 60 € · 4 kişi 70 €
        │          5+ kişi → otomatik fiyat yok; "fiyat onayı gerekli" (K17), admin approve-price
        ├─ hat kodu tarifeden (K8): AYT-ALN, ALN-AYT, AYT-SID … GZP-ALN (pilot); AYT↔GZP yok
        ├─ havuz: aynı hat + saat dilimindeki EN DOLU açık sefere eklenir; dolunca yeni araç — aşırı doluluk yok
        └─ outbox: merkeze yeni iş · site sahibine bilgi · müşteriye "talebiniz alındı"
panel ─▶ confirm ─▶ sefere TEDARİKÇİ ata ─▶ tedarikçi müşteriden TAHSİL EDER (kısmi olabilir, fiş/dekont no ile) ─▶ sefer tamamlandı
        └─ rezervasyon satırı (Owner alan listesi): satış 50 € → site 10 € · AGOS 5 € · tedarikçi hak edişi 35 €
           tedarikçi → siteye 10 €, tedarikçi → AGOS'a 5 € (ayrı alacaklar)
           site kendi aracıyla (yetkisi doğrulanmışsa): site payı 0, AGOS 5 €, hak ediş 45 €
```

Kurallar (`packages/core/src/settlement.ts`, `commission.ts`):

- **Tek kaynak:** `SHUTTLE_SPLIT_V1` = 2000 / 1000 / 7000 baz puan. Kod, rapor ve veritabanı aynı değeri kullanır; bir test, SQL seed'inin koddaki değerle aynı olduğunu doğrular.
- **alanyagroup.com** da bir satış kanalıdır: %20 payı `alanya-group` tarafına yazılır.
- Tutarlar tam sayı cent; site ve tedarikçi payı aşağı yuvarlanır, kuruş farkı AGOS'a kalır. Üç pay her zaman satış tutarına eşittir (veritabanı CHECK).
- **T2 (taslak): komisyon yalnız fiilen tahsil edilen tutar üzerinden**, fiyatla sınırlı. 50 € işte 30 € tahsil → 6/3/21; kalan 20 € tahsil edilince +4/+2/+14. Kalan tutar "müşteri borcu" listesinde, ödemeye girmez.
- Her tahsilat ayrı hareket (`booking_money_event`), rezervasyon başına **tekil referans**. Tahsil eden ve ilk yöntem değişmez (kod + DB trigger). Shuttle'da tahsil eden yalnız tedarikçidir (kod + DB CHECK). Yöntem sitenin izin verdiği listede olmalıdır: nakit, POS, havale/EFT.
- **T1 (taslak):** fazla tahsilat kaydedilir; pay fiyatı aşmaz, fazlası müşteriye iade listesine düşer.
- **K17 (taslak):** 5+ kişi fiyatı yalnız hattın Owner onaylı min/max sınırı içinde, admin/finance_manager + **2FA** ile, gerekçe ve denetim kaydıyla onaylanır. HTTP statik token 2FA'sız olduğu için bu onay HTTP üzerinden kapalıdır.
- **K8 (taslak):** her hat için kapsam ve aktif/pasif zorunlu; pasif hatta fiyat yok.

### 3.3 Akış: Özel / VIP (K15)

```
form ─▶ API ─▶ fiyat = sitenin kendi satış fiyatı (varsa), outbox: site sahibine e-posta · merkez · müşteri
site kararı (iş başına):
   self  ─▶ kendi aracı (yalnız yetkisi doğrulanmış site) — tamamı sitede, AGOS 0
   pass  ─▶ tedarikçi + HAK EDİŞİ SİTE BELİRLER (ör. 80 € satışta 47,50 €)
   pool  ─▶ bu sürümde yok (şoför teklif akışı ayrı iş)
tahsilat: müşteri tedarikçiye öderse → tedarikçi siteye (satış − hak ediş) = 32,50 € aktarır
          müşteri siteye öderse     → site tedarikçiye hak edişi (47,50 €) aktarır
AGOS ek private/VIP işlem komisyonu: 0 €
```

"Site sahibinin e-postasına doğrudan düşer" isteği **outbox olayıyla** karşılanır: tekil, tekrar denenebilir, teslim takipli.

### 3.3.1 Haftalık hesap kapanışı (K15)

| Kural | Uygulama |
| -- | -- |
| Hesap dönemi | ISO hafta (`2026-W45`), Pazartesi 00:00 – Pazar 23:59 Europe/Istanbul; önerilen son tarih Salı 18:00 |
| Neler hesaplanır | **Fark modeli (T1/T2 taslak):** her tamamlanmış ve durdurucu istisnası olmayan iş için `pay(hafta sonuna kadarki net tahsilat, fiyatla sınırlı) − pay(önceki kapanışlardaki taban)` → `settlement_entry`. Kısmi tahsilat, geç tahsilat ve iade aynı formülle, çift sayım olmadan. Test rezervasyonu hiç girmez |
| İstisna listesi | Durduran: iptal, tahsilat sonrası iptal, itiraz, mükerrer şüphesi (çözülene kadar her hafta listede). Durdurmayan: fazla tahsilat (müşteriye iade tutarıyla). Kalan müşteri borçları ayrı liste. Çözüm uçları: `resolve-dispute`, `clear-duplicate` |
| Kapanış | Hafta bitmeden yapılamaz, **bir kez** ve **sırayla** yapılır. Kapanmış hafta dondurulmuş görüntüdür; rezervasyonun son hesap haftası yalnız ileri gider (DB trigger) |
| Dekont eşleştirme | Dekont = hafta + ödeyen + alacaklı + tutar + banka referansı + amaç (`settlement` / `subscription` / `overpayment_refund`). Aynı dekont iki kez girilemez. Durumlar: ödendi / kısmi / ödenmedi / fazla ödeme / alacak (iade edilecek) / borç yok; eşleşmeyen dekontlar ayrı listelenir |
| Gecikme | Salı 18:00 geçince kalan borç "gecikmiş" olur; son tarihten sonra yapılan ödeme "geç ödendi" olarak listelenir; iade sonrası alacaklının geri ödeyeceği tutar "geri ödenecek" olarak görünür |
| Düzeltme | Eski hafta silinmez ve değişmez. İade sonrası yeniden hesap otomatik: sonraki haftada negatif `refund_correction` fark kaydı (kümülatif; yuvarlama birikmez). İade referansı tekildir. Elle düzeltmeler: itiraz kararı (`dispute_decision`) ve mahsup (`offset`, **yazılı onay referansı** + 2FA zorunlu, T1 taslak); ikisi de sonraki açık haftaya yazılır |
| İtiraz (T3 taslak) | Ekstre iletimi kaydedilir (ilk iletim geçerli). İtiraz `ITZ-<hafta>-NNNN`; süre iletimden 7 gün; süre dışı itiraz otomatik reddedilmez. Karar: 2FA'lı yetkili, gerekçeli, bir kez; kabul edilen fark sonraki açık döneme |
| SaaS | 200 €/ay abonelik ayrı tablolarda ve raporda ayrı bölümde; abonelik dekontları (`purpose: subscription`) komisyon borçlarıyla eşleştirilmez |
| Para hareketi | **Yok.** Sistem yalnız hesaplar ve rapor üretir. Canlı ödeme, banka transferi ve otomatik borç tahsilatı Owner GO ister (`payout_execution` sabit) |

**Raporlar:** `npm run report:sample` komutu sentetik bir haftayı uçtan uca çalıştırır ve `docs/ornek-hafta-2026-W45.html` dosyasını üretir. Dosyada şunlar var:
1. tedarikçi hesap ekstreleri
2. site komisyon alacakları
3. AGOS sistem payları
4. ödeme ve dekont eşleştirme
5. borç ve ihtilaf listesi
6. istisnalar
7. düzeltmeler
8. SaaS abonelikleri

### 3.3.2 Para hareketleri ayrı tutulur

| Hareket | Kimden → kime | Sistemdeki yeri |
| -- | -- | -- |
| Shuttle bileti / private satış | Müşteri → tedarikçi (private'ta site de olabilir) | Rezervasyon tahsilat alanları (bir kez) |
| Site komisyonu, AGOS payı | Tedarikçi → site, tedarikçi → AGOS | Haftalık borçlar + dekontlar |
| Private hak edişi | Site → tedarikçi (müşteri siteye ödediyse) | Haftalık borçlar |
| 200 €/ay SaaS aboneliği | Site sahibi → Alanya Group | `subscription_plan` / `subscription_invoice` (ayrı) |
| 40 €/gün Google Ads | Site sahibi → Google | Sistemde AGOS geliri olarak **yok** |

### 3.4 API uçları (bugün çalışan)

| Uç | Açıklama |
| -- | -- |
| `POST /v1/public/bookings` | Uydu site formu. `Idempotency-Key` başlığı zorunlu |
| `GET /v1/public/bookings/:ref` | Müşteri sorgulama (`X-Lookup-Token`) |
| `GET /v1/public/shuttle-quote?route&date&passengers` | Fiyat önizleme (5 dk önbellek); 5+ kişide `requiresApproval` |
| `GET /v1/admin/bookings` | Rezervasyonlar ve her birinin K15 alanları (`settlement`) |
| `POST /v1/admin/bookings/:ref/confirm` | `request → confirmed` (fiyatsız shuttle onaylanamaz) |
| `POST /v1/admin/bookings/:ref/approve-price` | 5+ kişilik shuttle fiyatı: hat sınırı + 2FA + rol + gerekçe (HTTP'de statik token 2FA'sız → `mfa_required`) |
| `POST /v1/admin/shuttle-runs/:id/assign` | Sefere tedarikçi ata (`supplierId`); kendi aracı yalnız doğrulanmış site |
| `POST /v1/admin/shuttle-runs/:id/complete` | Seferi tamamla (`completed_at`) |
| `POST /v1/admin/bookings/:ref/assign` | Private/VIP: `self` / `pass` + `supplierEntitlementMinor` (`pool` → 501) |
| `POST /v1/admin/bookings/:ref/complete` | Private/VIP işi tamamla |
| `POST /v1/admin/bookings/:ref/collection` | Müşteri tahsilatı (kısmi olabilir): yöntem, tahsil eden, tutar, tekil `reference` |
| `POST /v1/admin/bookings/:ref/refund` | Müşteriye iade (`refundReference` zorunlu, tekil; net tahsilatı aşamaz). Yeniden hesap sonraki kapanışta |
| `POST /v1/admin/bookings/:ref/resolve-dispute` | İtiraz sonucu (`upheld` / `rejected`) |
| `POST /v1/admin/bookings/:ref/clear-duplicate` | Mükerrer şüphesini incelemeden sonra kaldır |
| `POST /v1/admin/bookings/:ref/dispute` | İtiraz kaydı |
| `POST /v1/admin/bookings/:ref/cancel` | İptal; tahsil edilmiş tutar varsa `finance.refund_due` |
| `POST /v1/admin/bookings/:ref/invoice` | Fatura referansı (bir kez) |
| `POST /v1/admin/receipts` | Banka dekontu (`purpose`: settlement / subscription / overpayment_refund; yalnız eklenir, tekrar engelli) |
| `POST /v1/admin/settlements/:week/statement-sent` | Ekstrenin tarafa iletildiği an (`partyId`; ilk kayıt geçerli) |
| `POST /v1/admin/settlements/:week/disputes` | Kapanmış haftaya itiraz (`raisedBy`, `reason`, `category`) |
| `POST /v1/admin/settlements/disputes/:id/decide` | İtiraz kararı (2FA'lı yetkili; HTTP'de kapalı) |
| `POST /v1/admin/settlements/offsets` | Mahsup (yazılı onay referansı + 2FA; HTTP'de kapalı) |
| `GET /v1/admin/settlements/:week` | Hafta raporu (canlı ya da kapanmış haftanın anlık görüntüsü + güncel dekontlar) |
| `POST /v1/admin/settlements/:week/close` | Haftayı kapat (hafta bitince, bir kez, sırayla) |
| `GET /v1/admin/outbox` | Bekleyen bildirim olayları |

Admin uçları şimdilik `AG_ADMIN_TOKEN` ile korunur; değişken tanımlı değilse tamamen kapalıdır. **Bu geçicidir.** Gerçek giriş kimlik sağlayıcı ve zorunlu 2FA ile yapılacak (SEL-332, açık karar).

## 4. Geliştirme yol haritası

| # | Adım | Durum | Çıkış ölçütü |
| -- | -- | -- | -- |
| 0 | Kesinleşenler: shuttle 30/50/60/70, 20/10/70 (alanyagroup.com dahil), K15 supplier collection + haftalık kapanış, private/VIP hak edişini site belirler, 200 €/ay. **03.11 taslağı (T1/T2/T3/K17/K8/K1) Owner kabulü bekliyor.** Açık: K17 sayısal sınırlar, K8 kapsam onayı, private/VIP kısmi tahsilat orantısı | KISMEN AÇIK | Linear'da KARAR olarak işaretli |
| 1 | **Domain çekirdeği** (`@ag/core`): tarife, 20/10/70, K15 hesap satırı ve haftalık rapor, durum modeli, havuz, sunum ekonomisi | **LOCAL_ONLY · bu PR** | 44 birim testi geçer (core 23 + settlement 21) |
| 2 | **Merkez API'si**: intake, havuz, tahsilat, dekont, kapanış, düzeltme uçları | **LOCAL_ONLY · bu PR** | 23 API testi ve tarayıcıda uçtan uca form testi geçer |
| 3 | **SSG** ve örnek partner sitesi (EN/TR, noindex) | **LOCAL_ONLY · bu PR** | 11 SSG testi geçer, mobil 390 px'de yatay kaydırma yok |
| 4 | CRS eşlemesi: G1 erişimiyle şema dökümü, `0001` adayının CRS tablolarına eşlenmesi, `PgStore` adaptörü | G1 bekliyor (SEL-329/331) | 13 backend sözleşmesi (white-label SaaS v1) gerçek DB'de geçer |
| 5 | Outbox işçisi → n8n: site sahibi e-postası, merkez, müşteri onayı; domain başına SPF/DKIM | G2 | Test alıcısına tekil gönderim, teslim kanıtı |
| 6 | Yönetim paneli MVP: rezervasyonlar, sefer atama, defter, site/partner kaydı; IdP + 2FA | SEL-332 kararı | Admin yalnız 2FA'lı oturumda |
| 7 | İlk partner pilotu: 1 site, alt alan adı, noindex önizleme → OWNER GO → özel alan adı (TXT) → GSC → sitemap | Kapılar | TÜRSAB kanal bildirimi ve sözleşme hazır |
| 8 | K15 haftalık kapanış, raporlar, dekont eşleştirme | **LOCAL_ONLY · bu PR** (yalnız hesap ve rapor) | Testler + örnek rapor + DB probları (`packages/db/probes`) + bağımsız QA ([rapor](./K15-QA-VE-KARAR-RAPORU.md)) |
| 8b | Banka/dekont içe aktarma, abonelik faturası, gerçek ödeme ve borç takibi | **Owner GO** + hukuk/mali müşavir | Tahsilatın hukuki sorumlusu, fatura ve vergi netleşmiş |
| 9 | 10–20 siteye ölçekleme: CI derleme matrisi, Lighthouse CI, Jaccard kontrolü, IndexNow | — | Her site için ayrı yayın ve geri alma |

**İlk modül neden çekirdek?** Para, durum ve komisyon kuralları her şeyin altında durur. Kurallar yanlışsa form, panel ve site doğru çalışsa bile para yanlış dağılır. Bu yüzden önce saf, testli `@ag/core` yazıldı. API ve SSG bu kodun üstüne kuruldu.

## 5. Yerel çalıştırma

```bash
npm install
npm run check                                  # tsc + testler
npm run report:sample                          # sentetik hafta → docs/ornek-hafta-2026-W45.html
AG_ADMIN_TOKEN=yerel-anahtar npm run dev:api   # http://127.0.0.1:8787
npm run build:sites                            # dist/sites/<id>/
npx serve -l 4321 dist/sites/ornek-alanya-transfer   # veya herhangi bir statik sunucu
```

Yerel önizleme origin'i (`http://localhost:4321`), `AG_DEV_ORIGINS` ile API'ye tanıtılır. Üretimde bu liste boş olmalıdır.

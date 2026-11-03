# AG Network — Teknik mimari, dosya yapısı ve yol haritası

> **Durum:** LOCAL_ONLY aday · 03.11.2026. Canlı sistemde, DNS'te, CRS veritabanında, ödemede veya müşteri mesajında hiçbir şey değişmedi.
> Linear kapıları aynen geçerli: G0 HOLD (SEL-324/326) → G1 (SEL-327/329) → G2.
> Bağlı kayıtlar: SEL-222 (Partner Economy / SaaS), SEL-88 (komisyon), SEL-197 (tedarikçi), SEL-281 (merkezi intake ve atıf), SEL-331 (CRS eşleme), SEL-332 (kimlik ve 2FA).
> Linear kararlarıyla çelişen ya da onay bekleyen maddeler: [KARARLAR-VE-CELISKILER.md](./KARARLAR-VE-CELISKILER.md).

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
                                           │   booking · shuttle_run · ledger_entry   │
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
│  │  └─ src/ money · shuttle (tarife) · commission (70/20/10) · booking (durumlar)
│  │         site (site kaydı, origin çözümü) · intake (form doğrulama)
│  │         pool (shuttle sefer birleştirme) · ledger (pay kayıtları, ters kayıt)
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

### 3.2 Akış: Özel / VIP

Site başına iki model vardır (`privateMode`, bkz. K12):

**a) `pass_to_network` — Partner Sunumu V3 (varsayılan)**
```
form ─▶ POST /v1/public/bookings (product=private|vip)
        ├─ fiyat = site sahibinin satış fiyatı (ör. private 80 €, VIP 120 €), rezervasyonda dondurulur
        ├─ pass  = merkezi pass politikası (ör. 47,50 € / 60 €), rezervasyonda dondurulur
        └─ outbox: site sahibine bilgi (e-posta) · merkeze yeni iş · müşteriye "talebiniz alındı"
panel ─▶ confirm ─▶ complete {araç, araç hak edişi ≤ pass, tahsil edildi mi}
        └─ defter: site = satış − pass (32,50 €) · araç = hak ediş · merkez = pass − hak ediş
```
Pass, AG'nin net kârı değildir: araç hak edişi ve operasyon gideri bu tutardan karşılanır (sunum, slayt 8). Satış fiyatı pass'ın altındaysa sistem satışı kabul etmez. Araç hak edişi pass'ı aşarsa iş tamamlanmış sayılmaz.

**b) `self_operate` — site sahibi operasyonu kendisi yapar**
```
form ─▶ API ─▶ fiyatsız talep (status=request, operasyon sahibi = site sahibi)
        └─ outbox: site sahibinin e-postası (anında) · merkez · müşteri
```

Her iki modelde de "site sahibinin e-postasına doğrudan düşer" isteği, formun e-posta atmasıyla değil **outbox olayıyla** karşılanır. Gecikme saniyeler düzeyindedir. Gönderim tekildir, tekrar denenir ve teslim durumu izlenir. Merkez aynı kaydı görür.

### 3.2.1 Para hareketleri ayrı tutulur (sunum, slayt 16)

| Hareket | Kimden → kime | Sistemdeki yeri |
| -- | -- | -- |
| 200 €/ay SaaS aboneliği | Site sahibi → Alanya Group | `subscription_plan` / `subscription_invoice` |
| 40 €/gün Google Ads | Site sahibi → Google | Sistemde AG geliri olarak **yok** |
| İş başına satış / pass / shuttle payı | Müşteri → site / AG / araç | `ledger_entry` (kayıtlar silinmez) |

`@ag/core` içindeki `partnerMonth`, `breakEvenUnits`, `centreMonth` ve `centreBreakEvenSites` fonksiyonları sunumdaki senaryoları birebir üretir; testler slayt 10–15'teki tüm rakamları sabitler. Yönetim paneli ve satış görüşmeleri aynı formülü kullanmalıdır. Sonuçlar kazanç garantisi veya net kâr değildir.

### 3.3 Akış: Shuttle havuzu

```
form ─▶ POST /v1/public/bookings (product=shuttle, routeCode)
        ├─ fiyat = tarife(hat, tarih, kişi) — rezervasyon TOPLAMI (Owner kararı 03.11):
        │          1 kişi 30 € · 2 kişi 50 € · 3 kişi 60 € · 4 kişi 70 €
        │          5+ kişi → otomatik fiyat yok; "fiyat onayı gerekli", admin approve-price
        ├─ havuz: aynı hat + aynı saat dilimi (60 dk) içindeki EN DOLU açık sefere eklenir;
        │         koltuk biterse aynı dilimde yeni sefer (yeni araç) açılır — aşırı doluluk yok
        └─ outbox: shuttle.booking_received.notify_central (+ site sahibine bilgi, + müşteri)

panel ─▶ confirm (request→confirmed) ─▶ assign run (taşıyıcı) ─▶ complete run (tahsil edilenler)
        └─ her rezervasyon için, yalnız delivered + paid + fiyatı var + test değil + mükerrer değil ise,
           SATIŞ TUTARI üzerinden ayrı satırlar:
           ledger_entry  carrier  %70   (tedarikçi)
                         partner  %20   (kaynak partner sitesiyse)
                         platform %10   (+ kaynak AG'nin kendi sitesiyse %20 de merkeze)
```

Komisyon mantığı (`packages/core/src/commission.ts`, `ledger.ts`):

- Oranlar sürümlü bir **politika**dır (`shuttle-split-v1` = 7000/2000/1000 baz puan). Kodda dağınık sabit yoktur; her pay satırı kullandığı politikanın id'sini taşır. Toplam %100 değilse politika reddedilir; bu kural veritabanında CHECK ile de korunur.
- Hesaplama tam sayı cent üzerinden yapılır. Taşıyıcı ve partner payı aşağı yuvarlanır, kuruş farkı merkeze kalır. Üç pay her zaman matrahın tamamına eşittir.
- **Matrah** (KDV, indirim, ödeme komisyonu, iade) açık karardır. Fonksiyon matrahı dışarıdan alır; bugün rezervasyonun dondurulmuş fiyatıdır.
- Defter satırları değişmez ve silinmez; veritabanında trigger bunu engeller. Ödemeden sonra iptal edilirse her satıra **bir kez** ters kayıt açılır (`reverses_entry_id UNIQUE`).
- Bakiyeler parti × para birimi bazında tutulur. Haftalık kapanış ve nakit/kart mahsubu `agos-pool-finance` kurallarıyla bir sonraki adımda eklenecek.

### 3.4 API uçları (bugün çalışan)

| Uç | Açıklama |
| -- | -- |
| `POST /v1/public/bookings` | Uydu site formu. `Idempotency-Key` başlığı zorunlu |
| `GET /v1/public/bookings/:ref` | Müşteri sorgulama (`X-Lookup-Token`) |
| `GET /v1/public/shuttle-quote?route&date&passengers` | Fiyat önizleme (5 dk önbellek) |
| `GET /v1/admin/bookings` | Son 100 rezervasyon |
| `POST /v1/admin/bookings/:ref/approve-price` | 5+ kişilik shuttle için fiyat onayı (tek seferlik, tarife para birimiyle) |
| `POST /v1/admin/bookings/:ref/confirm` | `request → confirmed` (sürüm kontrollü; fiyatsız shuttle onaylanamaz) |
| `POST /v1/admin/bookings/:ref/complete` | Pass modelindeki özel/VIP işi tamamla: araç, hak ediş (≤ pass), tahsilat → defter |
| `POST /v1/admin/shuttle-runs/:id/assign` | Sefere taşıyıcı ata |
| `POST /v1/admin/shuttle-runs/:id/complete` | Tamamla, tahsil edilenleri işaretle, payları deftere yaz |
| `GET /v1/admin/ledger/balances` | Parti × para birimi bakiyeleri |
| `GET /v1/admin/outbox` | Bekleyen bildirim olayları |

Admin uçları şimdilik `AG_ADMIN_TOKEN` ile korunur; değişken tanımlı değilse tamamen kapalıdır. **Bu geçicidir.** Gerçek giriş kimlik sağlayıcı ve zorunlu 2FA ile yapılacak (SEL-332, açık karar).

## 4. Geliştirme yol haritası

| # | Adım | Durum | Çıkış ölçütü |
| -- | -- | -- | -- |
| 0 | Owner kararları: SSG teknolojisi (K1), 70/20/10 matrahı, AG kaynaklı iş (K4), shuttle hatları (K8), özel/VIP modeli (K12), shuttle fiyat birimi (K13), araç hak edişi (K14), tahsilat yönü (K15). Ücret netleşti: 200 €/ay (K2) | KISMEN AÇIK | Linear'da KARAR olarak işaretli |
| 1 | **Domain çekirdeği** (`@ag/core`): tarife, 70/20/10, pass modeli, durum modeli, havuz, defter, sunum ekonomisi | **LOCAL_ONLY · bu PR** | 24 birim testi geçer (Owner örnek rezervasyonları dahil) |
| 2 | **Merkez intake API'si**: origin, idempotency, outbox, havuz, pass, admin uçları | **LOCAL_ONLY · bu PR** | 10 API testi ve tarayıcıda uçtan uca form testi geçer |
| 3 | **SSG** ve örnek partner sitesi (EN/TR, noindex) | **LOCAL_ONLY · bu PR** | 10 SSG testi geçer, mobil 390 px'de yatay kaydırma yok |
| 4 | CRS eşlemesi: G1 erişimiyle şema dökümü, `0001` adayının CRS tablolarına eşlenmesi, `PgStore` adaptörü | G1 bekliyor (SEL-329/331) | 13 backend sözleşmesi (white-label SaaS v1) gerçek DB'de geçer |
| 5 | Outbox işçisi → n8n: site sahibi e-postası, merkez, müşteri onayı; domain başına SPF/DKIM | G2 | Test alıcısına tekil gönderim, teslim kanıtı |
| 6 | Yönetim paneli MVP: rezervasyonlar, sefer atama, defter, site/partner kaydı; IdP + 2FA | SEL-332 kararı | Admin yalnız 2FA'lı oturumda |
| 7 | İlk partner pilotu: 1 site, alt alan adı, noindex önizleme → OWNER GO → özel alan adı (TXT) → GSC → sitemap | Kapılar | TÜRSAB kanal bildirimi ve sözleşme hazır |
| 8 | Abonelik faturası (200 €/ay), haftalık kapanış, tahsilat yönüne göre mahsup (K15), ödemeler | K15 kararı | Defter mutabakatı tutar |
| 9 | 10–20 siteye ölçekleme: CI derleme matrisi, Lighthouse CI, Jaccard kontrolü, IndexNow | — | Her site için ayrı yayın ve geri alma |

**İlk modül neden çekirdek?** Para, durum ve komisyon kuralları her şeyin altında durur. Kurallar yanlışsa form, panel ve site doğru çalışsa bile para yanlış dağılır. Bu yüzden önce saf, testli `@ag/core` yazıldı. API ve SSG bu kodun üstüne kuruldu.

## 5. Yerel çalıştırma

```bash
npm install
npm run check                                  # tsc + 44 test
AG_ADMIN_TOKEN=yerel-anahtar npm run dev:api   # http://127.0.0.1:8787
npm run build:sites                            # dist/sites/<id>/
npx serve -l 4321 dist/sites/ornek-alanya-transfer   # veya herhangi bir statik sunucu
```

Yerel önizleme origin'i (`http://localhost:4321`), `AG_DEV_ORIGINS` ile API'ye tanıtılır. Üretimde bu liste boş olmalıdır.

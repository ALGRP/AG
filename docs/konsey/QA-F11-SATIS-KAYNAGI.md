# QA-F11 · Satış kaynağı doğrulaması (Codex Paket-02, 5. bölüm)

**Tarih:** 04.11.2026 · **Hazırlayan:** Claude · **Durum:** `LOCAL_ONLY · INDEPENDENT_HUMAN_ACCEPTED=NO · G0 HOLD`
**Taban:** PR #9 `fe14851` (+ Claude inceleme commit'i). Gerçek Turnstile anahtarı, reklam hesabı veya canlı site yok.

## 1. Sorun (inceleme)

- `POST /v1/public/bookings` rezervasyonu gövdedeki `siteId`'ye yazar. Tek kontrol, `Origin` başlığının o sitenin alan adlarından biri olması (A10.1).
- Tarayıcı dışı bir istemci `Origin`'i serbestçe yazabilir. Herhangi bir site adına rezervasyon (ve gelecekteki %20 komisyon) açılabilir (A10.2, `todo`).
- `apps/api/src/main.ts` `verifyHuman` Cloudflare siteverify yanıtında yalnız `success` alanına bakıyor; yanıttaki `hostname` talep edilen siteyle karşılaştırılmıyor. Başka bir sitede alınmış geçerli bir belirteç de kabul edilir.
- `TURNSTILE_SECRET` yoksa (yerel) insan kontrolü tamamen kapalı.
- İyi haber (bu turda doğrulandı, A10.8 koruma testi): gövdedeki `utm_source`, `gclid`, `referrer`, `attribution`, `sellingSiteId` alanları satışı başka siteye taşımıyor.

## 2. Kural

- **Atıf kanıtı = sunucuda doğrulanmış, alan adına bağlı insan kontrolü.** `Origin` yalnız tarayıcı CORS denetimi; tek başına atıf kanıtı değildir.
- Reklam ve pazarlama verisi (utm, gclid, fbclid, referrer) yalnız ölçüm verisidir; **asla** satış sitesi, komisyon veya yetki belirlemez.
- `verifyHuman(token, ip)` → `{ ok: boolean; hostname?: string }`. `ok` ve `hostname ∈ site.domains` değilse 403 `attribution_not_verified`.
- Yerel / test modu: belirteç yine zorunlu. Sahte doğrulayıcı yalnız `local:<alan adı>` biçimindeki belirteci kabul eder ve o alan adını döner. Belirteçsiz istek reddedilir. `TURNSTILE_SECRET` yokken "her şeyi kabul et" davranışı kalkar.
- Üretim kapısı (`main.ts`) değişmez: kimlik sağlayıcı ve canlı onay olmadan sunucu üretimde açılmaz.

## 3. Kabul testleri

Kural: `todo` kaldırılır, assertion değişmeden geçer. Harness'teki sahte doğrulayıcı değişikliği **fikstür değişikliğidir**; commit mesajında ayrıca belirtilir.

| Test | Dosya | Ne doğrular | Bugün |
| -- | -- | -- | -- |
| A10.1 | `qa-independent/a10-attribution.test.ts` | Başka sitenin `Origin`'i, http ve başlıksız istek → 403 | geçiyor |
| A10.2 | aynı | Tarayıcı dışı istemci, sahte `Origin` ile partner-site'a satış yazdıramaz | `todo` |
| **A10.8** (yeni) | aynı | Gövdedeki pazarlama ve atıf alanları satışı taşımaz | geçiyor (koruma testi) |
| A10.9 (Paket-02'de yazılır) | aynı | `local:www.rival.example` belirteciyle partner-site adına istek → 403 `attribution_not_verified` | — |
| A10.10 (Paket-02'de yazılır) | aynı | `local:www.partner.example` belirteci ve partner `Origin` → 201, `siteId = partner-site` | — |

Yan etki: `qa-independent/` ve `apps/api/src/api.test.ts` içindeki tüm başarılı rezervasyon çağrıları yeni sahte belirteci kullanmalı. Harness'in `book()` yardımcısı belirteci otomatik eklerse mevcut assertion'lar değişmez.

## 4. Dosyalar

| Dosya | Değişiklik |
| -- | -- |
| `apps/api/src/service.ts` | `ServiceDeps.verifyHuman` dönüş tipi; `submit` içinde hostname ∈ site.domains kontrolü |
| `apps/api/src/main.ts` | siteverify yanıtından `hostname`; `TURNSTILE_SECRET` yokken yerel sahte doğrulayıcı (yalnız `development/test`) |
| `qa-independent/harness.ts`, `apps/api/src/api.test.ts` | sahte doğrulayıcı ve otomatik `local:<alan adı>` belirteci (fikstür) |
| `apps/sites` / SSG şablonu | Turnstile site anahtarı site başına; bu pakette yalnız yapılandırma alanı, gerçek anahtar yok |

## 4a. Başlık saldırıları ve belirteç ayrıntıları (inceleme ek)

Kod okuması (`apps/api/src/http.ts` satır ~93–125, `packages/core/src/site.ts` `resolveSite`):

| Yüzey | Bugün | Kural |
| -- | -- | -- |
| `Origin` | Sitenin alan adlarından biri olmalı; tarayıcı dışında serbestçe yazılabilir | CORS için kalır; atıf kanıtı değildir |
| `Host`, `X-Forwarded-Host`, `Referer` | Kullanılmıyor | Kullanılmaya **başlanmamalı**; A10.11 bunu korur |
| `devOrigins` (`AG_DEV_ORIGINS`, varsayılan `http://localhost:4321`) | `resolveSite` bu kökenlerden **her** `siteId`'yi kabul ediyor | Yalnız `NODE_ENV=development/test`; başka modda boş liste. Yerelde de belirteç alan adı kontrolü geçerli |
| `trustProxyHeader` | Ayarlıysa istemci IP'si bu başlıktan okunuyor | Yalnız güvenilir ters vekil arkasında. Aksi hâlde istemci IP'sini uydurup hız sınırını ve Turnstile `remoteip`'i atlatabilir |
| Turnstile yanıtı | Yalnız `success` | `success === true` **ve** `hostname ∈ site.domains` **ve** `action === "booking"`. İsteğe bağlı: `cdata === siteId` |
| siteverify ağ hatası veya zaman aşımı | `fetch` hatası işlenmemiş | **Kapalı başarısızlık:** 403 `human_check_failed`; kabul yok. Zaman aşımı ≤ 5 sn |
| Belirteç tekrarı | Cloudflare belirteci tek kullanımlık doğrular | Ek olarak aynı belirtecin özeti 10 dakika saklanır; ikinci kullanım 403 (kendi tarafımızda da tekrar yok) |

Ek kabul testleri (Paket-02'de yazılır; assertion bu metinle aynı):
- **A10.11:** partner `Origin` + geçerli `local:www.partner.example` belirteci ile, `Host: www.rival.example`, `X-Forwarded-Host: www.rival.example`, `Referer: https://www.rival.example/` başlıkları gönderilse de rezervasyon `partner-site` olur; `Origin` rival iken ise 403.
- **A10.12:** sahte doğrulayıcı ağ hatası fırlatırsa (veya zaman aşımı) → 403, rezervasyon yok.
- **A10.13:** aynı belirteç ikinci istekte → 403, yalnız ilk rezervasyon var.
- **A10.14:** `NODE_ENV` yerel değilken `devOrigins` boş; `http://localhost:4321` kökeni → 403 (`main.ts` üretim kapısı zaten kapalı; bu birim düzeyinde test edilir).

## 5. Kapsam dışı

Gerçek Turnstile veya reklam hesapları, gclid/fbclid ile dönüşüm gönderimi, KVKK rıza akışı (H-15), reklam API'leri. Hepsi HOLD.

## 6. Sonraki sıra

1. PKG-F04b · nakitsiz kredi (H-25 açık; kredi yalnız müşteri borcunu kapatır, taraflar arası para kaydı yok).
2. QA-F4 · DB kısıtları (35 prob), ayrı paket.

# QA-F3 · Kiracı izolasyonu: inceleme ve uygulama şartnamesi (Codex Paket-02, 2. bölüm)

**Tarih:** 03.11.2026 · **Hazırlayan:** Claude · **Durum:** `LOCAL_ONLY · INDEPENDENT_HUMAN_ACCEPTED=NO · G0 HOLD`
**Taban:** PR #9 `8a0a9c1` (Codex `66d5ecb` + Claude inceleme testleri). Canlı veritabanı, gerçek kimlik sağlayıcı ve müşteri verisi yok.

## 1. Hedef

Her uydu site yalnız kendi rezervasyon, müşteri, tedarikçi ilişkisi ve finans verisine erişir. Yetki iki katmanda birlikte uygulanır:
1. **API:** her istek sunucuda doğrulanmış bir kimlikten (principal) türeyen bir kapsamla çalışır.
2. **PostgreSQL:** aynı kapsam her işlemde oturum değişkeni olarak ayarlanır; satır düzeyi güvenlik (RLS) uygulama hatasında da yabancı satırı göstermez.

Değişmez ilke: **istemciden gelen hiçbir değer yetki vermez.** `Origin`, `x-site-id`, istek gövdesindeki `siteId`, alan adı, reklam tıklama kimliği ve satış kaynağı atfı en fazla zaten sahip olunan yetkiyi daraltır.

## 2. Bugünkü durum (inceleme)

| Yer | Durum | Etki |
| -- | -- | -- |
| `apps/api/src/http.ts` satır ~150–155 | Tek global yönetim anahtarı. Her istek `{ id: "static-admin-token", role: "admin", mfa: false }` aktörüyle çalışıyor. Site kapsamı kavramı yok. | Anahtarı tutan herkes her sitenin verisini görür ve değiştirir. |
| `GET /v1/admin/bookings` → `listBookings()` | Süzme yok; tüm sitelerin rezervasyonları, para hareketleri ve pay satırları dönüyor. | A6.3 kırmızı. |
| `POST /v1/admin/bookings/:ref/*` → `#mutate(ref)` | Referansa göre bulunuyor; çağıranın sitesi kontrol edilmiyor. | A6.4 kırmızı. |
| `GET /v1/admin/settlements/:week` → `weekReport()` | Tüm tarafların alacak, borç, istisna ve dekontları tek raporda. | A6.5 kırmızı. |
| `GET /v1/admin/outbox` | Tüm olaylar (rezervasyon ve site kimlikleri). | Yalnız platforma açık olmalı. |
| `POST /v1/admin/receipts`, kapanış, mahsup, sefer atama | Platform işlemleri; site ayrımı yok. | Site kimliğine kapalı olmalı (A6.9). |
| Ortak shuttle seferi | Bir sefer birden çok sitenin rezervasyonunu taşır. | Site, seferdeki başka sitenin müşterisini görmemeli. Tedarikçi yalnız operasyon verisini görmeli (governance skill: tedarikçinin müşteri verisi erişimi sınırlı). |
| `packages/db/migrations/0001_network_core.sql` satır ~498 | Yalnız `booking` için `ENABLE ROW LEVEL SECURITY` ve tek `SELECT` politikası (`app.party_id`). `FORCE` yok, yazma politikası yok, defter tablolarında RLS yok. | Tablo sahibi rolüyle çalışan uygulama RLS'yi atlar. "QA-F3 (DB)" probu: p1 oturumu p2'nin 2 satırını görüyor. |
| Kimlik | Gerçek IdP ve 2FA yok (SEL-332). | Bu paket yalnız **yerel** site kimliği kurar; üretim kimliği değildir. |

Not: §11'deki önceki taslakta oturum değişkeni `ag.party_id` yazılmıştı. Mevcut şema `app.party_id` kullanıyor; şartname **`app.party_id`** ile hizalandı.

## 3. Tasarım

### 3.1 Kimlik ve kapsam (API)

```ts
type Scope =
  | { kind: "platform" }                                    // AGOS merkez; 2FA'lı işlemler ayrıca mfa ister
  | { kind: "site"; siteId: string; partyId: string }       // bir uydu site
  | { kind: "supplier"; partyId: string };                  // tedarikçi (bu pakette yalnız tasarım; uç açılmaz)

interface Actor { id: string; role: Role; mfa: boolean; scope: Scope }
```

- `http.ts` aktörü yalnız kimlik bilgisinden kurar:
  - `adminToken` → `scope: platform`.
  - Yerel site anahtarı (`HttpOptions.siteTokens: Record<token, siteId>`; `main.ts`'te `AG_SITE_TOKENS` JSON) → `scope: site`, `partyId = sites.get(siteId).ownerPartyId`.
  - Anahtar karşılaştırması `safeEqual` (sabit zamanlı). Bilinmeyen anahtar 401.
- `x-site-id` başlığı: platform kimliği için isteğe bağlı daraltma; site kimliği için yok sayılır (kapsam değişmez).
- Servis katmanında her okuma ve yazma `actor.scope` ile süzülür. Kural: kapsam dışı kayıt **404** (varlık sızdırmaz), kapsam dışı işlem türü **403**.

### 3.2 Uç bazında yetki matrisi

| Uç | platform | site | Not |
| -- | -- | -- | -- |
| `GET /v1/admin/bookings` | hepsi | yalnız `siteId = scope.siteId` | Müşteri alanları yalnız kendi sitesinde |
| `POST /bookings/:ref/confirm`, `cancel`, `dispute`, `invoice` | evet | yalnız kendi rezervasyonu; başkası 404 | |
| `POST /bookings/:ref/collection`, `refund`, `assign`, `complete`, `approve-price` | evet | 403 | Para ve operasyon platformda |
| `resolve-dispute`, `clear-duplicate`, offsets, itiraz kararı | evet + 2FA | 403 | QA-F10 deseni |
| `GET /v1/admin/settlements/:week` | tam rapor | yalnız tarafın satırları: kendi `entries`, `site_receivables`, kendisinin borçlu/alacaklı olduğu `obligations`, kendi istisnaları ve müşteri bakiyeleri | Diğer tarafların tutarları görünmez |
| `POST settlements/:week/close`, `/receipts`, `/outbox`, `shuttle-runs/*` | evet | 403 | Platform işlemi |
| `POST settlements/:week/disputes` (ekstre itirazı) | evet | yalnız kendi tarafı adına | `party_id` kapsamdan, gövdeden değil |

Ortak sefer: site kimliği seferin kendi rezervasyonları dışındaki satırlarını hiç görmez. Sefer kimliği ve tedarikçi kimliği görünebilir; başka sitenin müşteri adı, telefonu ve fiyatı görünmez.

### 3.3 PostgreSQL (göç adayı `packages/db/migrations/0002_tenant_rls.sql`; yalnız yerel atılabilir kümede)

**Roller:**

| Rol | Yetki |
| -- | -- |
| `ag_owner` | Tabloların sahibi; yalnız göç çalıştırır. Uygulama bu rolle bağlanmaz. |
| `ag_app` | `NOLOGIN` değil, `NOBYPASSRLS`, tablo sahibi değil. `SELECT, INSERT, UPDATE` gerekli tablolarda; `DELETE` ve `TRUNCATE` yok. |
| `ag_platform` | `ag_app` + platform politikaları; yalnız 2FA'lı platform oturumunda `SET ROLE`. |
| `ag_readonly` | Raporlama; yalnız `SELECT`, aynı RLS. |

**Oturum:** Her işlem `BEGIN; SET LOCAL app.party_id = $1; SET LOCAL app.scope = 'site' | 'platform'; …`. Değer yalnız doğrulanmış aktörden gelir. `SET LOCAL` olduğu için bağlantı havuzunda sızmaz.

**Politikalar** (tüm tablolarda `ENABLE` + `FORCE ROW LEVEL SECURITY`):

| Tablo | Site / taraf görür | Yazar |
| -- | -- | -- |
| `booking` | `selling_party_id = app.party_id` (site); `supplier_id = app.party_id` (tedarikçi, müşteri kolonları ayrı görünümle maskeli) | site: yalnız kendi; yeni satırda `selling_party_id` kapsamla eşit (`WITH CHECK`) |
| `booking_money_event`, `settlement_entry`, `manual_price_approval` | ilgili `booking` görünürse (`EXISTS` alt sorgusu) | yalnız platform |
| `bank_receipt` | `payer_id` veya `payee_id = app.party_id` | yalnız platform |
| `settlement_adjustment` | `debtor_id` veya `creditor_id = app.party_id` | yalnız platform |
| `statement_delivery`, `statement_dispute` | `party_id = app.party_id` | itiraz: taraf kendi adına; karar platform |
| `outbox_event`, `idempotency_key`, `settlement_week` | yok (yalnız platform) | yalnız platform |
| `shuttle_run` | kendi rezervasyonu olan seferler (yalnız sefer kolonları) | yalnız platform |

- `app.party_id` boşsa hiçbir politika satır döndürmez (kapalı varsayılan): `current_setting('app.party_id', true)` NULL veya `''` iken koşul yanlış.
- Platform politikası: `current_setting('app.scope', true) = 'platform' AND current_user = 'ag_platform'`.
- Tedarikçinin müşteri verisi: `booking_supplier_view` görünümü yalnız operasyon kolonlarını (alış yeri, saat, yolcu sayısı, müşteri adının baş harfi) verir; telefon ve e-posta yok. Bu pakette yalnız tasarım; tedarikçi ucu açılmaz.

## 4. Kabul testleri

Kural: `todo` kaldırılır, assertion değişmeden geçer. Testi gevşetmek, silmek veya `skip` yapmak yasak. Harness değişirse commit mesajında ayrıca belirtilir.

| Test | Dosya | Ne doğrular |
| -- | -- | -- |
| A6.3 | `qa-independent/a06-cross-site.test.ts` | "partner-site adına" istek yalnız partner-site rezervasyonlarını görür |
| A6.4 | aynı | rival-site rezervasyonunu iptal → 403 |
| A6.5 | aynı | ekstrede yalnız kendi alacağı |
| **A6.8** (yeni, `todo`) | aynı | **site kimliğiyle**: `x-site-id` başka siteye çevrilse de, başlıksız da yalnız kendi sitesi; ekstrede yalnız kendi tarafı |
| **A6.9** (yeni, `todo`) | aynı | site kimliğiyle outbox, dekont girişi, kapanış, mahsup, sefer atama → hepsi 403 |
| **A6.10** (yeni, `todo`) | aynı | başka sitenin rezervasyon referansı → 404; kayıt değişmez |
| QA-F3 (DB) | `packages/db/src/schema-probes.test.ts` (`AG_TEST_PG=1`) | p1 oturumu p2'nin para hareketi ve dekontunu görmez; defter tablolarında RLS açık **ve zorunlu** |

**A6.3–A6.5 hakkında uyarı:** Bu üç test bugün global yönetim anahtarı + `x-site-id` başlığıyla "site adına" davranıyor. Yalnız başlığa göre süzmek onları geçirir ama izolasyon sağlamaz. Bu yüzden A6.8–A6.10 zorunlu: kapsamı **kimlik** taşır. Uygulama iki yoldan biriyle A6.3–A6.5'i geçirmeli:
- (a) platform kimliği için `x-site-id` daraltma olarak uygulanır (izin verilen, çünkü platform zaten her şeyi görebilir); veya
- (b) A6.3–A6.5'in kimlik bilgisi site kimliğine çevrilir. Bu bir **fikstür değişikliğidir** (assertion aynı kalır) ve inceleyici onayı gerektirir.
Önerim (a); (b) yalnız gerekçeyle.

**Yeni harness öğeleri (bu turda eklendi):** `SITE_TOKENS`, `SITE_TOKEN` (`qa-independent/harness.ts`). `createApiServer`'a `siteTokens` geçiriliyor; bugünkü sunucu bunu yok sayıyor, bu yüzden A6.8–A6.10 bugün 401 ile kırmızı.

**Ek DB probları (Paket-02'de yazılır, `AG_TEST_PG=1`):**
- `ag_app` rolüyle `app.party_id` ayarlanmadan `SELECT count(*) FROM booking` → 0.
- `ag_app` ile p1 kapsamında p2 adına `INSERT INTO booking` → `WITH CHECK` hatası.
- `ag_app` ile `DELETE FROM settlement_entry` → yetki hatası.
- `ag_app` rolü `rolbypassrls = false`, hiçbir defter tablosunun sahibi değil.

## 5. Dosyalar

| Dosya | Değişiklik |
| -- | -- |
| `apps/api/src/service.ts` | `Actor.scope`; `listBookings`, `#mutate`, `weekReport`, `raiseStatementDispute`, platform işlemleri kapsam kontrolü |
| `apps/api/src/http.ts` | `HttpOptions.siteTokens`; aktörü kimlikten kurma; başlık yalnız platformda daraltma |
| `apps/api/src/main.ts` | `AG_SITE_TOKENS` (yalnız `NODE_ENV=development/test`; üretim kapısı kapalı kalır) |
| `packages/core/src/settlement.ts` veya `apps/api/src/service.ts` | rapordan taraf görünümü (`reportForParty`) |
| `packages/db/migrations/0002_tenant_rls.sql` | roller, `FORCE RLS`, politikalar, tedarikçi görünümü |
| `packages/db/src/schema-probes.test.ts` | 0002 göçünün uygulanması; yeni DB probları |
| `qa-independent/a06-cross-site.test.ts` | yalnız `todo` kaldırma (ve gerekirse §4 (b) fikstür değişikliği) |

## 6. Commit planı (her biri ayrı; her birinde `npm run check` yeşil)

1. **Kapsam modeli:** `Actor.scope`, `siteTokens`, kapsam dışı 404/403. Kabul: A6.8, A6.9, A6.10, A6.3, A6.4.
2. **Taraf bazlı ekstre:** `weekReport` süzmesi. Kabul: A6.5 ve A6.8'in ekstre kısmı; platform raporu değişmez (W45 örnek raporu byte düzeyinde aynı).
3. **DB göçü 0002:** roller, `FORCE RLS`, politikalar. Kabul: "QA-F3 (DB)" ve ek DB probları, `AG_TEST_PG=1` ile yerel PostgreSQL 16'da.

Beklenen: 193 test; üç commit sonrası A6.3–A6.5 ve A6.8–A6.10 yeşil, `todo` 21 → 15. DB: "QA-F3 (DB)" yeşil.

## 7. Önce kapanacaklar ve kapsam dışı

- **Önce:** PR1-N6 (A4.14, dekont tarih doğrulaması) ve PR2-N1 (A8.7, denetim geçmişi) ayrı küçük commit'ler.
- **Kapsam dışı:** gerçek IdP / 2FA (SEL-332), staging veritabanı (SEL-329), canlı göç, tedarikçi ucu, kişi ve rol listesi (H-12), reklam atfı (QA-F11), dekont tahsis modeli (H-26).
- Yerel site anahtarı **üretim kimliği değildir.** SEL-332 bitmeden site kimliğiyle HTTP üzerinden hiçbir uç canlıda açılmaz; üretim kapısı (`main.ts`) her durumda kapalı kalır.

## 8. İnceleme ölçütleri (Claude akran incelemesi için)

- Başlık, gövde veya `Origin` ile kapsam genişletme denemeleri → reddedilmeli.
- Site kimliği ile başka sitenin rezervasyon referansı, sefer kimliği ve hafta raporu → yabancı veri yok.
- Ortak seferde başka sitenin müşteri alanları görünmemeli.
- Platform raporunun içeriği ve W45 örnek raporu değişmemeli.
- DB: `ag_app` `BYPASSRLS` değil; `FORCE` açık; kapsam ayarlanmadan sıfır satır.
- Kanıt PASS / FAIL / NEEDS REVIEW olarak PR #9 ve SEL-163'e yazılır. İnsan bağımsız kabulü ayrıca gerekir.

# Canlı Sürüm Denetimi — `foundation-v1`

**Tarih:** 2026-09-04
**Kanıt:** `sultan-live-20260904T185242Z.zip`
**SHA-256:** `298c79081db7b914e258903f0fba247a399a8743ab067ffa66bac76ec8501237` (doğrulandı)
**Manifest:** 19/19 OK, 0 FAILED
**Kaynak:** `/opt/agos/commerce/sultan-kebab-kielce/releases/foundation-v1` üretim sunucusundan alınan anlık görüntü

---

## 1. Sürüm kimliği

Canlıdaki sürüm, ZIP paketiyle denetlenen `sultan-v13-external-admission` **değildir.** Aynı soydan, bir kuşak öncesi.

**Ayırt edici kanıtlar:**

| Kanıt | Bulgu |
|---|---|
| `operations_settings` tablosu | Üretim DB'sinde **yok** (`relation does not exist`) |
| `src/globals/` klasörü | Canlı kaynakta **yok** |
| `/api/readyz` | Build çıktısındaki rota listesinde **yok** |
| `robots.txt` | Canlıda **200**, denetlenen kaynakta hiç yok |
| Dizin adı | `releases/foundation-v1` |

**Birebir aynı dosyalar:** `Products.ts`, `Categories.ts`, `Users.ts`, `Media.ts`, `Posts.ts`, `DeliveryZones.ts`, `storefront/menu/route.ts`, `delivery/quote/route.ts`, `maps/config/route.ts`, `storefront.js`

**Farklı dosyalar:**

| Dosya | Canlı | Denetlenen |
|---|---|---|
| `orders/create/route.ts` | 624 satır | 834 satır |
| `collections/Orders.ts` | 31 satır | 44 satır |
| `storefront/orders/route.ts` | 93 satır | 97 satır |
| `public/storefront.html` | 108 satır (WhatsApp düzeltmesi uygulandı) | 108 satır |

---

## 2. Canlıda SAĞLAM olan kontroller

- **Sunucu tarafı fiyat otoritesi.** `orders/create/route.ts:451` fiyatı `product.basePrice` + boyut/çeşit/ekstra deltalarından yeniden hesaplıyor. İstemci fiyat gönderemiyor.
- **Ürün durumu doğrulaması.** `route.ts:398` → `if (!product.active || product._status !== 'published')`
- **Same-origin / CSRF koruması.** Build çıktısında `ƒ Proxy (Middleware)` görünüyor.
- **Menü filtrelemesi.** `menu/route.ts` yalnızca `active + published` ürünleri yayınlıyor.
- **Medya kalıcılığı.** `media:/app/media` adlı Docker volume.

---

## 3. Canlıda EKSİK olan korumalar

| ID | Bulgu | Kanıt | Risk |
|---|---|---|---|
| L-01 | **Sipariş kabul kapısı yok** | `src/globals/` yok, `operations_settings` tablosu yok | Restoran kapalıyken sipariş durdurulamıyor; site 7/24 sipariş alıyor |
| L-02 | **Idempotency yok** | `orders/create` içinde `idempotenc` geçmiyor; `Orders.ts`'te `idempotencyKeyDigest` ve `requestFingerprint` alanları yok | Çift tıklama veya ağ tekrarı **iki ayrı sipariş** oluşturur |
| L-03 | **Bildirim için yeniden deneme yok** | `outbox` geçmiyor; tek `fetch` çağrısı, 8 sn timeout | n8n çökerse sipariş kaydedilir ama kimseye ulaşmaz |
| L-04 | **`whatsapp_status` başarıyı gösteremiyor** | Alana yalnızca iki değer yazılıyor: `'pending'` (satır 530) ve `'failed'` (satır 582). Başarı yolu hiç yazmıyor | Admin panelinde hangi siparişin iletildiği ayırt edilemiyor |
| L-05 | `sitemap.xml` yok | Canlıda 404 | Arama motorlarına URL envanteri sunulmuyor |
| L-06 | Yasal sayfalar yok | Gizlilik/çerez/şartlar hiçbir yerde | Polonya'da yasal zorunluluk; site canlı |
| L-07 | `DeliveryZones` koleksiyonu tüketilmiyor | Tek referans `Orders.ts:28`'deki ilişki alanı | Admin'de teslimat ücreti değiştirmek hiçbir şeyi etkilemez |
| L-08 | `store_open` sabit `true` | `menu/route.ts:177` | Sipariş durumu ne olursa olsun site "açık" diyor |

---

## 4. Doğrulanan üretim durumu (2026-09-04)

| Kontrol | Sonuç |
|---|---|
| Yayınlanan ürün | 42 (10 kategori) |
| Fiyatı olmayan ürün | **0** — hepsi 6–45 zł arası |
| `robots.txt` | 200 |
| `sitemap.xml` | 404 |
| WhatsApp numarası | `48513059222` — telefonla birleştirildi, image'a gömüldü |
| `theme.css` | 200 |
| `N8N_ORDER_WEBHOOK_URL` | Tanımlı |
| Sipariş sayısı | 4 — hepsi `+90` Türk numarasından, test siparişi |
| Sipariş `whatsapp_status` | Tümü `pending`, hiçbiri `failed` → **webhook 202 döndü, bildirim gitti** |

Webhook tanımlı olduğu ve hiçbir sipariş `failed` olmadığı için bildirim zincirinin uçtan uca çalıştığı çıkarımı yapılabilir. `pending` kalmaları L-04'ün sonucudur, başarısızlık değil.

---

## 5. Operasyonel öneriler

**Site sipariş alır durumda kalabilir** — fiyat güvenliği sağlam ve bildirim zinciri çalışıyor. Ancak iki risk elle yönetilmeli:

1. **n8n izlenmeli.** Yeniden deneme yok; n8n bir süre çökerse o aralıktaki siparişler `failed` olur ve kimse haberdar olmaz. Günde birkaç kez kontrol:
   ```sql
   select order_number, whatsapp_status, customer_name, customer_phone, total, created_at
   from orders where whatsapp_status='failed' or status='new'
   order by created_at desc;
   ```
2. **Gece siparişi.** Sipariş kabulünü kapatan düğme yok; site 03:00'te de sipariş alır.

**Düzeltme sırası:** L-04 (küçük) → L-05 → L-06 → L-02 → L-01

---

## 6. Sınırlar

- Bu denetim **statik kaynak incelemesidir.** Çalışma zamanı, tarayıcı, erişilebilirlik ve mobil testleri yapılmadı — denetim ortamının ağ politikası tüm dış hedefleri engelliyor.
- Canlı gözlemler (sipariş kayıtları, HTTP kodları, DB sorguları) sahibin terminalinden alınan çıktılara dayanıyor.
- ZIP yalnızca `public/`, `src/app/api/`, `src/collections/` ve `src/globals/` (yok) kapsıyor. `src/lib/`, `src/components/`, migration'lar ve testler canlı sürüm için incelenmedi.

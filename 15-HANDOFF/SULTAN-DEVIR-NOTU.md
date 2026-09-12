# Sultan Kebab Kielce — Devir Notu

**Hazırlayan:** Bu bulut oturumu (Mac'e ve sunucuya erişimi yok)
**Devralan:** Mac üzerinde yerel çalışan Claude Code oturumu
**Tarih:** 2026-09-04

Bu belge, yeni oturumun sıfırdan başlamaması için hazırlandı. **İlk iş bunu
okumak.** Aşağıdaki her değer bu oturumda canlı sistemden doğrulandı; tahmin
yok, doğrulanmamış olanlar ayrıca işaretlendi.

---

## 1. Ortam

```text
LOCAL_PROJECT   /Users/a1453/sultan-preview/deploy-theme
LIVE_SNAPSHOT   /Users/a1453/sultan-preview/live      (production'dan cekilmis)
SERVER          root@167.233.207.116  (anahtar: ~/.ssh/agos-prod-01)
PROD_PATH       /opt/agos/commerce/sultan-kebab-kielce/releases/foundation-v1
DOMAIN          https://www.sultankebabkielce.com
```

**Yetki sınırı (sahibin koyduğu):** Yalnızca Sultan Kebab. Alanya Group, AGOS,
n8n ve diğer projelere dokunulmayacak. SSH anahtarı içeriği okunmayacak. `.env`,
token, parola, müşteri verisi çıktılara yazılmayacak. DB silinmeyecek,
siparişler silinmeyecek. Production değişikliğinden önce değişen dosyalar, test
sonucu ve rollback yöntemi bildirilecek.

---

## 2. Canlı sürümün kimliği — en önemli bağlam

Production'da çalışan sürüm **`foundation-v1`**. Bu, daha önce denetlenen
`sultan-v13-external-admission` worktree'sinden **bir kuşak eski.** Karıştırmayın.

| | v13 | production |
|---|---|---|
| `src/globals/` | var | **yok** |
| `orders/create/route.ts` | 834 satır | 624 satır |
| `collections/Orders.ts` | 44 satır | 31 satır |
| `/api/readyz` | var | **yok** |

Birebir aynı olanlar: `Products`, `Categories`, `Users`, `Media`, `Posts`,
`DeliveryZones`, `storefront/menu`, `delivery/quote`, `maps/config`,
`storefront.js`.

Kanıt: SHA-256 doğrulanmış production anlık görüntüsü
(`sultan-live-20260904T185242Z.zip`, manifest 19/19 OK).

---

## 3. Doğrulanmış işletme verileri

| Alan | Değer | Nereden |
|---|---|---|
| Adres | Henryka Sienkiewicza 49, 25-002 Kielce | JSON-LD + canlı site |
| Telefon / WhatsApp | +48 513 059 222 | 2026-09-04'te birleştirildi |
| Koordinat | 50.87240997, 20.62105328 | `maps/config` |
| Teslimat yarıçapı | 8 km | `orders/create`, `delivery/quote` |
| Teslimat ücreti | 10 zł | aynı |
| Minimum sipariş | 40 zł | aynı |
| Ücretsiz teslimat | 100 zł üzeri | aynı |
| Ürün | 42, hepsinde fiyat var | canlı menü API |
| Fiyat aralığı | 6–45 zł | canlı menü API |
| Kategori | 10 | canlı menü API |

Kategoriler: kebab w bułce (3), kebab w picie (4), tortilla/durum (4),
kebab na frytkach (4), box i kapsalon (6), pizza (10), sałatki i meze (4),
napoje (7).

**Ayırt edici:** pita ve tortilla yerinde pişiriliyor. Rakip analizine göre bu,
2026 pazar trendinin (elle dizilen taze et) tam merkezinde ve **hiçbir rakip bu
hikâyeyi internette anlatmıyor.**

---

## 4. Production'da NE ÇALIŞIYOR

- **Sunucu tarafı fiyat otoritesi** — `orders/create/route.ts:451` fiyatı
  `product.basePrice` + boyut/çeşit/ekstra deltalarından yeniden hesaplıyor.
  İstemci fiyat gönderemiyor. **En kritik kontrol, sağlam.**
- **Ürün durum doğrulaması** — `route.ts:398`, `!active || _status !== 'published'`
- **Same-origin/CSRF middleware** — build çıktısında `ƒ Proxy (Middleware)`
- **Menü filtreleme** — yalnızca `active + published`
- **Sipariş zinciri** — ürün → fiyat → Postgres → n8n webhook. 4 test siparişiyle
  uçtan uca doğrulandı, hepsi `pending` (yani webhook 202 döndü).
- **SEO temeli** — title, description, canonical, OG, `lang="pl"`, JSON-LD
  Restaurant, `robots.txt` 200

---

## 5. Production'da NE EKSİK

| ID | Bulgu | Kanıt |
|---|---|---|
| L-01 | Sipariş kabul kapısı yok | `src/globals/` yok, `operations_settings` tablosu yok |
| L-02 | Idempotency yok | `orders/create` içinde `idempotenc` geçmiyor |
| L-03 | Bildirim yeniden denemesi yok | tek `fetch`, 8 sn timeout, kuyruk yok |
| L-04 | `whatsapp_status` başarıyı gösteremiyor | yalnızca `'pending'` (530) ve `'failed'` (582) yazılıyor |
| L-05 | `sitemap.xml` yok | canlıda 404 |
| L-06 | Yasal sayfalar yok | gizlilik/çerez/şartlar hiçbir yerde |
| L-07 | `DeliveryZones` tüketilmiyor | tek referans `Orders.ts:28` ilişki alanı |
| L-08 | `store_open` sabit `true` | `menu/route.ts:177` |

Ek: `consent`, `payment_method`, `notes` alanları storefront'tan gönderiliyor
ama `storefront/orders/route.ts` adapter'ı bunları düşürüyor — kaydedilmiyor.

---

## 6. Deploy mekaniği — önemli tuzak

`public/` klasörü **image'a gömülü** (`Dockerfile`: `COPY . .` +
`COPY --from=builder /app/public ./public`). Tek volume `media`.

**`docker compose cp` ile yapılan değişiklik kalıcı değildir** — bir sonraki
container yeniden oluşturmada kaybolur. Bu oturumda üç kez yaşandı.

**Doğru akış:** dosyayı host'taki `public/` altına koy → `docker compose build app`
→ `docker compose up -d app`.

**Drift kontrolü** (üçü de aynı olmalı):
```bash
cd $PROD_PATH
printf 'host      : '; stat -c %s public/sultan/theme.css
printf 'container : '; docker compose exec -T app stat -c %s /app/public/sultan/theme.css
printf 'IMAGE     : '; docker run --rm --entrypoint sh sultan-kebab-kielce-app -c 'stat -c %s /app/public/sultan/theme.css'
```

Ayrıca: yeni dosya eklerken `chmod 644` unutmayın. `theme.css` bir kez 600
iziyle gidip önce 404 sonra 500 verdi.

---

## 7. Mevcut yedekler ve geri dönüş

**Image etiketleri:**
- `sultan-kebab-kielce-app:pre-rebuild-20260904T185135Z`
- `sultan-kebab-kielce-app:pre-a-list-20260904T192339Z`

Geri dönüş:
```bash
docker tag sultan-kebab-kielce-app:<etiket> sultan-kebab-kielce-app && docker compose up -d app
```

**Dosya yedekleri:** `backups/theme-20260904T172119Z`,
`backups/a-list-20260904T192215Z`

**DB yedeği:** `backups/pre-publish-20260904T164829Z/db-full.sql` (198 KB)

**Not:** `docker compose up -d app` bu kurulumda migration tetiklemiyor
(doğrulandı) — v13 compose'undaki `migrate` bağımlılığı `foundation-v1`'de yok.

---

## 8. Sıradaki işler — öncelik sırasıyla

**1. `sitemap.xml`** — hazır, `03-ICERIK/sitemap.xml`. Yalnızca `/` ve `/order`
içeriyor (site tek sayfalık; var olmayan URL eklemek zarar verir). Yayına
alındıktan sonra Search Console'a gönderilmeli. `robots.txt` içine de
`Sitemap: https://www.sultankebabkielce.com/sitemap.xml` satırı eklenmeli.

**2. L-04 düzeltmesi** — webhook 202 dönünce `whatsappStatus: 'sent'` yazılsın.
Birkaç satır, operasyonel değeri yüksek: şu an hangi siparişin iletildiği
görülemiyor.

**3. Ana sayfa içerik blokları** — `03-ICERIK/SAYFA-METINLERI.md` §1. Yeni rota
gerektirmez, sadece `storefront.html` düzenlemesi. En hızlı SEO kazancı.

**4. JSON-LD düzeltmesi** — ⚠️ **bilgi bekliyor** (bkz. §9). Yapılacaklar:
saatler, `priceRange: "20-45 zł"` (şu an geçersiz `"zł"`), `geo` eklenmesi,
`paymentAccepted` düzeltmesi. Ayrıca `storefront.html` içindeki
`storeConfig.openingHours` bloğu aynı saatlere hizalanmalı — şu an aynı dosyada
iki ayrı saat kaynağı var.

**5. Yeni sayfalar** — `SAYFA-METINLERI.md` içinde altı sayfanın tam Polonyaca
metni hazır: `/o-nas/` (en değerli), `/kebab-kielce/`, `/pizza-kielce/`,
`/dostawa/`, `/kontakt/`, `/faq/`. Her sayfa yayına girdikçe sitemap genişletilir.

**6. Yasal sayfalar** — ⚠️ şirket unvanı + NIP/REGON bekliyor.

**7. `consent`/`payment_method`/`notes` kaydı** — adapter'da düşürülüyor.

**8. Idempotency** (L-02), **sipariş kabul kapısı** (L-01, migration gerektirir).

---

## 9. Sahipten bekleyen bilgiler — bunlar olmadan ilerlenemez

1. **Çalışma saatleri.** Canlı JSON-LD Cuma/Cmt **03:00**'e kadar diyor,
   `storefront.html` config'i **01:00** diyor. İkisi çelişiyor. Doğru kaynak
   Google İşletme kaydı, ama bu oturumdan Google'a erişilemedi.
2. **Ödeme yöntemleri.** Sitede `paymentAccepted: "Cash"` yayında. Kart/BLIK
   geçiyorsa yanlış bilgi yayınlanıyor.
3. **Şirket unvanı, NIP/REGON, gizlilik sorumlusu** — yasal sayfalar için.
4. **E-posta adresi** — kod tabanının tamamında yok.

---

## 10. Güvenlik

**Admin şifresi bu projenin sohbetinde iki kez açık metin olarak yazıldı ve
değiştirilmedi.** Canlı sistemde müşteri adı, telefonu ve adresi var.
Değiştirilmesi en yüksek öncelik. (Şifre bu belgeye yazılmadı.)

Diğer riskler: sipariş kabulü kapatılamıyor (L-01), idempotency yok (L-02),
`delivery/quote` hız sınırı süreç belleğinde (kalıcı `rateLimiter` mevcut ama
kullanılmıyor), sipariş onayı kaydedilmiyor.

Kod tabanında **gömülü sır bulunmadı** — tüm eşleşmeler `synthetic-*` test
değerleri.

---

## 11. Bu depoda ne var

```
02-AUDIT/RAKIP-ANALIZI.md              rakip analizi ve pazar boşlukları
02-AUDIT/SEO-ICERIK-PLANI.md           SEO planı
02-AUDIT/CANLI-SURUM-DENETIMI.md       foundation-v1 denetimi (L-01..L-08)
02-AUDIT/SULTAN-AUDIT-EXECUTION-REPORT.md
03-ICERIK/sitemap.xml                  yayına hazır
03-ICERIK/SAYFA-METINLERI.md           altı sayfanın Polonyaca metni
15-HANDOFF/SULTAN-DEVIR-NOTU.md        bu belge
```

Depo: `github.com/ALGRP/AG`, dal
`claude/sultan-kebab-audit-reports-295imb`, PR #3.

---

## 12. İlk oturumda yapılacaklar

1. Bu belgeyi oku.
2. `/Users/a1453/sultan-preview/deploy-theme` ile production'ı karşılaştır —
   bu karşılaştırma **henüz hiç yapılmadı**, önceki oturum o klasörü göremedi.
3. Salt okunur inceleme yap, production'a dokunma.
4. §8'deki 1. maddeden (sitemap) başla — hazır, risksiz, bilgi beklemiyor.

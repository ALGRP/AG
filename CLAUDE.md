# AlanyaGroup — Booking Engine Remediation: Ortak Durum Brifingi

> **Bu dosya beş ALGRP deposunun hepsinde birebir aynıdır.** Hangi depoyu açarsanız açın,
> bu işin güncel durumunu, kilitlenmiş kararları ve yürürlükteki yasakları burada bulursunuz.
> Depoya özel bir talimat değildir — ortak çalışma zeminidir.
>
> **Son güncelleme:** 2026-09-05 · **Kaynak paketler:** `ALGRP/AG` → `reports/` + `handoff/`
>
> **EN — for non-Turkish readers.** This same brief is in all five ALGRP repositories.
> Booking-engine remediation for alanyagroup.com is **BLOCKED**: `owner_go = false`, the booking
> runtime source exists in no repository, and **0 of 24 acceptance tests have run**. Do not deploy,
> do not mutate production, do not send real customer or driver messages. Details below; the full
> reports live in `ALGRP/AG`.

---

## 1. Durum — tek cümle

alanyagroup.com booking engine düzeltmesi **uygulama aşamasında durduruldu**; sebep teknik bir
hata değil, **düzeltilecek kaynak kodun hiçbir depoda bulunmaması**. `owner_go = false`.

## 2. Ölçülmüş bulgular — 906 URL, tamamı HTTP 200

Bunlar tahmin değil; render edilmiş DOM üzerinden sayılmış doğrulanmış verilerdir.

| Bulgu | Sonuç |
|---|---|
| Çift (duplicate) form | **0** — kabul kriteri zaten geçiyor |
| Ham (literal) shortcode görünürlüğü | **0** — kabul kriteri zaten geçiyor |
| HTTP 200 dışı URL | **0** |
| **Hiç booking formu göstermeyen para sayfası** | **587 sayfanın 384'ü — %65** |

| Engine | URL |
|---|---:|
| yok (`none`) | **699** |
| `agsc-v6` (şablon kaynaklı) | 192 |
| `ag_home` (canonical) | 13 |
| `c6` (legacy) | 2 |

**Kritik çıkarım:** Brief "tekilleştirme" (de-duplication) istiyordu; kanıt bunun zaten çözülmüş
olduğunu gösteriyor. Gerçek iş **kapsam doldurma (coverage-fill)**. Legacy taşıma yalnızca **2
sayfa**; 192 URL tek bir şablonun arkasında. Backlog beş gruba önceden bölünmüş durumda
(466 sayfa `MUST_HAVE_BOOKING`). **Kapsam doldurma ayrı bir OWNER GO gerektirir.**

## 3. Neden durduruldu

Booking runtime kaynağı **beş ALGRP deposunun hiçbirinde** yok; hedef sunucu da oturum
konteynerinden erişilemez durumda.

| Aranan girdi | Sonuç |
|---|---|
| `ag_hlp` (canonical renderer öneki) | **0 eşleşme** |
| CLE received/confirmed e-posta modülü | **0 eşleşme** |
| `ag-booking-core.php`, `ag-booking-component-v1.php`, `ag-home-booking-shortcode.php`, `ag-homepage-live-pilot/plugin.php` | bulunamadı |
| `single-booking-engine-candidate/` | bulunamadı |

AGOS dokümanları bu runtime yollarını **isim olarak anıyor**, ancak bir durum belgesindeki yol
kaynak kod değildir. Var olan tek WordPress eklentisi (`ag-platform-v2-admin-cms`) tasarımı gereği
salt-okunur — `safety-scan.php`, `add_shortcode` gördüğünde build'i düşürür — dolayısıyla bir
booking engine barındıramaz.

Dört durdurma koşulunun dördü de tetiklendi. **24 testin 0'ı çalıştırıldı; hiçbiri "geçti" olarak
raporlanmadı.**

## 4. Kilitlenmiş owner kararları

Bunlar tartışmaya kapalıdır. Aksini öneren eski bir kayıt görürseniz **bu liste geçerlidir**.

- **Canonical shortcode:** `[ag_booking_engine]` · **renderer:** `ag_hlp_render_booking_engine()`
- **Geçici alias'lar** (aynı renderer'a bağlanır): `[ag_home_booking]`,
  `[ag_transfer_booking_form]`, `[agp_booking_engine]`
- **Shuttle fiyatı:** 1 kişi 30 · 2 kişi 50 · 3 kişi 60 · 4+ kişide kişi başı +10 (4=70, 5=80, 6=90)
- **AYT ↔ GZP shuttle: her iki yönde de YASAK.** Reddetme **server-side** olmalı, yalnızca arayüzde
  değil; private/VIP transferi engellememeli.
- **Ödeme:** araçta nakit
- **E-posta alanı opsiyonel** — arayüz, backend ve API'de tutarlı biçimde
- **Manuel koltuk seçimi kaldırıldı.** Yolcu sayısı shuttle koltuğunu belirler; **kapasite
  doğrulaması backend'de korunur.**
- **Fiyat yalnızca server-side authority ile belirlenir.** Client'tan gelen fiyata güvenilmez.
- **Production CLE received/confirmed e-posta davranışı regresyona uğramamalıdır**
  (+ çift voucher önleme)
- **TÜRSAB belge bilgisi korunmalıdır** (numara doğrulaması için §6'ya bakınız)

### Bilinen çelişkiler — çözülmedi

| Konu | Owner beyanı | Depo kaydı | Durum |
|---|---|---|---|
| TÜRSAB numarası | **2165** (iki kez belirtildi) | **12892** (`alanyagroup-platform`) | Hermes doğrulayacak; **ikisi de bugün yayımlanmayacak** |
| Shuttle 3/4 kişi | 60 / 70 | 70 / 80 (`MASTER_PROJECT_STATUS.md`) | **Owner kararı geçerlidir** (§4) |
| Alanya dışı fiyat tabanı | `max(50, 50 + …)` | yayımlanan "from" fiyatları daha düşük | Taban hiçbir zaman bağlayıcı olamıyor (ölü kod); Hermes doğrulayacak |

## 5. Yürürlükteki yasaklar

Bu iş kapsamında **hiçbir ajan ve hiçbir oturum** aşağıdakileri yapamaz:

- Production'a deploy — **yok**. Canlı WordPress üzerinde doğrudan geniş kapsamlı düzenleme — **yok**.
- Full plugin overwrite — **yok**. Canlı DB'ye kontrolsüz migration — **yok**.
- Rank Math, WooCommerce veya booking core'da geniş kapsamlı değişiklik — **yok**.
- Gerçek müşteri/sürücü verisi ile test — **yok**. Gerçek WhatsApp veya e-posta gönderimi — **yok**.
  (Teslimat testleri yalnızca synthetic adreslerle.)
- WhatsApp Job Distribution modülünü aktive etmek — bağımsız güvenlik denetimi **PASS** olmadan **yok**.
- Kapsam dışı AGOS SaaS özelliği eklemek — **yok**.
- Browser API key'i server-side işlemde kullanmak veya anahtarı koda gömmek — **yok**.
  IP kısıtlı server key yoksa bu bir **OWNER BLOCKER** olarak raporlanır.
- Kişisel veriyi analytics payload'ına koymak — **yok**. OWNER GO'suz GTM publish — **yok**.
- Yetki/güvenlik kontrolünü atlamak — **yok**. Başarısız testi gizlemek — **yok**.
- Backend kapasite doğrulamasını kaldırmak — **yok**.
- n8n orchestrator `fjqbCav0JYRFI5w7` pasif kalır.

Dokümantasyon güncellemesi hiçbir zaman yetki anlamına gelmez. Yeni bir **OWNER GO** gerekir.

## 6. Gizlilik kuralı — depolar arası

`ALGRP/AG` **public**; diğer dört ALGRP deposu **private**. Bu ayrım kasıtlıdır:

- Kaynak kod, kimlik bilgileri, müşteri verisi, production DB dökümü, host yolları ve DB
  tanımlayıcıları **public depoya konulmaz**.
- 906 satırlık envanter fixture'ı ve korumasız para sayfalarının **URL bazında listesi** public
  depoya konulmaz — biri özel veriyi yeniden yayımlar, diğeri fiilen bir hedef listesidir.
  Public depoda yalnızca **toplu sayılar** ve **yeniden üretim betiği** bulunur.
- Private depoya commit öncesi **secret taraması** zorunludur.

## 7. Şu an ne bekleniyor — Hermes

Uygulamanın önündeki dört madde `ALGRP/AG` → `handoff/HERMES_TASK_PACKET_01.md` ile Hermes'e
devredildi (Mac ve canlı site erişimi olan ajan):

1. **Baseline** — *her şeyi açan madde.* Salt-okunur `preflight_baseline_check.sh` çalıştırılacak,
   çıktı birebir dönecek. Tamamsa booking runtime + CLE modülü **private** bir depoya commit edilecek.
2. **TÜRSAB** — 2165 mi 12892 mi; tescil belgesi ile karşılaştırılacak.
3. **Fiyat** — Alanya dışı taban (50 mi 40 mı) teyit edilecek.
4. **Diller** — EN→TR→DE→RU kademelerinin dışında kalan 12 İskandinav para sayfası + Arapça için
   kapsam kararı. (hreflang yeniden kurulumu bunları öksüz bırakabilir.)

**`BASELINE_COMPLETE=YES` gelene kadar uygulama başlamaz.**

## 8. Raporlar nerede

Depo: **`ALGRP/AG`** · Branch: **`claude/alanyagroup-final-completion-me48z5`** · **PR #1**

```
git clone -b claude/alanyagroup-final-completion-me48z5 https://github.com/ALGRP/AG
```

| Yol | İçerik |
|---|---|
| `handoff/HERMES_TASK_PACKET_01.md` | Hermes görev paketi — okuma sırası, teslim formatı |
| `reports/ALANYAGROUP_SITE_FINAL_REMEDIATION_V1/` | **Buradan başlayın.** Booking engine matrisi, doğrulanmış DOM verisi |
| `reports/ALANYAGROUP_RECONCILED_BOOKING_CANDIDATE_V1/` | Durdurma gerekçesi + macOS preflight betiği |
| `reports/ALANYAGROUP_FINAL_COMPLETION_V1/` | İlk karar paketi — **kısmen geçersiz** |

⚠️ **İkinci paket, birinci paketteki iki bulguyu düzeltir:** envanter *mevcuttur* (AGOS içinde,
"Hermes" adını taşımadığı için isim aramasıyla bulunamamıştı) ve telefon numarası *doğrulanmıştır*.
Birinci paketi okurken bunu aklınızda tutun.

## 9. Baseline geldiğinde ne yapılacak

`BASELINE_COMPLETE=YES` ve kaynak private depoda olduğunda, §4'teki kararlar uygulanır: canonical
shortcode + üç alias, opsiyonel e-posta, kapasite doğrulaması korunarak koltuk seçiminin
kaldırılması, server-side fiyat authority'si, çift yönlü AYT↔GZP reddi, CLE regresyonsuzluğu —
ardından **24 testlik matris** çalıştırılır ve sonuçlar olduğu gibi raporlanır.

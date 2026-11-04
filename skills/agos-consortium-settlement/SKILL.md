---
name: agos-consortium-settlement
description: "AGOS konsorsiyumunun TEK YETKİLİ finans skill'i: tedarikçi tahsilatı, %20 site / %10 AGOS / %70 tedarikçi payı, fiilî tahsilat üzerinden komisyon, iade ve yeniden hesap, iptal ters kaydı, haftalık kapanış (agos-weekly-settlement bu skill'e yönlenir), dekont eşleştirme, kapanmış haftaya itiraz, 5+ kişi manuel fiyat sınırı ve hat kodları. Komisyon, hak ediş, haftalık ekstre, tahsilat, iade, iptal, itiraz, mahsup, 5+ fiyat veya shuttle hattı işlerinde kullan."
---

# AGOS konsorsiyum hesaplaşması (TASLAK aday · 03.11.2026, V2 devriyle güncellendi)

Durum:
- K15 ticari kararı **kesin**.
- T1/T2/T3 ve K17 kontrol mekanizması **yalnız yerel QA için onaylı**; bu canlı kabul değildir.
- K8 hat kapsamları ve tarihleri, K17 sayısal sınırları, Private/VIP orantılı tahsilat sözleşmesi ve küsurat dağıtım politikası **açık**.
- Bu dosya depo içi taslaktır; org skill'lerine öneriler `skills/ORG-SKILL-UPDATES-2026-11-03.md` dosyasında.

**Tek yetkili finans skill'i (V2 devir):**
- `agos-weekly-settlement` (SEL-456 adayı) ayrı kurulmaz, bu skill'e yönlenir. Benzersiz içeriği görüldüğünde buraya birleştirilir.
- İkinci bir hesap motoru tutulmaz. Kanonik motor `@ag/core` adayıdır; bağımsız kabul şartı geçerli.

## Kapsam ve politika kimlikleri

Eski kurallar **silinmez**, ama konsorsiyum kapsamında uygulanmaz. Her biri kendi politika kimliğiyle korunur (kimlikler öneridir; Owner teyidi gerekir).

| Politika kimliği | Kural | Nerede geçerli | Konsorsiyumda |
| -- | -- | -- | -- |
| `shuttle-split-v1` | %20 site / %10 AGOS / %70 tedarikçi; kendi aracıyla 0 / %10 / %90 | Konsorsiyum shuttle | **Geçerli** |
| `legacy-shuttle-tariff-2026-08` | 1–3 kişi 30/50/60 €, +10 €/kişi (5 = 80 €) | Ağustos 2026 lansman tarifesi | Geçersiz; 1–4 kişi 30/50/60/70, 5+ yalnız K17 |
| `b2b-distributor-2026-11-02` | Dış B2B dağıtıcı %10–15; 1–5 kişi 30/50/60/70/80 € | Dış kanal (SEL-88, SEL-197) | Uygulanmaz; 5 kişi 80 € çelişkisi açık (H-8) |
| `pool-offer-markup-1.30` | Şoför teklifi × 1,30; fiyatı belli işte tavan | AG'nin kendi private/VIP havuz ürünü | Shuttle'a uygulanmaz; konsorsiyum private'ında hak edişi site belirler |
| `pool-ledger-auto-netting-legacy` | Nakit/kart otomatik mahsup | AG'nin kendi havuz cari hesabı | Yok; mahsup yalnız yazılı onay + 2FA |
| `central-card-collection-legacy` | Kart tahsilatının merkeze yazılması | Eski merkezî tahsilat önerisi | Yok; tahsilatı tedarikçi yapar (K15) |

Kaynak kod: `packages/core/src/settlement.ts`, `shuttle.ts`, `commission.ts`; API `apps/api/src/service.ts`; şema `packages/db/migrations/0001_network_core.sql`.

## Değişmezler (asla)

1. Canlı rezervasyon, ödeme, banka transferi, otomatik borç tahsilatı veya reklam hesabında değişiklik yok. Bunlar ayrı **Owner LIVE GO** ister. `payout_execution` sabit `disabled_owner_go_required`.
2. Yeni bağımsız rezervasyon veritabanı kurulmaz. Tek kaynak mevcut CRS PostgreSQL.
3. Fiyat tek kaynaktan gelir (tarife sürümü). Site metnine elle fiyat yazılmaz.
4. Kapanmış hafta silinmez ve değiştirilmez. Düzeltme her zaman sonraki açık haftaya ayrı kayıttır.
5. Para tam sayı cent'tir. Para birimleri karıştırılmaz.
6. Fatura, vergi, taşıma/acentacılık yetkisi ve tahsilatın hukuki sorumlusu mali müşavir ve hukuk incelemesine tabidir. Kod bunlara karar vermez.
7. Değişikliği yazan kendisi kabul edemez. İnsan bağımsız inceleme gerekir.

## Shuttle fiyatı

- Rezervasyon **toplamı**: 1 kişi 30 €, 2 kişi 50 €, 3 kişi 60 €, 4 kişi 70 €. Kişi başı 35 € iptal.
- 5+ kişi otomatik fiyatlanmaz (`requires_approval`). Eski "5 = 80 €" ve "+10 €/kişi" aktif edilmez.
- 5+ manuel fiyat (K17 taslak):
  - Yalnız hattın **Owner onaylı min/max** sınırı içinde kabul edilir.
  - Sınırı olmayan veya onaysız hatta fiyat kabul edilmez (`no_bounds_for_route`, `bounds_not_approved`).
  - 0,01 € gibi değerler sınır dışıdır.
  - Onaylayan: admin veya finance_manager, **2FA zorunlu**, gerekçe ≥ 5 karakter.
  - Denetim kaydı: kimlik, rol, zaman, eski/yeni fiyat, gerekçe.
  - Onaysız fiyat müşteriye kesin teklif olarak gösterilmez.

## Hatlar (K8 taslak)

- Her yön ayrı kod: AYT-ALN/ALN-AYT, AYT-SID/SID-AYT, AYT-BLK/BLK-AYT, AYT-KMR/KMR-AYT, AYT-KNY/KNY-AYT, GZP-ALN/ALN-GZP (pilot).
- **AYT-GZP ve GZP-AYT yasak** (kod, şema, DB).
- Her hat: tarife sürümü, `validFrom ≥ publishedAt`, kapsam metni, aktif/pasif. Pasif hatta fiyat üretilmez.
- Canlı fiyat hat bazında ayrı Owner onayı ister. `approval: proposed` tarife üretimde açılmaz.

## Paylar (K15 kesin)

| Durum | Site | AGOS | Tedarikçi |
| -- | -- | -- | -- |
| Shuttle, başka tedarikçi | %20 | %10 | %70 |
| Shuttle, alanyagroup.com satışı | %20 (`alanya-group`) | %10 | %70 |
| Shuttle, site kendi aracıyla (yetkisi doğrulanmış) | 0 | %10 | %90 |
| Private/VIP | satış − hak ediş | 0 | site belirler |

Yuvarlama: tedarikçi ve site payı aşağı yuvarlanır; kalan cent AGOS'a. Tek politika `shuttle-split-v1` (7000/2000/1000 bps). Kod ve DB seed'i aynı olmalı (testli).

## Tahsilat ve komisyon (T2 taslak)

- Shuttle'da müşteriden **tedarikçi** tahsil eder. Tahsil eden ve ilk yöntem sonradan değişmez.
- Her tahsilat ayrı hareket, rezervasyon başına **tekil referans** (dekont/fiş no) ister.
- Komisyon yalnız **fiilen tahsil edilen** tutar üzerinden, fiyatla sınırlı. Orijinal fiyat değişmez.
- Transfer tamamlanmadan pay ödenebilir olmaz.
- Tahsil edilmeyen tutar ödemeye girmez. "Kalan müşteri borcu" listesinde durur.
- Private/VIP kısmi tahsilatta hak ediş ve site payı tahsilatla orantılı bölünür (**aday kural**, teyit bekliyor).

## İade ve fazla ödeme (T1 taslak)

- Müşteriden fazla alınan → müşteriye iade (`customer_refund_due`). Pay fiyatı aşmaz.
- Tedarikçi fazla komisyon ödediyse → ödeyene iade (`credit_due`; iade dekontu `overpayment_refund`).
- İade sonrası komisyon yeniden hesaplanır: sonraki haftaya negatif `refund_correction` fark kaydı.
- Mahsup yalnız tarafların **yazılı onayı** (`written_approval_reference`) ve 2FA'lı yetkiliyle.
- **D-F03:** Yeni komisyon (tedarikçi → site) ile iade düzeltmesi (site → tedarikçi) aynı kalemde netleşmez. Ekstrede iki ayrı brüt kalem görünür; netleştirme yalnız yazılı onaylı mahsupla yapılır.
- **D-F04:** Müşteriye yapılan iade (onaylı iyi niyet iadesi dahil) müşteri borcu yaratmaz. Müşteri borcu = fiyat − brüt tahsilat.
- Her iade ve düzeltme ayrı kayıt ve kanıt referansı taşır.

## Haftalık kapanış

- Hafta: ISO, Europe/Istanbul. Pzt 00:00 – Paz 23:59. Önerilen ödeme son tarihi Salı 18:00.
- Fark modeli: `pay(hafta sonuna kadarki net tahsilat, rezervasyonun dondurulmuş politikası) − önceki kapanışlarda KAYITLI paylar` → `SettlementEntry`. Bir rezervasyon bir haftada en fazla bir kayıt.
- **D-F05:** Önceki paylar güncel politikayla yeniden hesaplanmaz; gerçek fark kayıtlarının toplamı kullanılır. Bölüşüm politikası fiyatla birlikte dondurulur. Bilinmeyen politika hata verir; güncel politika onun yerine sessizce kullanılmaz.
- **D-F06:** Önceden hesaplanmış iş iptal edilirse iptalin olduğu hafta bir kez tam ters kayıt (`cancellation_reversal`) yazılır. Müşteri iadesi istisna listesinde izlenir.
- **Küsurat (D-F02, AÇIK, H-23):**
  - Bugünkü kural: tedarikçi ve site payı aşağı yuvarlanır, kalan kuruş AGOS'a. Kümülatif AGOS payı hiçbir zaman tam %10'un altına düşmez.
  - Ama tek bir haftanın küçük farkında AGOS payı eksiye düşebilir. Örnek: 49,99 € sonrası son 1 kuruş → AGOS −1, site +1, tedarikçi +1.
  - Politika kararı gelmeden algoritma değiştirilmez.
- Kapanış: yalnız hafta bitince, bir kez, sırayla. Kapanış görüntüsü donar.
- Durduran istisnalar: iptal, tahsilattan sonra iptal, itiraz, mükerrer şüphesi. Fazla tahsilat durdurmaz.
- Çıktılar:
  - tedarikçi ekstresi
  - site alacakları
  - AGOS payları
  - dekont eşleştirme (ödendi / kısmi / ödenmedi / fazla / alacak / borç yok; geç ödeme işareti)
  - eşleşmeyen dekontlar
  - borç ve ihtilaf listesi
  - istisnalar
  - kalan müşteri borçları
  - düzeltmeler
  - itirazlar
  - SaaS abonelik dekontları (komisyonla eşleşmez)

## Kapanmış haftaya itiraz (T3 taslak)

- Süre: ekstrenin tarafa **iletildiği** andan itibaren 7 takvim günü. İlk iletim zamanı geçerlidir.
- Kayıt: `ITZ-<hafta>-NNNN`, itiraz eden, gerekçe. Kişisel veri maskelenir.
- Dekont, rezervasyon ve tahsilat kayıtları karşılaştırılır.
- Karar: yetkili yönetici (2FA), gerekçeli, bir kez.
- Kabul edilen fark sonraki **açık** döneme yazılır.
- Yasal hak, sahtecilik şüphesi veya hesap hatası süre nedeniyle **otomatik reddedilmez**.

## Test senaryoları (zorunlu; değişiklikten önce ve sonra çalıştır: `npm run check`)

| # | Senaryo | Beklenen | Test yeri |
| -- | -- | -- | -- |
| 1 | 30/50/60/70 € shuttle payları | 6/3/21 · 10/5/35 · 12/6/42 · 14/7/49 | settlement.test: Owner tablosu |
| 2 | alanyagroup.com satışı | site payı `alanya-group` tarafına | settlement.test |
| 3 | Site kendi aracıyla | 0 / %10 / %90; doğrulanmamış site reddi | settlement.test, api.test |
| 4 | DB seed = kod politikası | 7000/2000/1000 | settlement.test |
| 5 | 50 € rezervasyon, 30 € tahsil | 6/3/21; kalan borç 20 € | settlement.test T2; api.test |
| 6 | Kalan 20 € sonraki hafta tahsil | +4/+2/+14 | api.test W46; örnek rapor |
| 7 | Tamamlanmamış iş | pay yok | settlement.test |
| 8 | 35 € tahsil, fiyat 30 € | pay 30 € üzerinden; 5 € müşteriye iade | settlement.test T1; api.test |
| 9 | Kapanmış haftada 50 € iade | sonraki hafta −10/−5/−35 | api.test; örnek rapor W46 |
| 10 | Tedarikçi fazla ödeme | `credit_due`; iade dekontu kapatır | settlement.test T1 |
| 11 | Mahsup yazılı onaysız / 2FA'sız | reddedilir | api.test offset |
| 12 | Aynı dekont/fiş referansı iki kez | reddedilir | api.test; DB probu P4 |
| 13 | İtiraz 7 gün içinde / dışında | ikisi de kaydedilir; dışarıdaki "süre dışı" notlu, otomatik ret yok | settlement.test T3 |
| 14 | İtiraz kabulü | düzeltme sonraki açık haftada | api.test T3 |
| 15 | 5+ fiyat: 2FA'sız, operator rolü, gerekçesiz, sınır dışı, sınırsız hat | hepsi reddedilir | api.test K17 |
| 16 | 5+ fiyat sınır içinde | kabul + denetim kaydı + outbox olayı | api.test K17 |
| 17 | AYT-GZP hattı / pasif hat | tarife reddi / `route_inactive` | core.test, settlement.test; DB probu P14 |
| 18 | Hafta sınırı | Paz 23:59:59 → W45; Pzt 00:00 → W46; 53. hafta | settlement.test |
| 19 | Kapanmış hafta raporu | dondurulmuş, itirazlar dahil | api.test |
| 20 | Üretim açılışı | 8 koşul eksikse çıkış 1 (bugün her durumda) | elle: `NODE_ENV=production node apps/api/src/main.ts` |
| 21 | DB negatif probları | 16/16 ERROR | `packages/db/probes/0001_probes.sql` |
| 22 | Aynı hafta: yeni komisyon +4 €, iade düzeltmesi −10 € (aynı taraflar) | iki ayrı brüt kalem, netleşme yok | `settlement.regression.test` D-F03 |
| 23 | Tam iade / iyi niyet iadesi / kısmi tahsilat sonrası iade | müşteri borcu oluşmaz veya artmaz | `settlement.regression.test` D-F04 |
| 24 | Hesaplanmış iş sonraki hafta iptal (iadeli / iadesiz) | iptal haftasında bir kez tam ters kayıt | `settlement.regression.test` D-F06 |
| 25 | Politika değişikliği sonrası kalan tahsilat | rezervasyonun dondurulmuş politikasıyla; toplam pay v1 ile aynı | `settlement.regression.test` D-F05, `policy-freeze.test` |
| 26 | 49,99 € sonrası son 1 kuruş | bugün AGOS −1 (todo, H-23 bekliyor) | `settlement.regression.test` D-F02 |

## Yapma

- Komisyonu satış fiyatı üzerinden, tahsilat beklemeden yazma.
- Kapanmış haftayı yeniden hesaplayıp üzerine yazma.
- Mahsubu otomatik yapma.
- 5+ için tarifeyi uzatma (ekstrapolasyon) veya varsayılan fiyat koyma.
- Shuttle'a ×1,30 havuz kuralını uygulama.
- Gerçek müşteri verisini test, rapor veya Linear'a koyma.

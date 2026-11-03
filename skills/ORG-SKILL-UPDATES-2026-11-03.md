# Org skill güncelleme önerileri · 03.11.2026

Org skill'leri (agos-pricing-matrix, agos-pool-finance) senkronize ve bu oturumdan **salt okunur**. Bu dosya önerilen değişiklikleri satır satır verir. Uygulamayı skill sahibi yapar. SEL-456'daki 5 skill adayıyla **üç yönlü birleştirme** gerekir: mevcut org metni + SEL-456 adayı + bu öneri.

Durum: K15 kesin. T1/T2/T3/K17/K8 **taslak**. Taslak kurallar skill'e "TASLAK (Owner kabulü bekliyor)" etiketiyle yazılmalı.

Yeni skill adayı: [`agos-consortium-settlement/SKILL.md`](./agos-consortium-settlement/SKILL.md) (hesaplaşma kuralları + 21 test senaryosu).

## agos-pricing-matrix

| # | Yer | Mevcut | Önerilen |
| -- | -- | -- | -- |
| S1 | §A başlığı | "Shuttle — sabit tarife (Alanya Group kendisi satıp işletir)" | "Shuttle — sabit tarife (tek fiyat kaynağı; işi tedarikçi yapar ve tahsil eder, K15)" |
| S2 | §A tarife satırı | "4. yolcudan itibaren her ek yolcu +10 € (4 = 70 €, 5 = 80 €)" | "Owner kararı 03.11.2026: rezervasyon toplamı 1 kişi 30 €, 2 kişi 50 €, 3 kişi 60 €, 4 kişi 70 €. 5+ otomatik fiyat YOK; eski 80 € aktif edilmez. 5+ manuel fiyat yalnız hattın Owner onaylı min/max sınırı içinde, admin + 2FA ile, denetim kaydıyla (K17 taslak)." |
| S3 | Üye kuralı | "üye %20 komisyon kazanır (komisyon tabanı: müşteri fiyatı varsayımı — teyit et)" | "Satış kanalı %20, AGOS %10, tedarikçi %70 (K15 kesin; alanyagroup.com dahil). Taban: **fiilen tahsil edilen** tutar, fiyatla sınırlı (T2 taslak). Site kendi aracıyla: 0/%10/%90." Açık soru 8 kaldırılır. |
| S4 | Test verisi | "Shuttle 1-8 yolcu" | "Shuttle otomatik 1–4 yolcu; 5+ `requires_approval`; sınır dışı manuel fiyat reddi" |
| S5 | Hat kuralı | "Doğrudan AYT ↔ GZP shuttle ürünü yok; iki bacak" | Kalır. Ek: "Her yön ayrı kod (AYT-ALN/ALN-AYT …; GZP-ALN/ALN-GZP pilot). Her hat: tarife sürümü, başlangıç tarihi, kapsam, aktif/pasif (K8 taslak)." |
| S6 | Veri modeli `shuttle_fares` | "(veya taban + ek yolcu kuralı)" | "Ek yolcu kuralı yok; 5+ için hat bazında `manual_min/max` + onay durumu" |

## agos-pool-finance

| # | Yer | Mevcut | Önerilen |
| -- | -- | -- | -- |
| S7 | §3 havuz | "Shuttle Alanya Group'un kendi işidir; havuza girmez." | "Shuttle havuza girmez; tedarikçiye atanır, tahsilatı tedarikçi yapar, haftalık ekstreyle %20 site / %10 AGOS öder (K15)." |
| S8 | KARARLAŞTI satırı | "nakit/kart otomatik mahsup" | "Mahsup yalnız ilgili tarafların yazılı onayıyla (T1 taslak); otomatik mahsup yok. Fazla tahsilat müşteriye, fazla komisyon ödeyene iade edilir." |
| S9 | Haftalık kapanış | (cari hesap haftalık kapanır) | Ek: "Kapanmış hafta değişmez; iade/geç tahsilat sonraki haftaya fark kaydı. İtiraz: ekstre iletiminden 7 gün, gerekçeli karar; yasal hak/sahtecilik/hesap hatası süre nedeniyle otomatik reddedilmez (T3 taslak)." |
| S10 | ×1,30 | Havuz teklif kuralı | Değişmez. Ek not: "Shuttle'a uygulanmaz." |

## Uygulama sırası

1. SEL-456 adaylarını al, bu tabloyla karşılaştır.
2. Taslak kuralları "TASLAK" etiketiyle yaz; Owner kabulünden sonra etiketi kaldır.
3. Değişikliği yazan kendisi kabul etmez; ayrı bir inceleyici onaylar.

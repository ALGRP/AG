# QA-F14 · Tahsil edilmiş ama tamamlanmamış rezervasyonların ekstrede görünmesi (Codex Paket-02, 3. bölüm)

**Tarih:** 03.11.2026 · **Hazırlayan:** Claude · **Durum:** `LOCAL_ONLY · INDEPENDENT_HUMAN_ACCEPTED=NO · G0 HOLD`
**Taban:** PR #9 `afaac11` (+ Claude inceleme commit'leri). Canlı veri, CRS ve kimlik sağlayıcısı yok.

## 1. Sorun (inceleme)

Tedarikçi müşteriden para almış ama transfer tamamlanmamışsa rezervasyon haftalık ekstrede hiçbir yerde görünmüyor: ne pay kaydı, ne istisna, ne müşteri bakiyesi. Tedarikçide müşteri parası durduğu hâlde ekstre sessiz.

Kod yolu:
- `apps/api/src/service.ts` `toLine()`: tahsilat için fiyat ve tedarikçi zorunlu (`recordCollection` bunu zaten şart koşuyor). Yani tahsil edilmiş her rezervasyonun bir ekstre satırı **var**.
- `packages/core/src/settlement.ts` `weeklyReport()`: `completed_at` yok veya hafta sonundan sonraysa satır sessizce atlanıyor (T2: tamamlanmadan pay yok). Doğru kural, ama görünürlük eksik.
- `exceptionReasons()` bu durum için bir neden üretmiyor.

## 2. Kural (karar değişikliği yok)

- T2 aynen kalır: **tamamlanmadan pay yok.** Bu görev hiçbir pay, borç veya ödeme üretmez.
- Yeni istisna nedeni `collected_not_completed`. Koşulların hepsi gerekir:
  - rezervasyon iptal edilmemiş,
  - hafta sonuna kadar net tahsilat > 0,
  - `completed_at` yok veya hafta sonundan sonra.
- **Durdurucu değil** (`BLOCKING` listesine girmez); yalnız görünürlük.
- **Taşınır** (`OPEN_EXCEPTION_REASONS`): tamamlanana kadar her hafta görünür; olay zamanı ilk tahsilat.
- İptal varsa yalnız mevcut `cancelled_after_collection` görünür; ikinci satır yok.
- Rapor etiketi: "Tahsil edildi, transfer tamamlanmadı — müşteri parası tedarikçide".
- İstisnadaki `collected_amount` net tahsilat; `customer_refund_due` 0 (iade kararı ayrı).

## 3. Kabul testleri

Kural: `todo` kaldırılır, assertion değişmeden geçer.

| Test | Dosya | Ne doğrular | Bugün |
| -- | -- | -- | -- |
| A2.7 | `qa-independent/a02-partial-collection.test.ts` | Tahsil edilmiş, tamamlanmamış iş W45 ekstresinde görünür | `todo` (kırmızı) |
| **A2.8** (yeni) | aynı | Yaşam döngüsü: W45 ve W46'da istisna, pay 0; W47'de tamamlanınca pay 3000/600/300/2100 ve istisna yok; kapanmış W45 değişmez; istisnada `collected_amount = 3000` | `todo` (kırmızı) |
| **A2.9** (yeni) | aynı | Tahsilattan sonra iptal: yalnız `cancelled_after_collection` | geçiyor (koruma testi) |
| **A2.10** (yeni) | aynı | Site kimliği kendi istisnasını görür, rakip sitenin rezervasyonunu görmez (QA-F3 filtresiyle) | `todo` (kırmızı) |

Yan etki kontrolü: `npm run report:sample` W45 örnek raporu değişirse fark commit mesajında gösterilir. Örnek veride tamamlanmamış tahsilat yoksa rapor byte düzeyinde aynı kalmalı.

## 4. Dosyalar

| Dosya | Değişiklik |
| -- | -- |
| `packages/core/src/settlement.ts` | `ExceptionReason` + `"collected_not_completed"`; `exceptionReasons()`; `OPEN_EXCEPTION_REASONS`; istisna olay zamanı (ilk tahsilat) |
| `apps/api/src/report-html.ts` | `REASON_TR` etiketi |
| `packages/db/migrations/` | Şemada istisna nedeni CHECK listesi varsa yeni göçle genişletilir (0001 değişmez) |

## 5. Commit ve beklenen sonuç

Tek commit. Sonrası: A2.7, A2.8, A2.10 yeşil; `todo` 3 azalır. `npm run check` 0 kaldı.

## 6. Sonraki sıra (değişmedi)

1. QA-F9 · makbuz tahsisi: varsayılan red; tahsis modeli **H-26** kararına bağlı.
2. QA-F11 · satış kaynağı doğrulaması: alan adına bağlı Turnstile; `Origin` yetki vermez.
3. PKG-F04b · nakitsiz kredi: krediyi kim taşır **H-25** kararına bağlı; karar gelene kadar kredi yalnız müşteri borcunu kapatır.

Önce: PR1-N7 (A4.15) küçük ayrı commit.

# QA-F9 · Aynı makbuzun birden fazla rezervasyonda kullanılması (Codex Paket-02, 4. bölüm)

**Tarih:** 04.11.2026 · **Hazırlayan:** Claude · **Durum:** `LOCAL_ONLY · INDEPENDENT_HUMAN_ACCEPTED=NO · G0 HOLD`
**Taban:** PR #9 `7971f7f` (+ Claude inceleme commit'i). Canlı veri, CRS ve ödeme yok.

## 1. Sorun (inceleme)

`apps/api/src/service.ts` `recordCollection` yalnız **aynı rezervasyondaki** tekrar referansı reddediyor (`reference_already_recorded`). Aynı tedarikçinin aynı makbuz numarası başka bir rezervasyona tam tutarla yazılabiliyor. Ekstrede tek fiziksel tahsilat iki kez görünür; komisyon iki kez hesaplanır.

## 2. Kural

- **Varsayılan red.** Aynı tahsil eden taraf + normalize makbuz referansı başka bir rezervasyonda kayıtlıysa → 409 `reference_used_on_other_booking`.
  - Tahsil eden taraf: `collector = supplier` ise `supplierId`; `collector = site` ise satış sitesinin tarafı (`sellingPartyId`).
  - Normalizasyon: `normalizeBankReference` ile aynı (boşluksuz, büyük harf).
  - Kontrol tek işlem içinde; eşzamanlı iki istekten biri kazanır.
- Farklı tahsil eden tarafların aynı numarası serbest (iki tedarikçi aynı makbuz numarasını basabilir).
- İade referansları (`refundReference`) ayrı ad alanı; bu kural onları kapsamaz.
- **Açık karar H-26:** Bir makbuz gerçekten birden çok rezervasyonu kapsıyorsa (grup ödemesi) açık tahsis modeli gerekir: makbuz kaydı + rezervasyon başına tahsis, toplam ≤ makbuz tutarı. **Bu görev tahsis modelini yazmaz**; karar gelene kadar red kalır. Gerekirse yönetici elle ayrı referanslarla kaydeder.
- Yeni para kuralı yok; pay, borç ve ödeme hesabı değişmez.

## 3. Kabul testleri

Kural: `todo` kaldırılır, assertion değişmeden geçer.

| Test | Dosya | Ne doğrular | Bugün |
| -- | -- | -- | -- |
| A5.4 | `qa-independent/a05-duplicates.test.ts` | Aynı tedarikçinin aynı makbuzu ikinci rezervasyonda → 409 | `todo` |
| **A5.7** (yeni) | aynı | Büyük/küçük harf farkı aynı makbuz sayılır → 409 | `todo` |
| **A5.8** (yeni) | aynı | Farklı tedarikçinin aynı numarası serbest | geçiyor (koruma testi) |
| **A5.9** (yeni) | aynı | Eşzamanlı iki istek → tam olarak bir 200, bir 409 | `todo` |
| A5.3 | aynı | Aynı rezervasyonda tekrar referans → 409 (mevcut) | geçiyor; geçmeye devam etmeli |

A5.4'ün `todo` etiketi "tahsis modeli kararı" diyor. Varsayılan red H-26'yı önceden kesinleştirmez; yalnız karar gelene kadar güvenli tarafta kalır. Etiket A5.4'ün kaldırılmasıyla birlikte kalkar.

## 4. Dosyalar

| Dosya | Değişiklik |
| -- | -- |
| `apps/api/src/service.ts` | `recordCollection`: işlem içinde tüm rezervasyonlarda (tahsil eden taraf, normalize referans) kontrolü |
| `apps/api/src/store.ts` | İsteğe bağlı: `MemoryStore`'da aynı anahtar için atomik kontrol (QA-F2 deseni) |
| PostgreSQL (Paket-03) | `booking_money_event` için `UNIQUE (collector_party_id, upper(regexp_replace(reference, '\s', '', 'g'))) WHERE kind = 'collection'`; şemada `collector_party_id` kolonu yoksa yeni göçle eklenir |

## 4a. Veri modeli (H-26'dan bağımsız, sonradan genişletilebilir)

Bugünkü şema: `booking_money_event` yalnız `UNIQUE (booking_id, reference)` taşıyor (0001, satır ~388); tahsil eden taraf kolonu yok.

**Paket-02 (bu görev, yalnız uygulama katmanı):**
- Tekil anahtar: `slipKey = <tahsil eden taraf>|<normalize referans>`.
- Kontrol `recordCollection` işleminin içinde; tüm rezervasyonların tahsilat olayları taranır. İptal edilmiş veya iade edilmiş rezervasyondaki makbuz da **dolu** sayılır (olaylar ekleme-yalnız; iade makbuzu serbest bırakmaz).
- Yeniden rezervasyonda gerçek bir taşıma gerekiyorsa yönetici yeni bir referansla ve gerekçeyle kaydeder; otomatik taşıma yok.

**Paket-03 (DB göçü adayı, yalnız yerel):**
- `collection_slip (id, collector_party_id, reference_norm, amount, currency, first_seen_at, UNIQUE (collector_party_id, reference_norm))`.
- `booking_money_event.slip_id` → `collection_slip(id)`; tahsilat olayı makbuza bağlanır.
- H-26 **"hayır"** derse: `UNIQUE (slip_id) WHERE kind = 'collection'` (bir makbuz, bir rezervasyon).
- H-26 **"evet, tahsisle"** derse: bu kısıt kaldırılır ve `collection_slip_allocation (slip_id, booking_id, amount)` eklenir; tahsislerin toplamı ≤ `collection_slip.amount` (tetikleyiciyle). Mevcut olay satırları değişmez; veri göçü gerekmez.
- Her iki durumda da RLS: makbuz yalnız tahsil eden tarafa ve platforma görünür.

Bu model H-26'yı önceden kesinleştirmez: bugün varsayılan red, karar gelince yalnız bir kısıt değişir.

## 5. Sonraki sıra

1. QA-F11 · satış kaynağı doğrulaması (A10.2): alan adına bağlı Turnstile; `Origin` yetki vermez.
2. PKG-F04b · nakitsiz kredi (H-25).
3. QA-F4 · DB kısıtları (35 prob), ayrı paket.

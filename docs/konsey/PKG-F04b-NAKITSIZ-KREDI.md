# PKG-F04b · Onaylı nakitsiz müşteri kredisi (Codex Paket-02, 6. bölüm)

**Tarih:** 04.11.2026 · **Hazırlayan:** Claude · **Durum:** `LOCAL_ONLY · INDEPENDENT_HUMAN_ACCEPTED=NO · G0 HOLD`
**Taban:** PR #9 `f6d5662` (+ Claude inceleme commit'i). Gerçek ödeme, iade veya muhasebe kaydı yok.

## 1. Sorun

50 € işte 30 € nakit tahsil edildi; kalan 20 € için müşteriye onaylı bir hizmet kredisi verildi (gecikme, hizmet kusuru). Sistem bunu kaydedemiyor; müşteri borcu 20 € görünmeye devam ediyor. Regresyon testi `packages/core/src/settlement.regression.test.ts` "paket F04" `todo`.

## 2. Kural (H-25 açık; yalnız geçici davranış)

- Kredi **yalnız müşteri borcunu kapatır.** Müşteri bakiyesi = fiyat − min(brüt nakit tahsilat, fiyat) − onaylı krediler.
- **Komisyon tabanı değişmez:** pay yalnız gerçek nakit tahsilattan (T2). 30 € → 6 / 3 / 21.
- **Taraflar arası para kaydı yok.** Kredi için `obligations`, `adjustments` veya mahsup satırı üretilmez. Krediyi kim taşır (tedarikçi, site, AGOS) **H-25** kararıdır; karar gelince ayrı iş olur.
- Onay: yalnız `admin` / `finance_manager`, 2FA, gerekçe ≥ 5 karakter, PII maskeli. Statik HTTP anahtarı → 403 `mfa_required`; site kimliği → 403.
- Referans: `creditReference`, normalize edilerek (boşluksuz, büyük harf) sistem genelinde tekil → 409 `duplicate_credit_reference`.
- Tutar: 0 < tutar ≤ kalan borç (önceki kredilerden sonra) → aksi 422 `credit_exceeds_remaining`.
- İptal edilmiş rezervasyon → 409 (kredi yok; iptal kendi akışında).
- Kayıt ekleme-yalnız: `creditNotes: { id, amountMinor, reference, reason, actorId, actorRole, at }[]`; outbox'a `audit.customer_credit_approved` (anahtar kredi kimliğiyle).
- Kapanmış hafta değişmez; kredi, verildiği andan sonraki açık haftaların müşteri bakiyesine yansır.
- **Açık alt soru (H-25'e eklenir):** Kredi verildikten sonra müşteri kalan tutarı yine nakit öderse fazla tahsilat fiyat − kredi'ye göre mi hesaplanır? Karar gelene kadar fazla tahsilat bugünkü gibi fiyata göre hesaplanır ve istisna olarak görünür.

## 3. Kabul testleri

| Test | Dosya | Ne doğrular |
| -- | -- | -- |
| paket F04 | `packages/core/src/settlement.regression.test.ts` | `approved_credit_minor` ile müşteri borcu 0 |
| **A14.1** (yeni, `todo`) | `qa-independent/a14-credit-note.test.ts` | Borç 0; pay 3000/600/300/2100; kredi için taraflar arası satır yok |
| **A14.2** (yeni, `todo`) | aynı | 2FA, rol, gerekçe, tutar sınırı, harf duyarsız tekil referans |
| **A14.3** (yeni, `todo`) | aynı | `POST /v1/admin/bookings/:ref/credit-note`: statik anahtar 403 `mfa_required`, site kimliği 403 |
| **A14.4** (yeni, `todo`) | aynı | Kapanmış W45 değişmez; W46'da borç yok; iptal edilmiş rezervasyona kredi 409 |

Sözleşme: `BookingService.approveCustomerCredit(actor, ref, { amountMinor, reason, creditReference })` → 201 ve rezervasyonun güncel yönetim görünümü.

## 4. Dosyalar

| Dosya | Değişiklik |
| -- | -- |
| `apps/api/src/store.ts` | `StoredBooking.creditNotes` |
| `apps/api/src/service.ts` | `approveCustomerCredit`; `toLine` içinde `approved_credit_minor` |
| `apps/api/src/http.ts` | `credit-note` ucu; site kimliğine kapalı |
| `packages/core/src/settlement.ts` | `SettlementLine.approved_credit_minor?`; müşteri bakiyesi |
| `apps/api/src/report-html.ts` | Bakiye satırında kredi tutarı (isteğe bağlı) |

## 5. Kapsam dışı

Krediyi taşıyan tarafın belirlenmesi (H-25), gerçek iade ödemesi, fatura veya muhasebe kaydı, mali müşavir onayı. Hepsi HOLD.


## 6. Codex yerel uygulama kanıtı (04.11.2026)

Kod geçici kuralı uygular; H-25 kararı **alınmış değildir**. StoredBooking.creditNotes ekleme-yalnız kayıt olarak para hareketlerinden ayrıdır. approveCustomerCredit gerçek servis yolunda MFA, yetkili rol, gerekçe, benzersiz referans ve tahsilat+önceki krediler sonrasındaki kalan borç sınırını kontrol eder. Sentetik yerel yönetici aktöründe MFA doğrulandı varsayılır; **gerçek kimlik sağlayıcı SEL-332 yoktur** ve HTTP üzerindeki statik yönetici anahtarı kredi onaylayamaz.

SettlementLine.approved_credit_minor ve zaman damgalı kredi olayları **yalnız müşteri bakiyesine** uygulanır. Tahsilat/pay, obligations, adjustments ve banka dekontları krediden etkilenmez. Geç verilen kredi kapanmış haftaları değiştirmez; henüz kapanmamış önceki haftada da geçmişe uygulanmaz.

Kabul kanıtı: A14.1–A14.4 ve paket F04 artık todo değil; ek A14.5 kontrolleri (başka rezervasyonda kredi referansı, 2FA'lı fakat site kapsamlı aktör, gerekçe PII maskesi, kayıt ve outbox denetimi, önceki hafta, nakit/mahsup yok) yerel çalışır. Tam test sonucu ve commit SHA PR #9 yorumundadır.

Açık sınırlar: gerçek kredi tahakkuku/finansman tarafı H-25, vergi-fatura etkisi, kredi sonrasında yapılan gerçek ek tahsilatların iade hesabı, kalıcı CRS şeması, bağımsız insan kabulü ve G0. Üretim, ödeme ve PR birleştirme HOLD.

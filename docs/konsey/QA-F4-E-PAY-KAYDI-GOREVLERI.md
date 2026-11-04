# QA-F4 / E · Pay kaydı bütünlüğü: yerel uygulama görevleri (Codex Paket-03)

**Tarih:** 04.11.2026 · **Hazırlayan:** Claude · **Durum:** `LOCAL_ONLY · INDEPENDENT_HUMAN_ACCEPTED=NO · G0 HOLD`
**Taban:** PR #9 `9f4a550` (0003 + PR3-N1 düzeltmesi; PASS aday). Yalnız atılabilir PostgreSQL 16. **H-23 (küsurat) açık:** bu paket bugünkü algoritmayı kopyalar, politika seçmez.

## Kapsam: problar Q01, Q02, Q03, Q04, Q10, Q11

| Görev | Prob | Kural | Mekanizma (`0004_entry_integrity.sql`) |
| -- | -- | -- | -- |
| E1 | — | SQL pay fonksiyonu = uygulama | `ag_f4_split_on_collected(...)`: `splitOnCollected` / `shuttleSplit` ile **birebir** aynı tamsayı aritmetiği ve yuvarlama. Shuttle: politika bps (`split_policy`), kendi aracı 90/10. Private: `floor(c × site_commission / final)`, AGOS 0. |
| E2 | Q01 | Aynı taban iki kez sayılmaz | `base_before` = aynı rezervasyonun önceki kayıtlarındaki `base_after` toplamı (yoksa 0). Mevcut `UNIQUE (booking_id, week_id)` korunur. |
| E3 | Q02 | Taban ≤ fiyat | Tetikleyici: `base_after <= booking.final_booking_price`. |
| E4 | Q03 | Shuttle payı politikaya uyar | Tetikleyici: kümülatif (önceki kayıtlar + yeni delta) = `ag_f4_split_on_collected(base_after)`. **Delta değil kümülatif** karşılaştırılır (D-F05: kayıtlı paylar). |
| E5 | Q04 | Private'ta AGOS payı 0 | `CHECK` (tetikleyici, rezervasyon türüyle): `service_type = 'private' ⇒ agos_delta = 0`. |
| E6 | Q10 | Bilinmeyen politika yok | `settlement_entry.policy_id` için `split_policy(id)` FK; private politika kimliği (`private-pro-rata-on-collection`) için tabloya kayıt veya izinli liste. |
| E7 | Q11 | Para birimi rezervasyonla aynı | Tetikleyici: `NEW.currency = booking.currency`. |

## Uyumluluk kuralları

- **D-F05 / PKG-F05b:** Kayıtlı paylar dondurulmuş politikayla yazılmış olabilir. `share_mismatch` durumundaki eski kayıtlar için E4, "yeni delta = beklenen kümülatif − **beklenen** önceki" kuralını uygulamalı (uygulamadaki `accountingBefore`). Aksi hâlde istisnadaki rezervasyonun sonraki tahsilatı reddedilir. Bu durum ayrıca test edilmeli.
- **D-F06:** `cancellation_reversal` kaydı kümülatifi sıfıra indirir; E4 bunu kabul etmeli.
- **PR3-N1:** Pay yazımı yalnız aynı işlemde açılan hafta satırına (0003). E tetikleyicileri bu sırayı bozmamalı.
- **H-23:** Uygulamadaki küsurat davranışı (tek haftada AGOS −1 kuruş olabilir) aynen kopyalanır. Değiştirilmez; F02 testi `todo` kalır.

## Kabul testleri

| Test | Dosya | Bugün |
| -- | -- | -- |
| E-PARITY × 4 (shuttle 100 €, 49,99 €, kendi aracı, private) | `packages/db/src/split-parity.test.ts` | `todo` (0004 yok) |
| Q01, Q02, Q03, Q04, Q10, Q11 doğru nedenle red (`AG_F4_*`) | `packages/db/src/schema-probes.test.ts` | `todo` |
| Olumlu: geçerli W44 kapanışı (1000/500/3500) hâlâ commit ediliyor | `packages/db/src/close-lifecycle.test.ts` | geçiyor; geçmeye devam etmeli |
| Olumlu (yazılacak): kısmi tahsilat 30 € → W44 600/300/2100, kalan 20 € → W45 400/200/1400 | `close-lifecycle.test.ts` | Paket-03'te |
| Olumlu (yazılacak): `share_mismatch` sonrası yeni tahsilat ve iptal ters kaydı kabul ediliyor | `close-lifecycle.test.ts` | Paket-03'te |

Kural: `todo` kaldırılır, assertion değişmeden geçer. W probları, RLS testleri ve P1–P16 / C01–C05 yeşil kalır.

## Kapsam dışı

H-23 kararı; canlı veya staging göçü; CRS adaptörü; PR3-N2 (SAVEPOINT; isteğe bağlı).

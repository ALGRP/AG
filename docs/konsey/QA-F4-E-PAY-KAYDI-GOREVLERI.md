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

## 04.11.2026 Codex yerel uygulama kanıtı — 0004 aday

**Durum:** LOCAL_ONLY / CODE_TEST_PASS / CLAUDE_PEER_REVIEW_PENDING / HUMAN_INDEPENDENT_ACCEPTED=NO / LIVE_HOLD. H-23 (küsurat) **karara bağlanmadı**.

Geliştirilen packages/db/migrations/0004_entry_integrity.sql yalnız mevcut E kurallarını uygular. 0001/0002/0003 değiştirilmedi. ag_f4_split_on_collected mevcut uygulamadaki splitOnCollected için tam eşit taban/politika hesabıdır. Shuttle: tedarikçi/site payı aşağı yuvarlanır, kalan AGOS'a; kendi araçlı shuttle: site sıfır, taşıyıcı kendi payına site payını da ekler; private: site payı = floor(tahsilat × site_commission / toplam fiyat), AGOS sıfır. SQL fonksiyonunda private türü için verilen shuttle politika parametresi uygulamada olduğu gibi göz ardı edilir; kaydın izinli özel politika adı tetikleyicide ayrıca doğrulanır.

Yeni kayıt kısıtları: base_before önceki collected_delta toplamıyla eşleşmeli, base_after satış fiyatını aşmamalı, booking para birimi/politika eşleşmeli, private AGOS farkı sıfır, tahsilat farkının üç taraf payı uygulama formülüne uymalı. **D-F05 / PKG-F05b:** önceki gerçek kayıttaki farklı pay, yeni tahsilat farkını reddettirmez; yeni fark, beklenen eski/son taban üzerinden hesaplanır. **D-F06:** iptal, daha önce kaydedilmiş payların *gerçek toplamını* ters çevirir. settlement_entry ekleme-yalnız ve 0003 kapanmış hafta sınırı korunur.

**Gerçekten koşulanlar — atılabilir PostgreSQL 16, network none:**
- SQL-uygulama pay eşitliği: 4/4 PASS; dört fiyat/kapsam senaryosunda her kuruş (0–10.000).
- Orijinal SQL Q01/Q02/Q03/Q04/Q10/Q11: 6/6 PASS, her biri beklenen AG_F4_* finans hata nedeni ile. Düz olmayan W kapısı hatası başarı sayılmadı.
- Olumlu finans döngüsü: 3/3 PASS. Geçmişte bitmiş iki ardışık haftada 30 €→6/3/21 ve 20 €→4/2/14; eski farklı paylı kayıttan sonra tahsilat ve iptal ters hareketi; 1 kuruş sonraki tahsilatta AGOS −1 kuruş farkı.
- Teklik, kapanış sırası ve kiracı RLS: mevcut W pozitif yaşam döngüsü ve diğer veritabanı testlerinde PASS. Toplam PG16: **53 test, 31 PASS, 22 TODO, 0 FAIL**. Bu 22'nin 21'i eski QA-F4, 1'i isteğe bağlı PR3-N2 SAVEPOINT testidir.

**Kalan blokajlar:** gerçek CRS şeması/rol/transaction adapter ve eşzamanlılık kabulü (SEL-331/332), PR3-N2 alt işlem XID false reject, ileride H-23 kararının politika değişikliği gerektirmesi, eski pay kayıtları için gerçek veri geçişi, bağımsız insan QA. 0004 canlı/staging CRS'ye uygulanmadı, gerçek ödeme/rezervasyon yapılmadı.

**Sonraki iş:** Claude exact-HEAD akran incelemesinde E eşitliği/pozitif/negatif davranışları ve RLS/rol/PR3-N2 ayrımını doğrular. Daha sonraki QA-F4/M para hareketleri göçü ayrı commit ve ayrı kabul kapısıdır.

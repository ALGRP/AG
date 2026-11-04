# QA-F4 / M · Para hareketleri: uygulama şartnamesi (Codex Paket-03)

**Tarih:** 04.11.2026 · **Hazırlayan:** Claude · **Durum:** `LOCAL_ONLY · INDEPENDENT_HUMAN_ACCEPTED=NO · G0 HOLD`
**Taban:** PR #9 `3d1d3a6` (0001–0004 adayları). Yalnız atılabilir PostgreSQL 16. Gerçek CRS, staging, canlı veritabanı ve ödeme sistemi değişmez. **H-23 açık.**
**Önkoşul:** PR3-N3 (onaylı `split_policy` değişmez ve silinmez) önce kapanır.

## Problar ve kurallar

| Görev | Prob | Bugün kabul edilen ihlal | Kural | Mekanizma (`0005_money_events.sql`) | Beklenen hata |
| -- | -- | -- | -- | -- | -- |
| M1 | Q12 | Hiç tahsilatı olmayan rezervasyona 90 € müşteri iadesi | Bir rezervasyonun toplam iadesi toplam tahsilatını aşamaz | `BEFORE INSERT ON booking_money_event` (kind = refund): `sum(refund) + NEW.amount <= sum(collection)`; rezervasyon satırında `SELECT … FOR UPDATE` (eşzamanlı iki iade) | `AG_F4_REFUND_EXCEEDS_COLLECTED` |
| M2 | Q13 | Shuttle tahsilatını site yapmış | Shuttle'da tahsil eden yalnız tedarikçi; private/VIP'de site veya tedarikçi | Aynı tetikleyici: `booking.service_type = 'shuttle' AND NEW.collector <> 'supplier'` → ret | `AG_F4_SHUTTLE_COLLECTOR_NOT_SUPPLIER` |
| M3 | Q15 | Uzlaşmış rezervasyonun `collected_amount` değeri 5000 → 0 | `booking.collected_amount` / `refunded_amount`, para hareketlerinden türeyen önbellektir; olayla tutarsız değiştirilemez | `BEFORE UPDATE ON booking`: `NEW.collected_amount = sum(collection)` ve `NEW.refunded_amount = sum(refund)` (olaylardan), aksi ret. Alternatif: bu iki kolonu yalnız olay tetikleyicisi güncellesin | `AG_F4_COLLECTED_AMOUNT_DRIFT` |
| M4 | Q16 | Aynı ödeyenin `TR-0001` dekontu `tr-0001` olarak ikinci kez | Aynı ödeyen + normalize referans tekil (QA-F8 ile aynı normalizasyon) | `CREATE UNIQUE INDEX … ON bank_receipt (payer_id, upper(regexp_replace(bank_reference, '\s', '', 'g')))`; ihlal tetikleyicide anlamlı hataya çevrilir | `AG_F4_RECEIPT_DUPLICATE` |

Ayrıca (prob yok, aynı göçte önerilir): `booking_money_event` için tahsil eden taraf + normalize referans tekilliği (QA-F9; H-26 açık, varsayılan red). Q harici olduğu için ayrı test (`A5.4` muadili SQL) ile.

## Kabul

- `schema-probes.test.ts`: Q12, Q13, Q15, Q16 özgün SQL ile **tam hata nedeniyle** reddedilir (E grubundaki desen: ayrı veritabanı, 0001 → tohum → 0002 … 0005; kapanmış hafta veya RLS reddi geçti sayılmaz).
- **Koruma testleri (bugün geçiyor, değişmeden geçmeli):** `packages/db/src/money-lifecycle.test.ts`
  - shuttle: tedarikçi 50 € tahsil eder, 20 € iade eder;
  - private: site tahsil eder;
  - farklı ödeyenden aynı dekont numarası.
  - Dosya `0005_money_events.sql` varsa onu da otomatik uygular.
- W, E, RLS, PR3-N1 ve pay eşitliği testleri yeşil kalır; `npm run check` yeşil kalır.

## Dikkat

- **Q14 (W grubu, 0003):** kapanmış haftaya geriye tarihli tahsilat zaten reddediliyor; M1/M2 bu korumayı bozmamalı (tetikleyici adları ve sırası).
- **D-F04:** müşteri iadesi müşteri borcunu yeniden yaratmaz; M1 yalnız iade ≤ tahsilat sınırıdır.
- **PKG-F04b (H-25 açık):** nakitsiz kredi para hareketi değildir; `booking_money_event`'e yazılmaz, M1 hesabına girmez.
- **Eşzamanlılık:** M1 toplam kontrolü için rezervasyon satırında `FOR UPDATE`; iki eşzamanlı iadeden yalnız biri sınırı geçebilir. Ayrı bir eşzamanlılık testi yazılır (iki oturum).
- **RLS:** tetikleyiciler `SECURITY INVOKER`; site rolü zaten yazamaz, platform kapsamında doğru çalışmalı.

## Kapsam dışı

H-23, H-25, H-26 kararları; CRS adaptörü; PR3-N2.

## 04.11.2026 Codex yerel uygulama ve doğrulama

**Durum:** LOCAL_ONLY / CODE_TEST_PASS / CLAUDE_PEER_REVIEW_PENDING / HUMAN_INDEPENDENT_ACCEPTED=NO / LIVE_HOLD.

İki ayrı commit: önce PR3-N3 (0004'te onaylı split_policy oranlarının UPDATE/DELETE/TRUNCATE yoluyla değiştirilmesi engellendi; gelecekte yeni oran için yeni politika kimliği gerekir), ardından QA-F4/M 0005 adayı.

**0005_money_events.sql** eski 0001–0004 göçlerine dokunmadan M grubunu ekler:
- Q12: refund toplamı collection toplamını geçemez. Rezervasyon satırına FOR UPDATE kilidi koyularak eşzamanlı iki iadenin aynı tahsilatı iki kere tüketmesi önlenir.
- Q13: shuttle müşterisinden yalnız supplier tahsil eder; private/VIP site tahsilatı serbest.
- Q15: booking üzerindeki collected_amount ve refunded_amount önbelleği, append-only money event toplamından bağımsız elle değiştirilemez. Doğru toplam güncellemesi korunur.
- Q16: bank receipt referansı payer_id + büyük harf/boşluksuz normalizasyonla benzersiz. Unique index eşzamanlı koruma, INSERT trigger'ı AG_F4_RECEIPT_DUPLICATE hata kodu verir.

Özgün Q12/Q13/Q15/Q16 SQL probları değiştirilmedi; yalnız şemayı adım adım kuran izole test yardımcısı her probu ayrı çalıştırır ve doğru AG_F4_* hata nedenini arar. Kapalı hafta veya kiracı yetkisi gibi ilgisiz bir ret PASS sayılmaz.

**Atılabilir PostgreSQL 16, network none, test sonuçları:**
- PR3-N3 politika değişmezliği 2/2 PASS; önceki SQL-vs-TS pay paritesi 4/4 PASS.
- M orijinal negatif problar 4/4 doğru nedenlerle PASS; eski 8 W ve 6 E negatif probun koruması yerinde.
- M olumlu koruma ve ek senaryolar 6/6 PASS: 50 EUR tedarikçi tahsilatı + 20 EUR iade, private site tahsilatı, başka payer aynı numara, eşzamanlı iki iade (yalnız biri), doğru nakit önbelleği güncellemesi / yanlış güncellemenin reddi, ag_platform scoped yazım vs ag_app yetki yükseltme reddi.
- Tüm PG16 testleri: **61 test; 43 PASS / 18 TODO / 0 FAIL**. Bu 18 TODO halen mevcut QA-F4 diğer gruplar ve PR3-N2 gibi bağımsız açıklardır. SQL 38 negatif testinin **21'i PASS / 17'si TODO**.
- Nihai npm run check, sentetik W45 ve SSG sonuçları PR #9 yorumunda yer alacak.

**Kapsam sınırları:** H-23/H-25/H-26 açık. M göçündeki banka dekontu eşsizliği, müşterinin tahsilat makbuzları için H-26 kapsamında gereken kalıcı collection_slip tahsis/registry tasarımının yerine geçmez. Site ve tedarikçi tahsilat referanslarının PostgreSQL'de global eşsizliği sonraki CRS entegrasyon kontrolüdür; uygulamanın yerel QA-F9 koruması canlı DB garantisi değildir. Production/table-owner/superuser threat model ve kalıcı IdP/CRS adapter hala doğrulanmadı. Göç gerçek CRS veya staging'e uygulanmadı.

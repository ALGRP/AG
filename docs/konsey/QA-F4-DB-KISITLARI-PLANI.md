# QA-F4 · PostgreSQL defter kısıtları: uygulama planı (Codex Paket-03)

**Tarih:** 04.11.2026 · **Hazırlayan:** Claude · **Durum:** `LOCAL_ONLY · INDEPENDENT_HUMAN_ACCEPTED=NO · G0 HOLD`
**Taban:** PR #9 `188fb57`. Yalnız **atılabilir** PostgreSQL 16 kümesi; canlı veya staging CRS'e hiçbir göç uygulanmaz (SEL-329/331).

## 1. Durum

- `qa-independent/sql/qa_probes.sql` 35 ihlal probu (Q01–Q35) içeriyor. Her biri şemaya kural dışı bir satır yazmayı dener. Bugün 35'inin de satırı **kabul ediliyor**.
- `packages/db/src/schema-probes.test.ts` bunları `todo` olarak raporluyor (`AG_TEST_PG=1`).
- Bu kuralların çoğu uygulama katmanında (Paket-01/02) artık uygulanıyor. Ama veritabanı tek başına yanlış satırı reddetmiyor. Bir göç, elle SQL veya ileride CRS adaptöründeki bir hata defteri bozabilir. QA-F4 bu ikinci savunma hattıdır.
- Mevcut göçler: `0001_network_core.sql` (şema), `0002_tenant_rls.sql` (QA-F3 RLS adayı). **0001 ve 0002 değişmez**; yeni kısıtlar yeni göç dosyalarına yazılır.

## 2. Kabul kuralı

- Her commit bir prob grubunu kapatır. Kabul: o grubun Q probları `AG_TEST_PG=1 AG_TEST_PG_ISOLATED=YES` ile **reddedilir** ve testteki `todo` kalkar.
- Aynı koşumda P1–P16, C01–C05 (reddedilmeye), OK blokları (kabul edilmeye), RLS testleri ve "QA-F3 (DB)" yeşil kalır.
- Prob dosyası değiştirilmez. Bir prob yanlışsa ayrı, gerekçeli bir commit'te ve inceleyici onayıyla düzeltilir.
- `npm run check` yeşil kalır (uygulama kodu bu pakette değişmemeli).

## 3. Gruplar ve mekanizmalar

| Grup | Problar | Kural | Mekanizma (göç adayı) | Karar bağımlılığı |
| -- | -- | -- | -- | -- |
| **W · Hafta bütünlüğü** | Q05, Q06, Q07, Q08, Q09, Q14, Q18, Q20 | Kapanmış haftaya yazım yok; bitmemiş hafta kapanmaz; sıra; hafta kimliği ile dönem eşleşir; var olmayan ISO hafta yok; geriye tarihli tahsilat kapanmış haftaya düşmez; düzeltme kapanmış haftaya yazılmaz; gelecekte var olmayan hafta yok | `iso_week_id(timestamptz)` ve `iso_week_bounds(text)` SQL fonksiyonları (Europe/Istanbul). `settlement_week` için CHECK (kimlik = dönem). `BEFORE INSERT` tetikleyicileri: kapanış `end ≤ now()`; önceki hafta kapalı veya ilk kapanış kuralı (en erken faaliyet haftası; PR1-N5); `settlement_entry`, `booking_money_event`, `settlement_adjustment` için hafta kapalıysa red | Yok (kod kuralları mevcut) |
| **E · Pay kaydı bütünlüğü** | Q01, Q02, Q03, Q04, Q10, Q11 | Aynı tabanı iki kez sayma yok; taban ≤ fiyat; shuttle 20/10/70 (kendi araç 90/10); private'ta AGOS payı 0; bilinmeyen politika yok; para birimi rezervasyonla aynı | `UNIQUE (booking_id, week_id)`. Süreklilik tetikleyicisi: `base_before` = önceki kayıtların `base_after` toplamı. `CHECK (base_after <= final_price)` (join'li tetikleyici). FK `split_policy_id → split_policy`. Para birimi tetikleyicisi. Pay tetikleyicisi: kümülatif pay = `split_on_collected(base_after, policy)` SQL fonksiyonu (uygulamadaki `splitOnCollected` ile **birebir aynı yuvarlama**) | **H-23** (küsurat) kararı değişirse fonksiyon da değişir; bugünkü kural aynen kopyalanır, karar verilmez |
| **M · Para hareketleri** | Q12, Q13, Q15, Q16 | İade ≤ tahsilat; shuttle tahsilatı yalnız tedarikçi; uzlaşmış rezervasyonda tahsilat tutarı geri değişmez; dekont harf varyantı tekil | İade tetikleyicisi (toplam iade ≤ toplam tahsilat). `collector` için rezervasyon ürününe göre CHECK (tetikleyici). Mevcut ekleme-yalnız tetikleyici + `booking.collected_amount` için güncelleme tetikleyicisi. `UNIQUE (payer_id, upper(regexp_replace(bank_reference,'\s','','g')))` | Yok |
| **A · Mahsup, düzeltme, itiraz** | Q17, Q19, Q21 | Yazılı onay referansı boş olamaz; reddedilen itiraz para hareketi doğurmaz; mahsupta aktör/rol/2FA kaydı | `CHECK (kind <> 'offset' OR written_approval_reference ~ '^[A-Z0-9./_-]{3,64}$')`. İtiraz düzeltmesi tetikleyicisi (bağlı itiraz `accepted` olmalı). Yeni kolonlar: `actor_id`, `actor_role`, `mfa_verified_at`, `reason` (`NOT NULL`; mevcut satır yok, varsayılan gerekmez) | Yok (gerçek 2FA zamanı SEL-332'de dolar) |
| **P · Fiyat ve tarife** | Q22, Q23, Q24, Q25, Q26, Q29, Q31, Q32 | 0,01 € manuel fiyat yok; 5+ yolcu otomatik fiyat yok; manuel fiyat onay kaydı ister; tarifede ≤ 4 pozitif toplam; teslim edilmiş işin fiyatı değişmez; 2 kişilik işe manuel onay yok; onaylı sınır minimumu anlamlı | `CHECK (cardinality(totals) <= 4 AND 0 < ALL(totals))`. `CHECK (price_mode <> 'FIXED_SHUTTLE' OR passengers <= 4)`. `SHUTTLE_MANUAL_APPROVED` için onay FK'sı. Manuel onay için `passengers >= 5` tetikleyicisi. Fiyat dondurma tetikleyicisi (teslim veya tahsilat sonrası `price_*` değişmez) | **H-22 / K17** (5+ alt sınır, ör. ≥ 70 €): Q22 ve Q32 alt sınırı Owner kararı gelene kadar yalnız `> 0` ve "sınır tablosunda onaylı" olarak uygulanır; sayısal minimum **yazılmaz** |
| **R · Hat** | Q27, Q28 | Yasak hat (AYT↔GZP) yok; pasif hatta fiyatlı rezervasyon yok | `CHECK` (yasak hat listesi) ve rezervasyon anındaki hat durumu için tetikleyici | **K8** (hat kapsamı): yalnız bugünkü kayıt (`forbidden_routes`, `active`) uygulanır |
| **L · Yaşam döngüsü** | Q30 | Uzlaşmış ve teslim edilmiş iş iptale dönmez | Durum geçiş tetikleyicisi (uygulamadaki geçiş tablosunun aynısı) | Yok |
| **T · Atıf ve taraf** | Q33, Q34, Q35 | Satış tarafı sitenin sahibidir; doğrulanmamış site kendi kendine tedarik etmez; kimlikler küçük harf ve birebir; private tedarikçi hak edişi ≤ satış fiyatı | `selling_party_id = site.owner_party_id` tetikleyicisi. Kimlik kolonlarında `CHECK (id = lower(id))`. Kendi aracı tetikleyicisi (`site.self_operation_verified_at <= now()`). `CHECK (supplier_entitlement <= final_price)` | Yok |

## 4. Commit planı (her biri ayrı göç dosyası ve ayrı commit)

| # | Göç | Grup | Kapanan problar |
| -- | -- | -- | -- |
| 1 | `0003_week_integrity.sql` | W | 8 |
| 2 | `0004_entry_integrity.sql` | E | 6 |
| 3 | `0005_money_events.sql` | M | 4 |
| 4 | `0006_adjustments_audit.sql` | A | 3 (Q21 dahil) |
| 5 | `0007_pricing.sql` | P | 8 (Q22 ve Q32 için yalnız karar gerektirmeyen kısım; sayısal minimum H-22'yi bekler, `todo` kalabilir) |
| 6 | `0008_routes_lifecycle.sql` | R + L | 3 |
| 7 | `0009_attribution.sql` | T | 3 |

Beklenen: 35 probun en az 33'ü reddedilir. Q22 ve Q32'nin sayısal minimum kısmı H-22 kararına kadar `todo` kalabilir; gerekçe test etiketinde yazılır.

## 5. Paket-02'den gelen yeni tablolar (aynı paket veya hemen sonrası)

| Tablo | Kural | Kaynak |
| -- | -- | -- |
| `collection_slip` (+ `booking_money_event.slip_id`) | `UNIQUE (collector_party_id, reference_norm)`; H-26'ya göre tek rezervasyon kısıtı veya tahsis tablosu | QA-F9 §4a |
| `customer_credit_note` | Ekleme-yalnız; `UNIQUE (upper(reference))`; toplam kredi ≤ fiyat − nakit; aktör/rol/2FA/gerekçe `NOT NULL`; RLS (site yalnız kendi rezervasyonu) | PKG-F04b; **H-25 açık** |
| `human_challenge` | `token_hash` birincil anahtar, `expires_at`; ekleme-yalnız; yalnız platform | QA-F11 |
| `booking_decision_audit` | Ekleme-yalnız itiraz kararı ve mükerrer temizleme geçmişi | QA-F10 / PR2-N1 |

Her yeni tabloya 0002 desenindeki `ENABLE` + `FORCE ROW LEVEL SECURITY` ve rol izinleri uygulanır.

## 6. İşlem güvenliği

- Kapanış: `pg_advisory_xact_lock(hashtext('close:' || week_id))` + `UNIQUE (week_id)`.
- Toplam kontrolleri (iade ≤ tahsilat, kredi ≤ kalan, tahsis ≤ makbuz): ilgili rezervasyon veya makbuz satırında `SELECT … FOR UPDATE` ya da `SERIALIZABLE` işlem.
- Tetikleyiciler `SECURITY INVOKER`; RLS altında da doğru sonuç verir (alt sorgular kapsamla süzülür). Bu, her grup için ayrıca `ag_app` oturumuyla denenir.

## 7. Kapsam dışı ve kapılar

- Canlı veya staging CRS'e göç (SEL-329/331), gerçek veri, geri doldurma (backfill).
- H-22, H-23, H-25, H-26 ve K8'in kesinleştirilmesi. Bu plan yalnız bugünkü kuralları kopyalar.
- İnsan bağımsız kabulü ve SEL-324/326 kapıları geçerli.

## 8. İnceleme ölçütleri

- Her göç temiz kümede 0001 → 0002 → 0003 … sırasıyla `ON_ERROR_STOP=1` ile uygulanır.
- Probların reddi **doğru nedenle** olmalı (beklenen kısıt veya tetikleyici adı hata metninde). Yanlış nedenle reddedilen prob geçti sayılmaz.
- SQL'deki pay fonksiyonu, uygulamadaki `splitOnCollected` ile 0–10.000 kuruş aralığında birebir aynı sonucu vermeli (karşılaştırma testi).

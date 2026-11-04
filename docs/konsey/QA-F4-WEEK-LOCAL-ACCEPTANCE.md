# QA-F4 W — Hafta bütünlüğü: izole PostgreSQL 16 uygulama kanıtı

**Tarih:** 04.11.2026. **Durum:** LOCAL_ONLY / CODE_QA_PASS / PEER_REVIEW_PENDING / HUMAN_INDEPENDENT_ACCEPTED=NO / LIVE_HOLD.

## Düzeltme kapsamı
PR2-N4 ayrı commit: İdempotency cache HIT dahil, önceki booking lookupToken yanıtı verilmeden Origin ve sunucuda doğrulanmış, tek kullanımlık siteye bağlı booking challenge yeniden kontrol edilir. Meşru yeniden denemede yeni Turnstile belirteci gerekir. API test yardımcısı taze belirteç üretir, assertion gevşetilmedi.

QA-F4 W grubu ayrı göç adayı: packages/db/migrations/0003_week_integrity.sql. 0001 ve 0002 değişmedi. Europe/Istanbul ISO hafta başlangıcı, geçerli ISO hafta 53, hafta sırası, takvim zaman aralığı, kapanış öncesi/sonrası defter değişmezliği için tetikleyiciler içerir.

## Doğru nedenle ret kanıtı
Problar QA kaynağından değiştirilmeden, yalnız atılabilir PostgreSQL 16 konteynerinde 0001 -> sentetik SETUP -> 0002 -> 0003 sonrasında ayrı ayrı yürütüldü.

| Prob | Doğrulanan hata nedeni |
| --- | --- |
| Q05 | AG_F4_CLOSED_WEEK_ENTRY |
| Q06 | AG_F4_WEEK_NOT_FINISHED |
| Q07 | AG_F4_WEEK_OUT_OF_ORDER |
| Q08 | AG_F4_WEEK_PERIOD_MISMATCH |
| Q09 | AG_F4_WEEK_INVALID |
| Q14 | AG_F4_CLOSED_WEEK_MONEY_EVENT |
| Q18 | AG_F4_CLOSED_WEEK_ADJUSTMENT |
| Q20 | AG_F4_WEEK_INVALID |

Test koşusunda 38 SQL testi: **11 PASS, 27 TODO, 0 FAIL**. P1–P16, C01–C05 ve QA-F3 FORCE RLS kontrolleri diğer şema adaylarında korunmuştur. Diğer finans ihlallerini sırf farklı nedenle reddedildikleri için PASS saymıyoruz.

## PR3-N1 kapanış düzeltmesi: pozitif test artık PASS (04.11.2026)

Önceki 0003 adayı, 0001 şemasındaki kapanış modeliyle çelişiyordu. 0001 içinde settlement_week.closed_at NOT NULL, yani bir hafta satırı doğrudan kapanmış kaydedilir. Meşru işlem sırası: **aynı veritabanı transaction içinde hafta satırı ekle -> pay kayıtlarını ekle -> COMMIT**.

Güncellenen 0003, pay satırının yalnız bu işlemde oluşturulmuş hafta satırına yazılmasını kabul eder. Bunun için **current_user = ag_platform**, işlem-local **app.scope = platform** ve hafta satırındaki **xmin = mevcut işlem xid** birlikte zorunludur. Sonraki işlemden, site rolünden veya platform kapsamı olmayan oturumdan gelen eklemeler reddedilir. 0001/0002 ve Q propları değişmedi.

Atılabilir PostgreSQL 16 testinde packages/db/src/close-lifecycle.test.ts: **3 PASS / 0 FAIL / 0 TODO**. W44 hafta+pay kaydı tek transaction içinde başarıyla COMMIT edildi; daha sonraki platform işleminde aynı haftaya ek pay satırı AG_F4_CLOSED_WEEK_ENTRY ile reddedildi; site rolünden doğrudan yazma reddedildi. Orijinal sekiz W probu ayrı çalışarak doğru nedenle reddedilmeye devam ediyor. 38 SQL probu: **11 PASS / 27 TODO / 0 FAIL**. Normal npm run check: **221 test / 211 PASS / 9 TODO / 1 SKIP / 0 FAIL**. Sentetik W45 raporu byte düzeyinde değişmedi; örnek site build başarılı.

**Yayına geçiş blokajı devam ediyor:** Bu, kapanış sırası için yerel *aday* bir korumadır; gerçek CRS şeması, çoklu süreç/eşzamanlı kapanış, uzun dönem XID wrap/freeze davranışı, transaction danışma kilidi, geri doldurma ve hata sonrası recovery test edilmedi. Rol sınırı ve işlem-local scope ancak güvenilir SEL-332/331 adapter tarafından atanır. Custom app.scope tek başına kimlik doğrulaması değildir. 0003, SEL-331 staging kabulü ve insan bağımsız onayı olmadan staging/canlı CRS'ye uygulanmaz. H-20/H-23/H-25/H-26 ve finans/yasal kararlar ayrı açık kalır.

**Sonraki aşama:** Claude PR3-N1 commit'ini, aynı-transaction xid korumasını ve RLS/pozitif-negatif akış testlerini bağımsız inceleyecek. İnsan bağımsız kabulü ve G0 güvenlik kapıları ayrı.

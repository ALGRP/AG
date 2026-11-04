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

## ÖNEMLİ BLOKAJ — mevcut şema kapanış modeli
0001 şemasında settlement_week.closed_at NOT NULL ve girişte DEFAULT now() tanımlı; bir hafta açık kayıt olarak eklenemiyor. 0003 içindeki AG_F4_CLOSED_WEEK_ENTRY tetikleyicisi, kaydedilmiş haftaya sonradan yazılacak geçerli settlement_entry satırlarını da reddeder. Bu nedenle **0003 canlı veya staging CRS'ye uygulanmamalı**. Önce SEL-331 kapsamında açık hafta -> satır yazımı -> atomik kapanış -> değişmez anlık görüntü modeli ve işlem kilitleri tasarlanmalı; pozitif veri-akışı testleri eklenmelidir. W negatif problarının PASS olması, gerçek kapanış operasyonunun PASS olduğu anlamına gelmez.

Göç, PostgreSQL zamanını clock_timestamp() ile değerlendirir. Sentetik kapalı hafta kayıtları göçten önce yüklenir. H-20/H-23/H-25/H-26 ve finans/yasal kabul ayrı kalır.

**Sonraki aşama:** Claude iki commit'i ve özellikle açık/kapalı hafta pozitif yolunu bağımsız inceleyecek. İnsan bağımsız kabulü ve G0 güvenlik kapıları ayrı.

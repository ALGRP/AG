# PR3-N5/N6 + QA-F4/T — yerel PostgreSQL aday kanıtı

**Tarih:** 04.11.2026. **Statü:** LOCAL_ONLY / CODE_QA_PASS / CLAUDE_REVIEW_PENDING / HUMAN_INDEPENDENT_ACCEPTED=NO / G0_HOLD.

## İki ayrı commit ve göç

- **0007_adjustment_hardening.sql (PR3-N5/N6):** settlement_adjustment.adjustment_reference için büyük/küçük harf ve boşluklardan bağımsız benzersiz ifade indeksi eklendi. 2FA zamanının gelecek tarihli, eksik veya 15 dakikadan eski olması reddediliyor (AG_F4_ADJUSTMENT_AUDIT_REQUIRED). Onaylı gerçek IdP/2FA oturum kanıtı yoktur: 15 dakika yalnız yerel güvenlik adayı, Owner kararı veya gerçek doğrulama değildir. Mevcut d756c49 regresyon testlerinin beklentileri değiştirilmeden TODO kaldırıldı.
- **0008_attribution_integrity.sql (QA-F4/T):** site sahibi ile selling_party_id eşleşmesi (Q33), canonically lower-case supplier ID ve doğrulanmamış/gelecek tarihli self-supply yasağı (Q34), private/VIP'de supplier entitlement <= satış tutarı ve negatif site payı olmaması (Q35). Beklenen AG_F4_BOOKING_* hata adlarıyla reddediliyor. Yalnız platforma site ownership SELECT yetkisi verildi; ag_app/tenant rolüne yeni site-registry okuma izni verilmedi.
- 0001–0006 göçleri ve özgün Q01–Q35 SQL probları değiştirilmedi.

## Gerçekte çalıştırılmış testler

- Düşük yetkili uygulama ile sahte platform kapsamı kullanarak rezervasyon yazma testi, gelecekte tarihli self-operation, geçerli Shuttle/özel/90-10 kendi araç rezervasyonları: QA-F4/T pozitif testleri **3/3 PASS**.
- Q33/Q34/Q35 orijinal SQL satırları yeni izole T veritabanında **3/3 doğru nedenli ret**; basit RLS veya eskiden kalan kontrol retleri başarı sayılmadı.
- PR3-N5 / PR3-N6 mevcut kabul testleri **2/2 PASS**, beklenti değiştirilmedi.
- Atılabilir **postgres:16-alpine --network none** ortamında tüm DB testleri: **72 test; 60 PASS, 12 TODO, 0 FAIL**. Bu 12 TODO diğer QA-F4 grupları ve PR3-N2 SAVEPOINT konularından oluşuyor.
- Uygulama kodu/TypeScript: **221 test; 211 PASS, 9 TODO, 1 SKIP, 0 FAIL**.
- W/E/M/A, RLS ve mali kayıtlar için önceki pozitif/negatif regresyon korumaları aynı test takımında geçti.

## Sınırlar ve sonraki inceleme

Gerçek CRS (SEL-331), güvenilir IdP/2FA (SEL-332), kalıcı işleme bağlanmış mali onay, geçmiş duplicate adjustment referanslarının migration öncesi taranması, RLS, XID/savepoint ve rollout/rollback kabulü olmadan bu iki göç **staging veya production'a uygulanmaz**. 15 dakikalık zaman damgası, sahte actor_id veya ayarlanabilir scope değerine karşı tek başına güvenlik sağlamaz.

H-22/H-23/H-25/H-26/K8/K17 Owner kararları açık. Sonraki kod kapsamı ayrı QA-F4/L/P/R önceliği; önce Claude exact-HEAD akran incelemesi ve bağımsız insan güvenlik kabulü.

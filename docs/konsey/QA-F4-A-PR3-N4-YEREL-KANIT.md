# QA-F4/A + PR3-N4 — yerel uygulama ve kabul kanıtı

**Tarih:** 04.11.2026. **Durum:** LOCAL_ONLY / CODE_QA_PASS / CLAUDE_REVIEW_PENDING / HUMAN_INDEPENDENT_ACCEPTED=NO / G0_HOLD.

## Değişiklik
- Yeni ve tek ek göç adayı: packages/db/migrations/0006_adjustments_audit.sql. 0001–0005 şema/göçleri değişmedi; mevcut gerçek CRS'ye uygulanmadı.
- **Q17**: offset için boş/geçersiz yazılı onay referansı, AG_F4_OFFSET_APPROVAL_REQUIRED ile reddedilir. Geçerli referans büyük harfe çevrilip boşluksuz saklanır.
- **Q19**: yalnız status=accepted olan, ilgili original_week_id ile eşleşen ekstre itirazı para düzeltmesi oluşturabilir; rejected/open/yanlış hafta AG_F4_DISPUTE_NOT_ACCEPTED ile reddedilir.
- **Q21**: settlement_adjustment.actor_id, actor_role, mfa_verified_at alanları NOT NULL. Aktör, yetkili rol, geçerli geçmişteki 2FA zamanı ve en az 5 karakterlik gerekçe zorunlu. Kayıt append-only; site rolünün platform yetkisine yükselmesi mümkün değil. Bu alanlar *kanıt kaydıdır*, gerçek IdP/2FA doğrulaması değildir.
- **PR3-N4**: 0005'teki tahsilat önbelleği bütünlüğü artık booking INSERT'te de kontrol edilir. Hiç para hareketi yokken 4000 kuruş tahsilat gösteren yeni rezervasyon AG_F4_COLLECTED_AMOUNT_DRIFT ile reddedilir; yeni rezervasyonun 0/0 nakit bakiyesiyle açılması serbesttir.

## Doğrulanmış test sonuçları
- Orijinal SQL kaynaklarının değiştirilmemiş **Q17 ve Q19** ihlal satırları, tam 0001->0002->0003->0004->0005->0006 adayında tam beklenen AG_F4 hata nedeni ile reddedildi; Q21'de 3 zorunlu/NOT NULL sütun doğrulandı.
- Pozitif QA-F4/A testi: **4 PASS, 0 FAIL**. Geçerli yazılı onaylı mahsup, accepted itiraz kararı, geçersiz kimlik/2FA zaman kanıtı retleri, immutable kayıt ve site yetki ayrımı kontrol edildi.
- Para hareketi korumaları + PR3-N4: **8 PASS, 0 FAIL**.
- İzole PostgreSQL 16'daki tüm DB testleri: **67 test, 52 PASS, 15 TODO, 0 FAIL**. 15 açık test başka QA-F4 grupları ve PR3-N2 SAVEPOINT kabul testlerini içerir.
- Tam uygulama TypeScript/test: **221 test, 211 PASS, 9 TODO, 1 SKIP, 0 FAIL**.
- Testler disposable, network none PostgreSQL 16 üzerinde; gerçek staging/CRS verisine bağlanılmadı. Test konteyneri teslim sonunda kaldırılır.

## Blokajlar ve risk
- 0006 yeni alanları NOT NULL eklediğinden, gerçek ortamda geçmiş adjustment satırlarının geri doldurulması ve tarihsel aktör/2FA kanıtı için insan incelemesi gerekir. Bu çalışma gerçek migrasyon planı değildir.
- Bu göç yalnız alan ve yapısal kontrol sunar; actor_id / mfa_verified_at değerinin gerçek, imzalı kimlik sağlayıcıya ait olduğunu kanıtlamaz (SEL-332).
- DB superuser/table owner'ın güvenlik denetimini devre dışı bırakabilme tehdidi ve güvenilir CRS adapter/ayrı roller/recovery (SEL-331/329) ayrıca kabul gerektirir.
- H-22, H-23, H-25, H-26, K8 ve K17 Owner kararları çözülmedi. Yetki istemciden değil doğrulanmış oturumdan gelmeli.
- PR3-N2 alt işlem/SAVEPOINT riski devam eder; QA-F4 fiyat, yaşam döngüsü, atıf ve hat gruplarındaki açık problar tamamlanmış sayılmadı.

**Sıradaki tek iş:** Claude mevcut commit'i bağımsız, tam SHAlı inceleyip PR #9 ve SEL-163'e PASS / FAIL / NEEDS_REVIEW kararını kaydetsin. İnsan bağımsız kabulü, PR merge ve canlıya geçiş ayrı güvenlik kapılarında kalır.

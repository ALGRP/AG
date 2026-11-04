# QA-F3 yerel uygulama ve kanıt (PR1-N6 / PR2-N1 dahil)

**Durum:** LOCAL_ONLY / PEER_REVIEW_PENDING / HUMAN_INDEPENDENT_ACCEPTED=NO / LIVE=HOLD

## Teslim
- PR1-N6: yanlış tarihli ve tarihsel haftaya bağlı olduğu doğrulanmamış dekont reddedilir. Gerçek tarihsel faaliyete veya kapalı ekstreye bağlı gecikmiş ödemeler kaybolmaz. 28 gün yalnız yerel güvenlik sınırıdır, üretim muhasebe politikası değildir.
- PR2-N1: yeniden açılmış itirazlarda karar geçmişi eklemeli korunur; her karara özgü outbox tekrar önleme anahtarı vardır.
- QA-F3/API: yerel test site anahtarı sunucuda tek siteye bağlanır. İstek başlığı, Origin, body ve reklam atfı yetki vermez. Siteye ait olmayan kayıt 404, platform işlemi 403.
- QA-F3/Statement: site yalnız kendi rezervasyon/ekstre/borç/alacak/istisna ve itiraz kayıtlarını görür. Platform raporu korunur.
- QA-F3/DB: 0002_tenant_rls.sql yerel adayında 12 tabloya ENABLE + FORCE RLS uygulanır. ag_app tablo sahibi veya BYPASSRLS değildir; ag_platform üyeliği yok; defterde site yazmaları yasaktır.

## Yerel test kanıtı
- Node/TypeScript tam test: npm run check (sonuç bu çalışmanın PR yorumunda).
- İzole Docker postgres:16-alpine, --network none; mevcut staging konteynerlerine dokunulmadı:
  - 0001 + 0002 göçleri: PASS.
  - AG_TEST_PG=1 AG_TEST_PG_ISOLATED=YES AG_TEST_PG_CONTAINER=agos-f3-qa-20261103 node --test packages/db/src/tenant-rls.test.ts: 4/4 PASS.
  - Eski negatif SQL probu: 38 test, 3 PASS, 35 TODO, 0 FAIL. 35 QA-F4 finans kısıtı tamamlanmadı.
  - ag_app kapsam yokken 0; p1 kapsamında p2 booking/money/receipt 0; sahte platform kapsamıyla 0; DELETE reddedildi; platform üyeliği yok.

## G0 / açık güvenlik kapıları
1. SEL-332 gerçek IdP ve 2FA yok. Yerel Actor ve test bearer token gerçek kimlik değildir. Üretim kapısı kapalı.
2. SEL-329/331 gerçek CRS erişimi/şeması yok. 0002 canlı veya staging CRS'ye uygulanmadı; önce exact schema, ayrı role, rollback ve insan kabulü.
3. Custom app.party_id ve app.scope değişkenleri kimlik ispatı değildir. Sunucuda doğrulanmış aktörden işlem başına SET LOCAL gerekir; ele geçirilen bağlantı/SQL injection riski ayrı test konusu.
4. 35 adet QA-F4 finans DB kısıtı TODO. Tedarikçi PII/kolon izinleri ve gerçek partner portal yetkileri henüz canlı kabul değil.
5. H-21, H-25 ve H-26 mali Owner kararları açık. Dekont tarih penceresi mali müşavir görüşü olmadan prod kuralı sayılmaz.

**Sonraki tek iş:** Claude commitleri, yetki ve veri sızıntısı negatif testlerini bağımsız incelesin; gerçek CRS/IdP ve insan kabulü ayrı.

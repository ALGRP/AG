---
name: "agos-governance"
description: "AGOS yönetişim kuralları: filo (tedarikçi) ve bağımsız şoför, hak edişin alıcısı (payee), tedarikçi ve şoförün müşteri verisine erişimi, admin 2FA. Tedarikçi, filo, vendor, ödeme alıcısı, müşteri verisi erişimi, 2FA/MFA veya admin güvenliği işlerinde kullan."
---

# AGOS Yönetişim: Filo, Hak Ediş Alıcısı, Müşteri Verisi Erişimi, Admin 2FA

Kapsam: kimin hangi araçla iş alabileceği, hak edişin kime yazılacağı, müşteri adı ve telefonunun kime ne zaman açılacağı, admin oturumunun güvenliği. Havuz, teklif ve cari hesabın ayrıntısı için agos-pool-finance skill'ine bak. Fiyat için agos-pricing-matrix'e, mesajlar için agos-notification-automations'a bak.

Referans: `governance_vendor_mfa.sql` (migration 17), `security_audit.sql` (kontrol 12–13), `lib/auth/server.ts`, `app/admin/mfa/page.tsx`, `components/admin/AdminMfa.tsx`.

## 0. Owner kararları (30 Eki 2026)
1. Filo aracıyla yapılan işin hak edişi ve ödemesi tedarikçiye (vendor / şirket sahibi) yapılır. Bağımsız (freelance) şoför kendi hesabına alır.
2. Tedarikçi ve atanan şoför, karşılama ve iletişim için müşteri adını ve telefonunu iş kesinleşince görür. Açık havuzda müşteri gizliliği korunur.
3. Admin seviyesindeki her girişte iki adımlı doğrulama (2FA) zorunludur.

Yorum kuralı: "iş kesinleşti" = atama kabul edildi (`driver_assignments.assignment_status` = `accepted` veya `in_progress`). `reservations.status = 'confirmed'` KULLANILMAZ. Sabit fiyatlı rezervasyon havuza zaten `confirmed` olarak girer; erişimi o duruma bağlamak müşteri verisini havuzdaki herkese açar. Taslakta "confirmed" yazsa bile bu eşlemeyi koru ve Owner'a belirt.

## 1. Roller ve filo bağı
- Roller: `admin`, `vendor` (tedarikçi şirket sahibi), `driver` (şoför), `customer`. Rol yalnız `profiles.role` + `is_active` alanından okunur.
- Filo şoförü: `vendor_drivers` tablosunda aktif bağı olan şoför. Bağımsız şoför: aktif bağı olmayan şoför.
- Bir şoförün aynı anda en fazla bir aktif bağı olur (`vendor_drivers_one_active`). Bağ silinmez; `ended` yapılır ve tarih/kişi izi kalır.
- Bağı yalnız admin kurar veya bitirir: `admin_set_fleet_driver(şoför, tedarikçi | null)`. Gerekçe: bağ, hak edişin kime gideceğini değiştirir; bu finansal bir işlemdir. Tedarikçi kendi filosuna şoför ekleyemez. Davet ve şoför onayı akışı gerekiyorsa bunu yeni bir Owner kararı olarak sor.
- Bağ değişince şoförün artık kullanamayacağı araçla verdiği açık teklifler `withdrawn` olur. Müşteri seçemeyeceği bir teklifi görmez.
- Tedarikçi pasifse (`is_active = false`) `_driver_vendor()` NULL döner. Bu durumda filo şoförleri o tedarikçinin araçlarıyla teklif veremez ve tedarikçi panelini açamaz.

## 2. Araç kuralı
- Kullanılabilir araç sahibi `_vehicle_pool_owner(şoför)` ile bulunur: filo şoförü için tedarikçi, bağımsız şoför için şoförün kendisi.
- (ÖNERİ, varsayılan) Filo şoförü kendi adına kayıtlı araçla teklif veremez. Böylece hak ediş alıcısı ile araç sahibi hep aynı kişi olur.
- Bu kural tek yerde tanımlanır ve şu fonksiyonların hepsinde kullanılır: `_submit_job_offer`, `_claim_dispatch_job`, `driver_get_job_offer` (araç listesi), `job_broadcast_targets`, `submit_job_offer_by_whatsapp`. Bir fonksiyonu yeniden yazarken `v.vendor_id = p_actor` kalıbını geri getirme.
- Araç çakışması: filo aracı birden fazla şoföre açık olduğu için `_claim_dispatch_job` şoför çakışmasından sonra araç çakışmasını da kontrol eder (±180 dk, `vehicle_conflict`). Araç satırı kilitlenir, böylece eşzamanlı iki atama sıraya girer. Müşteri çakışan teklifi seçerse `offer_not_available` (reason `vehicle_conflict`) döner ve başka teklif seçebilir.
- Araç bilgisini, olanakları ve fotoğrafları aracın sahibi düzenler (bağımsız şoför veya tedarikçi): `driver_update_vehicle_profile`, `driver_add_vehicle_photo`, depolama yolu `<sahip>/<araç>/<uuid>.jpg`. Filo şoförü bu araçları `driver_my_profile` içinde görür (`can_edit: false`, `fleet.vendor_name`) ama düzenleyemez.

## 3. Hak ediş alıcısı (payee)
- `settlements.payee_id` kural olarak `_settlement_payee(şoför, araç)` ile belirlenir:
  - Aracın sahibi `vendor` rolündeyse alıcı tedarikçidir.
  - Aksi halde alıcı şoförün kendisidir.
  - Araç kaydı silinmişse şoförün aktif filo bağına bakılır.
- Alıcı, kayıt açılırken tetikleyiciyle (`trg_settlements_set_payee`) yazılır. Onaydan sonra değişmez (`settlement_locked`). Onaydan önce düzeltmek için şimdilik yalnız SQL ve admin var. Panelde bunun için bir araç gerekirse ayrı bir iş olarak ele al.
- Cari kayıtlar alıcının hesabına işler: `post_settlement_to_ledger` ve `post_adjustment_to_ledger` `payee_id` kullanır. Nakit işte komisyon borcu da tedarikçinin hesabına düşer, çünkü mahsup tedarikçi düzeyinde yapılır. Haftalık kapanış ve ödeme fonksiyonları değişmez; tedarikçi hesabı da aynı şekilde kapanır.
- Görünürlük:
  - Tedarikçi kendi hak edişlerini `settlements_payee_select` ile görür.
  - Carisini `driver_ledger()` ile görür. Kalemlerde işi yapan şoförün adı (`driver_name`) ve transfer saati (`pickup_time`) yer alır.
  - Filo şoförünün cari hesabı yoktur. Kendi işinin hak ediş satırını `settlements_driver_select` ile görür. Teklifi kendisi verdiği için tutarı zaten bilir.
- Geçmiş kayıtlar: migration öncesi hak edişlerin hepsinde alıcı = şoför olarak kalır. Bu kayıtlar geriye dönük olarak tedarikçiye taşınmaz.
- Muhasebe aktarımında (Sheets) şoför sütununun yanında alıcı (payee) sütunu da bulunmalıdır. Tedarikçi faturası, KDV ve stopaj konuları için MALİ MÜŞAVİR TEYİDİ gerekir.

## 4. Müşteri verisine erişim
Kural, şoför için `driver_list_jobs` ile, tedarikçi için `vendor_list_jobs` ile birebir aynıdır:

| Durum | Bölge, saat, araç | Adres, uçuş, not, nakit tutarı | Müşteri adı ve telefonu |
|---|---|---|---|
| Havuzda / teklif aşaması | yalnız havuz görünümü | yok | yok |
| `dispatched` (atandı, kabul yok) | var | yok (bölge adı gösterilir) | yok |
| `accepted` / `in_progress` | var | var | var |
| `completed` (24 saat) | var | var | yok |
| rezervasyon iptal | var | — | yok |

- Tedarikçinin kapsamı, kendi ARACIYLA yapılan işlerdir (`vehicles.vendor_id = tedarikçi`). Bağı bitmiş bir şoförün kendi aracıyla aldığı yeni işleri tedarikçi görmez.
- Tedarikçi ve şoför `reservations`, `driver_assignments`, `outbox` tablolarını doğrudan okuyamaz. Erişim yalnız bu maskeli RPC'lerledir; gizli alan sunucudan hiç gönderilmez.
- `job_won` mesajı tam bilgiyi yalnız şoföre götürür. Tedarikçiye WhatsApp bildirimi açık bir karardır: yeni onaylı şablon ve opt-in gerekir. Şimdilik tedarikçi paneli kullanılır.
- Tedarikçi panelindeki şoför telefonları (`vendor_my_fleet`) tedarikçinin kendi personelinin numaralarıdır. Bu numaralar müşteriye gösterilmez.

## 5. Admin 2FA
- Asıl kural veritabanındadır: `app_role()`, admin için yalnız JWT `aal = 'aal2'` ise `'admin'` döner, aal1 oturumda NULL döner. Bütün admin RPC'leri, RLS politikaları, depolama politikası ve `profiles_guard` bu fonksiyondan geçer.
- Bu yüzden:
  - Admin kontrolü her yerde `public.app_role() = 'admin'` (veya `is distinct from 'admin'`) ile yazılır.
  - `profiles.role = 'admin'`, `exists (select … role = 'admin')` ya da JWT `user_metadata` ile admin kontrolü yazılmaz. Bu kalıp 2FA'yı atlar ve denetimde `admin_check_bypasses_mfa` bulgusu verir.
  - `rbac_hardening.sql` sonradan yeniden çalıştırılırsa `app_role()` eski haline döner (`admin_mfa_not_enforced`, KRİTİK). Ardından migration 17 tekrar uygulanır.
- `my_access()` → `{ user_id, role, is_active, aal, mfa_required }`. `mfa_required` = admin ama oturum aal2 değil.
- Next.js tarafı (`lib/auth/server.ts`):
  - `parseAccess(sub, data, aal)` admin için iki koşulun birlikte sağlanmasını ister: JWT aal2 olmalı ve veritabanı `mfa_required: true` dememeli. Alan hiç yoksa (migration henüz uygulanmamışsa) karar JWT aal'a göre verilir.
  - `requireRole`, aal1 admini her sayfadan `/admin/mfa?next=…` adresine yönlendirir.
  - `authorizeApi` 403 ve `{ success: false, error: 'İki adımlı doğrulama gerekli.', code: 'mfa_required' }` döner.
- `/admin/mfa` sayfasının akışı:
  - Sayfa `requireRole(['admin'])` kullanmaz, aksi halde yönlendirme döngüsü oluşur.
  - Doğrulanmış faktör yoksa TOTP kaydı yapılır: QR kod ve elle girilecek anahtar gösterilir, yarım kalmış kayıtlar temizlenir.
  - Faktör varsa doğrulama istenir; birden fazla cihaz varsa kullanıcı cihazı seçer.
  - Oturum aal2 ise kayıtlı cihazlar listelenir ve "Yedek cihaz ekle" seçeneği sunulur.
  - Doğrulama `supabase.auth.mfa.challengeAndVerify` ile yapılır. Ardından `router.replace(next)` ve `router.refresh()` çağrılır.
- Dağıtım sırası (admin kilitlenmesin):
  1. Supabase Dashboard → Authentication → Multi-Factor bölümünde TOTP'nin açık olduğu doğrulanır.
  2. `/admin/mfa` sayfası ve yeni `server.ts` yayına alınır.
  3. Her admin TOTP kaydeder ve ikinci bir cihaza yedek faktör ekler.
  4. Migration 17 uygulanır.
  5. `security_audit.sql` çalıştırılır; sonuç boş olmalıdır.
- Kayıp cihaz: başka bir admin ya da Supabase Dashboard (Authentication → Users → kullanıcı → MFA faktörü) faktörü siler, kullanıcı yeniden kaydeder. Faktör silme işlemi uygulama arayüzünde yoktur.
- Supabase kurtarma kodları (`mfa.recoveryCodes`) deneysel bir özelliktir ve sunucu ayarı ister. Owner kararı olmadan kullanılmaz.
- (ÖNERİ) Tedarikçiler de müşteri verisi ve cari gördüğü için 2FA ile korunmalıdır. Şimdilik yalnız admin için zorunludur. Tedarikçiye genişletmek için aynı `app_role()` deseni kullanılır ve Owner onayı alınır.

## 6. Zorunlu testler
- 2FA:
  - aal1 admin: `app_role()` NULL; admin RPC `forbidden`; `settlements` 0 satır; başka profilin rolünü değiştiremez; `my_access.mfa_required = true`.
  - aal2 admin: tam yetki.
  - aal1 şoför: etkilenmez.
- Filo bağı:
  - Bağı yalnız aal2 admin kurar. Tedarikçi doğrudan INSERT yapamaz.
  - İkinci aktif bağ reddedilir. Bağ tedarikçi rolü olmayan profile kurulamaz.
  - Diğer tedarikçi bağları göremez.
- Araç:
  - Filo şoförü tedarikçi aracıyla teklif verir. Kendi aracı ya da başka şoförün aracı `vehicle_not_eligible` döner.
  - Bağımsız şoför filo aracını kullanamaz.
  - WhatsApp ile teklifte tedarikçinin birden çok aracı varsa `choose_vehicle` döner.
  - Yayın hedeflerine filo şoförü dahildir.
- Çakışma: aynı araç çakışan saatte ikinci işe seçilirse `vehicle_conflict` döner; başka araçla verilen teklif seçilebilir.
- Müşteri verisi:
  - Seçimden önce tedarikçi 0 iş görür.
  - `dispatched` işte ad ve telefon görünmez, adres yerine bölge gösterilir.
  - Kabul edilmiş işte ad, telefon ve uçuş görünür.
  - İptal edilen işte ad ve telefon kapanır.
  - Başka tedarikçi 0 satır görür. Şoför `vendor_list_jobs` çağırırsa `forbidden` alır. Tedarikçi `reservations` tablosundan 0 satır görür.
- Hak ediş:
  - Filo işinde `payee = tedarikçi`. Onaydan sonra kalem ve düzeltme tedarikçi hesabına düşer.
  - Tedarikçi carisinde şoför adı görünür. Filo şoförünün hesabı yoktur.
  - Onaydan sonra alıcı değiştirilemez. Bağımsız şoförün eski kayıtları kendisinde kalır.
  - Haftalık kapanış tedarikçi hesabını da kapatır.
- Bağ bitince: açık teklifler geri çekilir, araç listesi boş kalır. Tedarikçi pasifse filo teklif veremez ve panel `forbidden` döner.
- Denetim:
  - Migration'dan sonra `security_audit.sql` boş döner.
  - `profiles.role = 'admin'` kullanan fonksiyon veya politika yakalanır.
  - 2FA'sız `app_role()` KRİTİK bulgu verir.
- Regresyon: havuz, teklif ve cari test seti (bl_test_full) migration öncesi ve sonrası aynı çıktıyı vermelidir.

## 7. Açık kararlar
1. Tedarikçi girişlerinde 2FA (ÖNERİ: evet).
2. Filo şoförünün fiyatını tedarikçinin onaylaması veya tedarikçinin kendi adına teklif vermesi (şu an filo şoförü teklif verir).
3. Filo şoförünün kendi aracıyla iş alması (şu an hayır).
4. Tedarikçiye atama bildirimi (WhatsApp şablonu + opt-in) ve tedarikçi panel sayfası.
5. Şoförün filoya katılması için davet ve şoför onayı akışı (şu an yalnız admin).
6. Onay öncesi alıcı düzeltme aracı ve tedarikçi faturalama modeli (MALİ MÜŞAVİR TEYİDİ).
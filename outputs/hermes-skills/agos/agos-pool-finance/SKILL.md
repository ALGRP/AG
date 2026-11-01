---
name: "agos-pool-finance"
description: "AGOS hak ediş (settlements), şoför cari hesabı ve haftalık kapanış, tahsilat modu (kart/nakit), iş havuzu ve şoför teklifleri (×1,30, müşteri seçimi), WhatsApp ile teklif ve Google Sheets muhasebe aktarımı. Hak ediş, cari, finans, havuz, teklif veya Sheets işlerinde kullan."
---

# AGOS İş Havuzu, Şoför Teklifleri, Hak Ediş ve Cari Hesap

Kapsam: işlerin havuza açılması, şoförlere WhatsApp ve panel üzerinden dağıtılması, şoför tekliflerinin toplanması ve müşterinin seçmesi; tamamlanan işlerin hak edişi, şoför cari hesabı, haftalık kapanış ve ödemeler; kayıtsız şoförlerin kayda yönlendirilmesi; Google Sheets'e muhasebe aktarımı. Atama ve canlı takip için agos-realtime-dispatch, fiyat ve tarife için agos-pricing-matrix, mesajlar için agos-notification-automations skill'ine bak.

Referans migration'lar (sırayla):
- settlements_dispatch_pool.sql: settlements, settlement_adjustments, driver_balances, dispatch_jobs, claim_attempts, expire_dispatch_jobs, admin_update_settlement
- pool_offer_privacy.sql, driver_job_offer.sql: kabul öncesi görünümler (ilk sürüm)
- pool_zones_whatsapp.sql: zones, bölge zorunluluğu, kısa iş kodu, tekrar yayın (claim_due_broadcasts, job_broadcast_targets), kayıt daveti (register_driver_lead), _claim_dispatch_job çekirdeği, job_won / job_closed olayları, driver_get_job_offer, driver_list_open_jobs, driver_list_jobs
- bids_ledger.sql: driver_markup_factor (1,30), job_offers, open_bidding_job, submit/withdraw_job_offer, submit_job_offer_by_whatsapp, customer_list_offers, customer_select_offer, ledger_accounts / ledger_statements / ledger_entries, close_weekly_statements, record_ledger_payment, driver_ledger
- driver_bid_form.sql: şoför job_offers satırını doğrudan okuyamaz (customer_price = sabit işte müşteri fiyatı), teklif sayısı sınırı max_offer_revisions(), teklif modeline uygun driver_get_job_offer (open / selecting, my_offer, revisions_left) ve driver_list_open_jobs; panel bileşeni DriverBidCard
- governance_vendor_mfa.sql: filo (vendor_drivers), araç sahibi kuralı (_vehicle_pool_owner) ve araç çakışması, hak ediş alıcısı settlements.payee_id ve tedarikçi carisi, vendor_list_jobs / vendor_my_fleet, admin 2FA. Kurallar için agos-governance skill'ine bak.
- EMEKLİ (bids_ledger.sql ile kapatıldı, kullanılmaz): sabit ödemeli open_dispatch_job, claim_dispatch_job, claim_dispatch_job_by_whatsapp, "AL KOD" komutu, accept_token linkleri

n8n düğümleri: job_broadcast_message_node.js, whatsapp_inbound_command_node.js, whatsapp_claim_reply_node.js, job_won_message_node.js

## 0. Değişmez kurallar
1. Veritabanı tek doğruluk kaynağıdır. Google Sheets, WhatsApp mesajı veya ekran görüntüsü finans kaydı değildir.
2. Fiyat kuralı (Owner, 30 Eki 2026): şoför fiyat verir, müşteri fiyatı = teklif × 1,30. Oran yalnız `driver_markup_factor()` içinde durur. AGOS payı = müşteri fiyatı − şoför teklifi. Varsayılan `commission_rate` sütunu veya "%30 minimum pay" kuralı yoktur.
3. Onaylanan finans kaydının tutarı değişmez ve hiçbir finans kaydı silinmez. Düzeltme artı/eksi düzeltme satırıyla yapılır. Cari hesap kayıtları (ledger_entries) da değişmez ve silinmez.
4. Yetki bir linkte veya token'da durmaz. Teklif vermek için panelde oturum + `submit_job_offer` ya da kayıtlı WhatsApp numarasından "TEKLIF KOD FİYAT" + `submit_job_offer_by_whatsapp` gerekir. Atama yalnız müşterinin seçimiyle olur. Linki açmak (GET) hiçbir şeyi değiştirmez.
5. HAVUZ BİLGİ KURALI (Owner, 30 Eki 2026, güncel):
   - Kabulden ÖNCE şoföre gösterilir: bölge → bölge (ör. "Antalya Havalimanı (AYT) >>> Alanya"), km, alış saati, yolcu sayısı, araç sınıfı, ödeme şekli (araçta nakit mi), teklif son saati, iş kodu.
   - Bölge zorunludur: alış ve varış bölgesi (zones) olmayan iş havuza açılamaz (missing_zone).
   - Kabulden ÖNCE ASLA: otel adı veya adres, müşteri adı ve iletişim bilgisi, uçuş numarası ve iniş saati, notlar, müşteri satış fiyatı, tavan, diğer şoförlerin teklifleri.
   - Kabulden SONRA, yalnız seçilen şoföre ve aracın tedarikçisine (driver_list_jobs, vendor_list_jobs): otel adı/adres, müşteri adı ve iletişim bilgisi, uçuş, notlar, nakit işte tahsil edilecek tutar. "Kabul" = atama accepted / in_progress; reservations.status = 'confirmed' değil (sabit fiyatlı iş havuza confirmed girer).
   - Müşteriye teklif listesinde: müşteri fiyatı (×1,30), şoförün yalnız ilk adı, araç modeli/sınıfı, tamamlanan iş sayısı. Şoför telefonu ve plaka seçimden önce gösterilmez.
   - Kural veritabanı fonksiyonlarında uygulanır; gizli alan sunucudan hiç gönderilmez. Gruba giden metin herkesçe görülür, iletilebilir ve ekran görüntüsü alınabilir.
6. Para birimleri karıştırılmaz: her tutar kendi para birimiyle tutulur, cari hesap para birimi başına ayrıdır, farklı para birimleri mahsup edilmez.
7. Hukuki ve mali konular (fatura, KDV, stopaj, komisyonculuk sınıflandırması, şoför belgeleri, cari mutabakat) "MALİ MÜŞAVİR / AVUKAT TEYİDİ" olarak işaretlenir.

## 1. Hak ediş modeli (settlements)
- Tamamlanan her atama için tek kayıt olur (assignment_id UNIQUE). Kayıt, atama completed olunca tetikleyiciyle otomatik açılır.
- Alanlar: customer_price, driver_payout (seçilen teklif), agos_share (hesaplanan), currency, collection_mode, driver_balance (hesaplanan), status, note, payee_id (hak ediş alıcısı).
- Alıcı (Owner kararı): araç bir tedarikçinin (vendor) ise tedarikçi, değilse şoför. Kayıt açılırken tetikleyiciyle yazılır (_settlement_payee), onaydan sonra değişmez. Migration öncesi kayıtlarda alıcı = şoför.
- Tahsilat modu (rezervasyondaki payment_method'dan):
  - card → agos_collected: AGOS müşteriden aldı, şoföre borçlu → driver_balance = +driver_payout
  - cash → driver_cash: nakdi şoför aldı, AGOS'a komisyon borçlu → driver_balance = −agos_share
- Durumlar ve geçişler:
  - needs_review → pending | void
  - pending → approved | disputed | void
  - approved → settled | disputed
  - disputed → pending | approved | void
- "settled" iki yön için de geçerlidir. Haftalık ekstre ödenince içindeki hak edişler otomatik settled olur.
- Eksik veya tutarsız veri (ödeme yöntemi yok, şoför ödemesi yok, ödeme fiyattan büyük) işin tamamlanmasını engellemez; kayıt needs_review olur ve operatöre düşer.
- Tutar düzeltmesi yalnız onaydan önce admin_update_settlement ile yapılır. Onaydan sonra settlement_adjustments satırı eklenir.
- RLS: şoför yalnız kendi kayıtlarını görür, tedarikçi alıcısı olduğu kayıtları görür (settlements_payee_select); admin hepsini görür (yalnız 2FA'lı oturumda); tabloya doğrudan yazma politikası yoktur.

## 2. Cari hesap (ledger): bağımsız şoför veya tedarikçi
- Hesap: her hak ediş alıcısı (bağımsız şoför veya tedarikçi) için para birimi başına bir ledger_accounts satırı (ilk kayıtta otomatik açılır). Filo şoförünün hesabı olmaz; filo işlerinin kalemleri ve nakit komisyon borcu tedarikçinin hesabına düşer, mahsup tedarikçi düzeyinde yapılır.
- İşaret: + = AGOS alıcıya borçlu, − = alıcı AGOS'a borçlu.
- Kayıt türleri: job_payout (+, kartlı iş), cash_commission (−, nakit iş), adjustment (±), payment_to_driver (−), payment_from_driver (+).
- Otomatik işleme: hak ediş approved olunca (bakiye 0 değilse) ve her settlement_adjustments satırında tetikleyiciyle kayıt düşer. Elle cari kaydı yazılmaz.
- Haftalık kapanış (Owner kararı): Pazartesi–Pazar, Europe/Istanbul. `close_weekly_statements()` Pazartesi sabahı service_role ile çalışır (n8n Schedule). Varsayılan: biten son hafta; aynı hafta iki kez kapanmaz.
  - opening_balance = önceki ekstrenin closing_balance'ı; period_total = haftadaki kayıtlar (kapanıştan sonra yapılan ödemeler dahil); closing = opening + period_total.
  - Otomatik mahsup (Owner kararı): nakit komisyon borcu ile kartlı iş alacağı aynı bakiyede toplanır; tek yönde net tutar çıkar: direction = agos_pays | driver_pays | zero.
  - due_date = kapanış + 3 gün (ÖNERİ, Owner onayı bekler).
- Ödeme: admin `record_ledger_payment(ekstre, tutar, not)` ile kaydeder. Kısmi ödeme olabilir, bakiyeyi aşamaz. Ödemeler bakiyeyi kapatınca ekstre settled olur; aynı hesabın daha eski açık ekstreleri (bakiye devrettiği için) ve içlerindeki hak edişler de settled olur.
- Şoför veya tedarikçi kendi carisini `driver_ledger()` ile görür (hesaplar, açık ekstreler, son 50 kayıt; kalemde transfer saati ve, tedarikçi hesabında, işi yapan şoförün adı). Tablolara doğrudan erişim yoktur.
- driver_balances görünümü (onaylı ama kapanmamış kayıtlar) operasyon özeti olarak kalır; resmi bakiye cari hesaptır.

## 3. İş havuzu ve teklifler
- Havuz bir rezervasyon bayrağı değil, kendi yaşam döngüsü olan bir iştir (dispatch_jobs): open → claimed | expired | cancelled.
- Açma: admin `open_bidding_job(rezervasyon, teklif_dk=30, seçim_dk=120, tekrar_yayın_dk=10)`.
  - Yalnız bölgeleri dolu ve aktif ataması olmayan rezervasyon açılır. Shuttle Alanya Group'un kendi işidir; havuza girmez.
  - Mod: confirmed + fiyatlı → fixed (tavan = fiyat ÷ 1,30); pending + fiyatsız → quote.
  - Süreler: teklif süresi (offer_deadline) → müşteri seçim süresi (expires_at). Seçim en geç alıştan 90 dk önce biter; teklif süresi 5 dk'dan kısa kalıyorsa too_late_for_pool.
  - Her işe kısa kod verilir (ör. J7F3KQ; 0/O/1/I/L kullanılmaz) ve müşteriye özel customer_token üretilir.
- Tekrar yayın: teklif süresi boyunca her rebroadcast_minutes'ta bir (normal 10 dk, acil 3 dk — Owner kararı), en fazla ceil(teklif_dk / tekrar_yayın_dk) kez. Mesajdaki "Son" saati teklif son saatidir. Teklif süresi bitince yayın durur.
- Teklif (`_submit_job_offer`, panel ve WhatsApp aynı çekirdek):
  - iş açık, teklif süresi dolmamış; araç şoförün kullanabileceği araç (bağımsız şoför: kendi aracı; filo şoförü: tedarikçinin aracı — _vehicle_pool_owner), sınıfı ve kapasitesi uygun
  - şoför başına tek aktif teklif; yeni teklif eskisinin yerine geçer; `withdraw_job_offer` ile geri çekilir
  - iş başına şoför başına en fazla max_offer_revisions() teklif (ÖNERİ 3; geri çekip yeniden vermek de sayılır) → too_many_revisions. Neden: "kabul sınırının üstünde" yanıtıyla tekrar tekrar teklif veren şoför tavanı, dolayısıyla müşteri fiyatını bulabilir
  - şoför kendi teklifini yalnız driver_get_job_offer / driver_list_open_jobs'tan görür (fiyat, durum, araç); job_offers tablosuna doğrudan okuma politikası YOK (satırda customer_price var)
  - quote: müşteri fiyatı = round(teklif × 1,30, 2); fixed: teklif > tavan ise above_cap (müşteriye gösterilmez)
  - ilk aktif teklif `offers_available` outbox olayını yazar (müşteriye customer_token linki + seçim son saati)
- Müşteri seçimi (girişsiz, customer_token ile, API route üzerinden ve rate limit'li):
  - `customer_list_offers(token)`: state = collecting (teklif toplanıyor) | choose | selected | closed | no_job
  - `customer_select_offer(token, teklif)`: quote modunda rezervasyon fiyatı dondurulur ve onaylanır; driver_payout = teklif; `_claim_dispatch_job` (araç, şoför takvimi ±3 sa, ARAÇ takvimi ±3 sa → vehicle_conflict, rezervasyon durumu kontrolleri) ile atanır; seçilen teklif selected, diğerleri rejected; job_won (seçilene tam bilgi) ve job_closed (kişisel veri yok) olayları yazılır. Herhangi bir adım başarısızsa hepsi geri alınır ve offer_not_available döner.
- Seçim yapılmazsa: expire_dispatch_jobs işi expired yapar ve operatöre düşer. Otomatik "en ucuz teklifi seç" YOK (ÖNERİ, Owner onayı bekler).
- Her deneme claim_attempts'e yazılır.
- Filo: tedarikçi–şoför bağı vendor_drivers (tek aktif bağ, yalnız admin: admin_set_fleet_driver). Bağ bitince şoförün artık kullanamayacağı araçla verdiği açık teklifler geri çekilir; tedarikçi pasifse filo teklif veremez. Aynı filo aracına birden çok şoför teklif verebilir; seçimde araç çakışması kontrol edilir.
- Bilinen sınır: takvim kontrolü ±3 saatlik kaba kontroldür; teklif anında çakışma kontrol edilmez (seçimde edilir).

## 4. Dağıtım kanalları
- Bireysel (tam otomatik, önerilen ana kanal): job_broadcast_targets, uygun aracı olan (filo şoförü için tedarikçinin aracı), WhatsApp opt-in vermiş aktif şoförleri döner. Onaylı "agos_job_offer" şablonu + "Teklif ver" quick-reply butonu (payload "TEKLIF KOD" → şoföre fiyat sorulur).
- Gruplar:
  - Resmi WhatsApp Groups API yalnız işletmenin kurduğu, davetle katılınan, küçük gruplarda çalışır (üçüncü taraf özeti, Ağu 2026: grup başı en fazla 8 katılımcı; Official Business Account gerekir). Limitleri güncel Meta dokümanından doğrula.
  - Mevcut büyük şoför gruplarına resmi API ile otomatik mesaj atılamaz. n8n hazır grup metnini operatöre gönderir, operatör tek dokunuşla iletir (operator_forward).
  - Kişisel hesabı WhatsApp Web botlarıyla otomatikleştirmek Meta şartlarına aykırıdır ve numaranın kapatılması riskini taşır. Owner bunu isterse riski açıkça yaz; varsayılan olarak kurma.
- Grup metni: iş kodu, bölge >>> bölge, saat, km, yolcu, sınıf, "Fiyatını sen teklif et", ödeme şekli, teklif son saati, "TEKLIF KOD <fiyat>" talimatı + wa.me linki (https://wa.me/İŞLETME?text=TEKLIF%20KOD%20) ve panel linki. Başka alan eklenmez; tavan ve müşteri fiyatı yazılmaz.
- Panel linki /driver/jobs/JOB_ID: giriş ister, kabul öncesi yalnız kural 0.5'teki bilgileri gösterir. Teklif DriverBidCard ile verilir: fiyat (virgül/nokta), araç seçimi, onay adımı, değiştir / geri çek; tavan istemcide kontrol edilmez ve gösterilmez, alert() yok. Teklif süresi bitince kart "müşteri seçiyor" durumuna geçer. Sayfanın title ve og etiketleri geneldir ("AGOS iş teklifi"); link önizlemesi gruba düştüğü için bu etiketlere iş detayı yazılmaz.

## 5. WhatsApp ile teklif ve kayıt
- Kimlik: mesajı gönderen WhatsApp numarası (Meta doğrular). Gelen webhook'ta önce X-Hub-Signature-256 imzası ham gövde üzerinden doğrulanır.
- Komutlar (whatsapp_inbound_command_node):
  - "TEKLIF KOD 55" / "teklif kod 55,50 €" → bid
  - "TEKLIF KOD" veya şablon butonu (fiyatsız) → bid_prompt (şoföre fiyat sorulur)
  - liste seçimi ARACT:KOD:FİYAT:ARAÇ_ID → araçlı bid
  - eski "AL KOD" / ARAC: → RPC'ye gitmez, "işler artık teklif usulüyle" yanıtı (use_bid)
  - müşteriden tek kelime DUR / STOP / STOPP / СТОП → opt_out (yalnız yorum isteklerini kapatır; agos-reviews)
  - diğer mesajlar → operasyon gelen kutusu
- submit_job_offer_by_whatsapp sonuçları → yanıt (whatsapp_claim_reply_node):
  - offer_saved: teklif alındı, müşteri seçerse haber verilir; kalan değiştirme hakkı yazılır
  - above_cap: "kabul sınırının üstünde", tavan değeri söylenmez
  - too_many_revisions: değiştirme hakkı doldu, son teklif geçerli
  - choose_vehicle: birden fazla uygun araç → interaktif liste (en fazla 10, ARACT satırları)
  - not_registered: kayıt daveti linki (register_driver_lead, 7 gün geçerli; aynı numaraya aynı token)
  - account_inactive, offers_closed, not_open, invalid_price, not_found, no_eligible_vehicle, vehicle_not_eligible: kısa açıklama
  - beklenmeyen sonuç: şoföre genel yanıt + operatör uyarısı
  - seçilen şoföre tam bilgi job_won şablonuyla ayrı mesajda gider (bu yanıt düğümünden değil)
- Kayıtlı numaradan teklifte tekrar bilgi istenmez. Kayıt: davet linki → form (ad, araç, plaka, belgeler) → admin onayı → aktif şoför + WhatsApp opt-in. Hangi belgelerin istenip saklanacağı (adli sicil, ehliyet, SRC, ruhsat, sigorta) AVUKAT TEYİDİ gerektirir.
- Telefon eşleştirme wa_digits ile yapılır (00 öneki, 0532 / 532 yerel yazımı → 90532…).

## 6. Google Sheets muhasebe aktarımı
- Yön tektir: veritabanı → Sheets. Sheets'ten veritabanına tutar veya durum yazılmaz.
- Muhasebeci bir kaydı kapatmak isterse bu AGOS admin panelinde yapılır (record_ledger_payment / admin_update_settlement); Sheets bir sonraki aktarımda güncellenir.
- Aktarım: n8n Schedule Trigger → sınırlı RPC (ör. export_settlements_since, export_statements_since) → Google Sheets düğümü "append or update", anahtar settlement_id / statement_id. Tekrar çalışmak çift satır üretmez.
- Hak ediş sütunları: settlement_id, rezervasyon kodu, iş tarihi (Türkiye saati), rota özeti, şoför adı, alıcı (payee: şoför veya tedarikçi şirketi), para birimi, müşteri fiyatı, şoför ödemesi, AGOS payı, tahsilat modu, şoför bakiyesi, durum, onay/kapanış tarihi. Ekstre sütunları: statement_id, hesap sahibi (şoför veya tedarikçi), para birimi, hafta, açılış, hafta toplamı, kapanış, yön, vade, durum. Yolcu telefonu ve e-postası yoktur.
- Tutarlar sayı olarak yazılır; para birimi ayrı sütundur. Toplamlar para birimine göre ayrı alınır.
- Formül enjeksiyonu: kullanıcıdan gelen metin =, +, -, @ ile başlıyorsa başına tek tırnak eklenir.
- Erişim: servis hesabı yalnız bu tabloya yazar; tablo yalnız Owner ve muhasebeciyle paylaşılır.
- Sheets resmi muhasebe kaydı değildir; e-Arşiv/e-Fatura ve KDV MALİ MÜŞAVİR TEYİDİ gerektirir.

## 7. Kod ve test kuralları
- Para: veritabanında numeric, kodda tam sayı kuruş/cent veya decimal; float yok.
- Finans, havuz ve teklif değişiklikleri yalnız security definer fonksiyonlarla yapılır; istemci tabloya doğrudan yazmaz. İç fonksiyonlar (_claim_dispatch_job, _submit_job_offer, _driver_update_assignment_status, _ledger_account, _vehicle_pool_owner, _settlement_payee) dışarıya kapalıdır. Araç koşulu `v.vendor_id = public._vehicle_pool_owner(şoför)` biçiminde yazılır; `v.vendor_id = p_actor` kalıbı geri getirilmez. Admin kontrolü yalnız `public.app_role() = 'admin'` (2FA).
- n8n yalnız gereken RPC'leri çağırır: claim_due_broadcasts, job_broadcast_targets, submit_job_offer_by_whatsapp, register_driver_lead, close_weekly_statements, messaging_opt_out. Müşteri fonksiyonları (customer_list_offers, customer_select_offer) yalnız rate limit'li API route üzerinden çağrılır.
- Zorunlu testler:
  - nakit ve kartlı işte bakiye yönü doğru; eksik veriyle kayıt needs_review
  - onaylanan kayıt değiştirilemez, kayıt silinemez; cari kaydı güncellenemez/silinemez; şoför başkasının kaydını göremez
  - bölgesiz iş açılamaz; alışa çok az kalan iş havuza açılamaz; eski open_dispatch_job / claim_dispatch_job çağrılamaz
  - ×1,30: quote 45 → 58,50; fixed 80 € → tavan 61,53, tavan üstü above_cap, müşteri fiyatı değişmez; şoför başına tek aktif teklif
  - teklif sınırı: 3 teklif sonra too_many_revisions; şoför job_offers tablosundan 0 satır görür; iş kartında müşteri fiyatı, tavan, fiyat modu, başka şoförün teklifi yok; fiyatsız (pending) talep kartta açık görünür
  - müşteri seçimi: rezervasyon fiyatı ve driver_payout dondurulur, diğer teklifler rejected, job_won / job_closed yazılır; başarısız seçim hiçbir şeyi değiştirmez
  - tekrar yayın: teklif son saati gösterilir, teklif süresi bitince yayın durur, seçimden sonra yayın yok
  - hedefler: opt-in vermeyen ve uygun aracı olmayan şoför ile bölgesi eşleşmeyen grup dâhil edilmez
  - WhatsApp: kayıtsız → davet (aynı token), pasif → account_inactive, çok araç → seçim, fiyatsız TEKLIF → fiyat sorulur, eski AL → use_bid
  - kapanış: Pzt–Paz İstanbul haftası, aynı hafta iki kez kapanmaz, mahsup doğru, ödeme sonraki haftaya devreder, son ekstre ödenince eski açık ekstreler de kapanır
  - kabul öncesi görünümlerde ve grup metninde otel, müşteri, uçuş, not, müşteri fiyatı, tavan yok; müşteri listesinde şoför telefonu/plakası yok
  - Sheets aktarımı iki kez çalışınca çift satır yok; formül enjeksiyonu kaçışı çalışıyor
  - filo: filo işinde payee = tedarikçi, kalem ve düzeltme tedarikçi hesabına; onaydan sonra alıcı değişmez; bağımsız şoförün kayıtları kendisinde; aynı araç çakışan saatte ikinci işe seçilemez (vehicle_conflict)

## 8. Açık kararlar
KARARLAŞTI (30 Eki 2026): teklif × 1,30; şoförler fiyat verir, seçimi müşteri yapar; fiyatı belli işte tavan; cari hesap haftalık kapanır; nakit/kart otomatik mahsup; filo aracıyla yapılan işin hak edişi tedarikçiye (agos-governance).
1. Müşteri seçim süresinde seçmezse: operatöre düşer (şu an) mı, otomatik en uygun teklif mi?
2. Tavanın şoförlere gösterilmesi (şu an gösterilmiyor) ve teklif değiştirme sınırı (ÖNERİ 3).
3. Haftalık ekstre vade günü (ÖNERİ: kapanış + 3 gün) ve geciken nakit komisyon borcunda ne olacağı (yeni iş kısıtı?).
4. Farklı para birimlerinde bakiyesi olan şoför: ayrı ödeme mi, kurla çevirip mahsup mu (şu an ayrı).
5. Büyük WhatsApp grupları: operatör iletimi mi (önerilen), resmi olmayan otomasyon mu (ban riski)?
6. KDV tabanı ve faturalama modeli (Merchant of Record geçişi).
7. Filo şoförünün teklifini tedarikçinin onaylaması / filo şoförünün kendi aracıyla iş alması (şu an: onaysız; kendi aracıyla hayır).
8. Şoför kayıt formu ve istenecek belgeler.
9. Sheets aktarım sıklığı, sütun seti ve erişim listesi.
10. Uyuşmazlık (disputed) süreci.
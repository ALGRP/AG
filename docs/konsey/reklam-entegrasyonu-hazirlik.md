# Reklam entegrasyonu hazırlığı (V2 devir §5)

**Durum: HAZIRLIK NOTU. HİÇBİR MADDE DOĞRULANMADI.**

- **Resmî sayfalara erişilemedi.** Bu oturumun ağ politikası şu alan adlarını engelledi:
  - `developers.google.com`
  - `support.google.com`
  - `developers.facebook.com`
- **Kaynak:** Aşağıdaki her madde **web arama motoru özetlerinden** derlendi. Resmî sayfa okunmadan uygulamaya geçilmez.
- **Doğrulama yolu:** Bu alan adları ortamın ağ ayarlarında izinli listeye eklenir veya bir insan resmî sayfaları okur. Doğrulanan her satır "DOĞRULANDI (tarih, URL)" olarak işaretlenir.
- **Yapılmayanlar:** Hiçbir reklam hesabı açılmadı veya bağlanmadı. Hiçbir API çağrısı yapılmadı, hiçbir dönüşüm verisi gönderilmedi.

## 1. Google Ads API

| Konu | Arama özetinin aktardığı | Durum | AGOS için sonuç |
| -- | -- | -- | -- |
| Developer token | Token'lar 9 Eylül 2026'da emekliye ayrıldı; erişim düzeyi, OAuth kimlik bilgilerinin üretildiği **Google Cloud projesine** bağlı. Token göndermek isteğe bağlı ve sunucu onu yok sayıyor; ileride bir ana sürümde token içeren çağrılar reddedilecek. Başvuru API Center'dan değil, Cloud Console'daki "Google Ads API" sayfasından yapılıyor. | DOĞRULANMADI | Eski "developer token zorunlu" kontrolü yeni entegrasyona **taşınmaz**. Erişim düzeyi Cloud projesinden okunur. Proje sahibi ve editör rolleri (API bildirimleri bunlara gider) Owner tarafından belirlenir. |
| OAuth | Kimlik bilgileri Cloud projesinde üretiliyor | DOĞRULANMADI | Partner hesabına erişim partnerin OAuth onayıyla kurulur; önce salt okunur. Yenileme token'ları kiracı bazlı kasada tutulur, hiçbir zaman repo'da veya Linear'da olmaz. |
| Hesap bağlantısı (MCC) | Resmî "linking manager accounts" sayfası okunamadı | DOĞRULANMADI | Davet ve kabul akışı resmî sayfadan doğrulanmadan yazılmaz. Öneri (H-13): önce partnerin kendi hesabında kullanıcı düzeyinde salt okunur erişim; MCC sonra. |
| Search dil hedeflemesi | Eylül 2026'dan (hedef 2026-09-30) itibaren Search, AI Max for Search ve PMax'ın Search kısmında manuel dil kriteri (`CampaignCriterion.language`) kalkıyor. Search'te eklemek `ContextError.OPERATION_NOT_PERMITTED_FOR_CONTEXT` döndürüyor. Reklamlar kreatif ve açılış sayfası diline göre eşleşiyor; dil hariç tutma yok. | DOĞRULANMADI | Uydu sitelerin dil ayrımı (TR/EN/DE/RU) dil kriteriyle değil, dile özel kreatif ve açılış sayfasıyla yapılır. Kod Search kampanyasına dil kriteri yazmaz. |
| Offline dönüşüm | Offline dönüşüm ve lead'ler için enhanced conversions yüklemeleri **Data Manager API**'ye taşınıyor. Google Ads API'de 15 Haziran 2026'dan itibaren engelli (eski erişimi olmayanlar için). Data Manager'da geri çekme yok, değer yeniden bildirilebiliyor. `operating_account` dönüşüm eyleminin sahibi olmalı. | DOĞRULANMADI | Dönüşüm sunucu tarafında Data Manager API ile gönderilir. Her kiracının kendi dönüşüm eylemi ve hesabı olur. Geri çekme olmadığı için yalnız **tamamlanmış ve tahsil edilmiş** rezervasyon gönderilir. İade ve iptalde değer düzeltme yöntemi resmî dokümandan doğrulanmalı. KVKK rızası yoksa kişisel veri gönderilmez. |

Kullanılacak API sürümü seçildiğinde dil ve offline dönüşüm maddeleri o sürümün sürüm notlarına göre yeniden kontrol edilir.

## 2. Ortalama günlük bütçe ile kesin harcama sınırı

| Kavram | Arama özetinin aktardığı | Durum | AGOS için |
| -- | -- | -- | -- |
| Ortalama günlük bütçe | Bir günde harcama ortalama günlük bütçenin yaklaşık **2 katına** çıkabilir. Aylık ücret sınırı = günlük bütçe × **30,4**. Aşan hizmet için otomatik kredi verilir. Günlük kesin sınır ayarlanamıyor. | DOĞRULANMADI | Panel "günlük bütçe"yi kesin sınır gibi göstermez. Örnek 40 €/gün: bir günde yaklaşık 80 € harcanabilir; ayda en fazla yaklaşık 1.216 € (40 × 30,4). |
| Kesin harcama sınırı | Hesap düzeyi bütçe ve faturalama ayarları; resmî sayfa okunamadı | DOĞRULANMADI | Kesin sınırı hesap sahibi (partner) kendi faturalama ayarında koyar. AGOS bunu yalnız gösterir, değiştirmez. Harcama AGOS kartına aktarılmaz. |

## 3. Meta

| Konu | Arama özetinin aktardığı | Durum | AGOS için |
| -- | -- | -- | -- |
| İzinler | `ads_management`: uygulama, sahibi olduğu ya da sahibinin erişim verdiği reklam hesabını okur ve yönetir. `ads_read`: okuma. | DOĞRULANMADI | İlk hedef yalnız okuma. |
| Erişim düzeyi | Standart erişim yalnız kendi reklam hesaplarını kapsıyor. Başkalarının hesapları için Advanced Access gerekiyor; bu, izin ve özellik bazında App Review ile alınıyor. Advanced Access için **Business Verification** zorunlu. "Ads Management Standard Access" adı "Marketing API Access Tier" oldu. Standart erişim için son 15 günde en az 1.500 Marketing API çağrısı eşiği var. | DOĞRULANMADI | Partner hesaplarını AGOS uygulamasıyla yönetmek App Review ve Business Verification ister; süre belirsiz. Hesap uygunluğu ve açılabilirliği varsayılmaz. |
| Conversions API alanları | `client_ip_address`, `client_user_agent`, `fbc` ve `fbp` hash'lenmiyor. Website olaylarında `event_source_url` ve `client_user_agent` zorunlu; `referrer_url` isteğe bağlı. IP anonimleştirme kesik IP'yi geçersiz kılabiliyor. Limited Data Use (`data_processing_options`) ayarı var. "Otomatik veri minimizasyonu" diye bir özellik **bulunamadı**. | DOĞRULANMADI | Aşağıdaki kurallar geçerli. |

**Conversions API için kurallar:**
- Rıza yoksa olay gönderilmez.
- Rıza varsa yalnız gerekli alanlar gönderilir. `referrer_url` gönderilmez.
- URL'de kişisel veri ya da rezervasyon sorgulama jetonu bulunmaz.
- IP ve tam URL alanlarının kullanımı ile LDU ayarı hukuk/KVKK onayıyla belirlenir.
- Her kiracının kendi Pixel/Dataset kimliği olur. Tarayıcı ve sunucu olayları olay kimliğiyle tekilleştirilir.

## 4. Arama motorunun gösterdiği kaynaklar

Bu sayfalar bu oturumda **doğrudan okunmadı**; resmî olanlar ağ politikası yüzünden açılamadı.

- Google developer token sayfası: https://developers.google.com/google-ads/api/docs/api-policy/developer-token
- Google Ads API deprecations: https://developers.google.com/google-ads/api/docs/deprecations
- Data Manager API upgrade rehberi: https://developers.google.com/data-manager/api/devguides/events/google-ads/offline/upgrade
- Google Ads yardım, offline dönüşüm: https://support.google.com/google-ads/answer/2998031
- Google Ads yardım, aşırı harcama ve günlük bütçe: https://support.google.com/google-ads/answer/1704443
- Google Ads yardım, harcama yönetimi: https://support.google.com/google-ads/answer/1704424
- Google Ads yardım, dil hedefleme: https://support.google.com/google-ads/answer/1722078
- Meta izin referansı: https://developers.facebook.com/docs/permissions
- Meta Marketing API erişim: https://developers.facebook.com/docs/marketing-api/access
- Meta Conversions API kullanım: https://developers.facebook.com/docs/marketing-api/conversions-api/using-the-api
- İkincil kaynaklar (yalnız bağlam, otorite değil):
  - https://www.relevantaudience.com/google-ads-en/google-ads-api-developer-tokens-sunset-cloud-project-access/
  - https://ppc.land/google-blocks-new-offline-conversion-imports-via-ads-api-from-june-15/
  - https://www.seroundtable.com/google-ads-language-targeting-update-41867.html
  - https://docs.snowplow.io/docs/destinations/forwarding-events/integrations/meta-conversions/

## 5. Sonraki tek adım

Ağ izni verilir veya bir insan resmî sayfaları okur; bu tablodaki her satır tek tek doğrulanır. Ardından SEL-456 madde 10'daki tek kiracılı sandbox planı yazılır. Hesap açma ve harcama yok.

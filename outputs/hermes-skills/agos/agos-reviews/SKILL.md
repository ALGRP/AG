---
name: "agos-reviews"
description: "AGOS'ta transfer sonrası Google Haritalar yorum isteği (outbox, sessiz saatler, WhatsApp UTILITY şablonu, DUR/STOP, Google politikası) ve şoför/araç iç puanlaması. Yorum, puan, Google review veya iş sonrası mesaj işlerinde kullan."
---

# AGOS Google Haritalar Yorum İsteği

Kapsam: tamamlanan transferden sonra müşteriye giden yorum isteği; şablon metinleri; çıkış (DUR/STOP); Google Business Profile tarafında yorum toplama ve yanıtlama; şoför ve araç için iç puanlama. Bildirim altyapısı (outbox, HMAC, şablon kuralları) için agos-notification-automations, yerel SEO ve trafik için search-visibility-growth skill'ine (kuruluysa) bak.

Referans: review_requests.sql (enqueue_review_request tetikleyicisi, review_send_at, messaging_preferences, messaging_opt_out, skip_outbox), n8n review_request_code_node.js, lib/outbox/dispatch.ts (finish_outbox); iç puanlama için vehicle_profile_ratings.sql (trip_ratings, customer_rate_trip, _rating_summary), components/customer/RatingForm.tsx.

## 0. Değişmez kurallar
1. Herkese aynı istek (AGOS-RULE-REV-01). Tamamlanan her transferde aynı mesaj gider. Memnuniyet, şikâyet, puan tahmini, rötar veya şoför performansı atlama nedeni değildir. "Memnun musunuz? Evet → Google, Hayır → form" akışı kurulmaz. Google Maps politikası seçerek olumlu yorum toplamayı (selectively solicit positive reviews) ve olumsuz yorumu caydırmayı yasaklar.
2. Teşvik yok: indirim, hediye, çekiliş, puan, ücretsiz hizmet karşılığında yorum istenmez. Olumsuz yorumun silinmesi veya değiştirilmesi karşılığında da bir şey teklif edilmez.
3. Puan ve içerik yönlendirmesi yok: "5 yıldız verin", "şoförümüzün adını yazın", "VIP hizmetimizden bahsedin" gibi ifadeler kullanılmaz.
4. Şoför ve personel:
   - Şoför araçta yorum istemez, baskı yapmaz, telefonu uzatıp yazdırmaz (Google: işletmede yorum için baskı yasak).
   - Şoföre yorum sayısı kotası, yorum liderlik tablosu veya yorum başına prim konmaz. Müşteriden adının geçtiği yorum istemesi de yasaktır (Google, Nisan 2026 güncellemesi).
   - Şoför performansı AGOS içi değerlendirmeyle ölçülür, Google yorumlarıyla değil.
5. Sahte yorum yok: personel, aile, ajans "yorum paketi" veya satın alınmış yorum kullanılmaz; çalışan kendi işletmesine yorum yazmaz.
6. Tek tetikleyici, tek mesaj: rezervasyon completed olunca veritabanı tetikleyicisi outbox'a tek kayıt yazar (dedupe_key = rezervasyon:review_request). n8n'de driver_assignments veya reservations webhook'u ile ayrıca tetiklenmez (iki kaynak = çift mesaj).
7. Meta şartları:
   - İşletmenin başlattığı mesaj = onaylı şablon + WhatsApp izni.
   - UTILITY kategorisi için mesaj belirli bir transfere atıf yapar (tarih + rota) ve tanıtım içermez. Genel "bizi değerlendirin" mesajı utility onayı almaz.
   - Tanıtım eklenirse (indirim, "tekrar bekleriz", kampanya) şablon MARKETING olur: daha pahalıdır ve ayrı pazarlama izni ister.
8. Mesaja otel, adres, fiyat, şoför adı/telefonu girmez. Müşteriye iç sistem adı "AGOS" yazılmaz; müşterinin tanıdığı marka kullanılır (Alanya Group veya üye sitenin markası).
9. KVKK / GDPR / İYS: tanıtım içermeyen yorum isteğinin "ticari elektronik ileti" sayılıp sayılmadığı ve izin metni AVUKAT TEYİDİ gerektirir. Her mesajda DUR/STOP ile çıkış yolu bulunur.

## 1. Akış
1. Rezervasyon completed olur (şoför "Görevi tamamla" → _driver_update_assignment_status, veya admin).
2. Tetikleyici `enqueue_review_request` outbox'a review_request yazar:
   - next_attempt_at = `review_send_at(tamamlanma)`
   - payload: ilk ad için passenger_name, telefon, dil, WhatsApp izni, alış saati, bölge adları. Otel/adres/fiyat yok.
3. Operasyonel atlama nedenleri (kayıt yine yazılır, status = skipped, last_error = neden):
   - no_valid_phone: ülke kodu belirsiz numara (ör. 0151… Alman yerel yazımı); tahmin edilmez
   - no_whatsapp_opt_in: rezervasyonda WhatsApp izni yok
   - opted_out: numara daha önce DUR/STOP yazdı
   - later_leg_pending: aynı numaranın 21 gün içinde başka transferi var → son bacaktan sonra sorulur (ÖNERİ)
   - recently_asked: aynı numaraya son 180 günde soruldu (ÖNERİ)
4. Outbox göndericisi zamanı gelince HMAC imzalı olarak n8n'e iletir. n8n: Webhook → imza doğrulama → Switch (event) → review_request_code_node → Meta → meta_send_result_node → Respond to Webhook.
5. Sonuç meta_send_result_node ile 200 + `{ reply: { result } }` olarak döner; gönderici finish_outbox çağırır (delivery_errors.sql). Politika gereği gönderilmezse (izin yok, numara geçersiz, tamamlanmanın üstünden 48 saatten fazla geçmiş) 'skipped'; veri hatası (bölge yok, tarih bozuk) 'permanent'. Yorum isteği kritik olmadığından operatör uyarısı üretmez ve zaman aşımında tekrar denenmez (çift mesaj olmasın); kayıt admin_notification_failures listesinde görünür.
6. Bekleme n8n Wait düğümüyle yapılmaz: bekleyen yürütmeler n8n yeniden başlatmasında, sürüm güncellemesinde ve tekrar gönderimde kırılgandır. Zaman outbox'ta tutulur.

## 2. Zamanlama (Europe/Istanbul)
- Kural (Owner): tamamlanma + 30 dk. PLANLANAN gönderim saati 23:00–08:00 arasına düşerse 10:00'a ertelenir. Kontrol tamamlanma saatine değil gönderim saatine yapılır (22:40'ta biten iş 23:10'da gitmez).
- Örnekler: 14:00 → 14:30 · 22:40 → ertesi gün 10:00 · 01:00 → aynı gün 10:00 · 07:45 → 08:15 · 07:20 → 10:00.
- Parametreler review_send_at içinde: gecikme, sessiz başlangıç/bitiş, gönderim saati. Değer değişikliği Owner kararıdır.
- ÖNERİ (onaysız): varışta (havalimanı → otel) müşteri check-in yapıyor olabilir, gecikme 2–3 saat; dönüşte (otel → havalimanı) 30 dk uygundur.

## 3. WhatsApp şablonu
- Tek şablon adı: `agos_review_request`, kategori UTILITY. Diller aynı adın çevirileri olarak eklenir: tr, en, ru (de onaylanınca). Dil kodu Meta'daki ile birebir aynı olmalıdır ('en' ile 'en_US' farklıdır).
- Dil: rezervasyon dili; yoksa numaradan kaba tahmin (+90 → tr, +7 → ru, diğerleri → en). Onaysız dil en'e düşer.
- Değişkenler: {{1}} ilk ad (yoksa "Değerli Misafirimiz" / "there" / "уважаемый гость"), {{2}} transfer tarihi, {{3}} rota (ör. "Antalya Havalimanı (AYT) – Alanya"; havalimanı adı dile çevrilir).
- Değişken metnin başında veya sonunda durmaz (Meta reddeder). Parametrede satır sonu, tab, 4+ boşluk olmaz.
- Buton: URL, SABİT adres = Google Business Profile "Yorum iste" linki (https://g.page/r/…/review). Link gövdeye yazılmaz. Link değişirse şablon yeniden onaya gider.
- Örnek değerler (Meta onayı için): Anna · 3 Kasım · Antalya Havalimanı (AYT) – Alanya.

TR
- Gövde: Merhaba {{1}}, {{2}} tarihli {{3}} transferiniz tamamlandı. Deneyiminizi Google Haritalar'da değerlendirmek isterseniz aşağıdaki butonu kullanabilirsiniz. Olumlu ya da olumsuz her görüş hizmetimizi geliştirmemize yardımcı olur.
- Alt bilgi: Alanya Group · Bu mesajları almamak için DUR yazın
- Buton: Google'da değerlendir

EN
- Body: Hello {{1}}, your transfer {{3}} on {{2}} has been completed. If you would like to rate your experience on Google Maps, please use the button below. Every opinion, positive or negative, helps us improve our service.
- Footer: Alanya Group · Reply STOP to opt out
- Button: Rate us on Google

RU
- Текст: Здравствуйте, {{1}}! Ваш трансфер {{2}} по маршруту {{3}} завершён. Если хотите оценить поездку в Google Картах, нажмите кнопку ниже. Любой отзыв, положительный или отрицательный, помогает нам стать лучше.
- Нижний колонтитул: Alanya Group · Чтобы отписаться, ответьте СТОП
- Кнопка: Оценить в Google

DE (onaylanınca)
- Text: Hallo {{1}}, Ihr Transfer {{3}} am {{2}} ist abgeschlossen. Wenn Sie Ihre Erfahrung auf Google Maps bewerten möchten, nutzen Sie bitte die Schaltfläche unten. Jede Meinung, ob positiv oder negativ, hilft uns, besser zu werden.
- Fußzeile: Alanya Group · Abmelden: STOPP antworten
- Button: Bei Google bewerten

Eski taslaktan kaçınılanlar: dil başına ayrı şablon adı; "AGOS VIP Transfer" (iç ad, tanıtım tonu); "Have a safe trip back" (varış transferinde yanlış); "Tekrar görüşmek dileğiyle / hope to see you again" (tanıtım → MARKETING riski); gövdede çıplak link; TR/RU mesajda İngilizce "Valued Guest"; numara biçimlendirmede ülke kodu tahmini; `\vert{}\vert{}` gibi bozuk operatörler.

## 4. Çıkış (DUR / STOP)
- Müşteri tek kelime DUR, STOP, STOPP veya СТОП yazarsa whatsapp_inbound_command_node `opt_out` üretir → `messaging_opt_out(numara)`.
- Etki: yalnız yorum istekleri kapanır; bekleyen yorum isteği skipped olur. Şoför bilgisi, rötar, voucher gibi operasyonel mesajlar sürer.
- Yanıt üç dilde kısa onaydır. "İptal" kelimesi çıkış sayılmaz (rezervasyon iptali olabilir; operatöre gider).
- Müşterinin yorum isteğine yazdığı diğer cevaplar (şikâyet, teşekkür) operasyon gelen kutusuna düşer; operatör yanıtlar. Bu, yorum isteğinin kendisini değiştirmez.

## 5. Google Business Profile tarafı
- Yorum linki: GBP panelindeki "Yorum iste / Ask for reviews" linki. Üye (white-label) sitelerde her işletmenin kendi profili ve linki olur; bir üyenin müşterisine Alanya Group linki gönderilmez (kiracı modeli gelince şablon/link kiracı bazında).
- Yanıtlama (ÖNERİ): tüm yorumlara 48 saat içinde, kısa ve olgun ton. Olumsuz yorumda özür + somut düzeltme + iletişim kanalı. Yanıtta müşteri adı, uçuş, otel, rezervasyon detayı yazılmaz. Yorumu değiştirme karşılığı tazminat teklif edilmez.
- Olumsuz yorum silinemez; yalnız politika ihlali (sahte, alakasız, hakaret) GBP üzerinden bildirilir.
- QR kodlu kart, e-posta, WhatsApp aynı kurallara tabidir: herkese, filtresiz, teşviksiz.

## 6. Ölçüm
- Meta durumları (sent/delivered/read) outbox ve gönderim loglarından; yorum sayısı ve ortalama puan GBP'den aylık izlenir.
- Şoför bazında Google yorumu eşleştirilmez ve hedefe bağlanmaz (kural 0.4).
- Tıklama ölçümü istenirse (ÖNERİ): butona kendi kısa yönlendirme linkimiz (kişisel veri içermeyen kod) konur, tıklama sayılır, GBP linkine 302 ile gider.

## 6b. İç puanlama: şoför ve araç (vehicle_profile_ratings.sql)
- Google yorumundan AYRI bir sistemdir. Müşteri kendi linkinde (/offers/<token>), transfer tamamlandıktan sonra 30 gün içinde, rezervasyon başına BİR kez puan verir (customer_rate_trip).
- Şoför ve araç AYRI 1–5 yıldız + isteğe bağlı yorum (en fazla 1000 karakter, kontrol karakterleri temizlenir).
- Owner kararı: kartlarda yalnız yıldız + sayı görünür. Yorum metnini yalnız admin/operasyon okur; müşteriye formda bu açıkça söylenir. Şoföre yalnız kendi puanı ve sayısı gösterilir, yorum metni gösterilmez.
- Kalite puanı (ÖNERİ): Bayes ortalaması, ön değer 4,5, ağırlık 5 (rating_prior, rating_prior_weight). En az 3 değerlendirme yoksa (min_ratings_to_show) kartta "Yeni".
- Gizleme yalnız gerekçeyle: hakaret, kişisel veri, sahte/şüpheli puan (admin_hide_rating, neden zorunlu, satır silinmez). Olumsuz diye puan gizlenmez.
- Review gating yasağı burada da geçerli: iç puan formu verilen yıldıza göre Google'a yönlendirmez; Google yorum isteği herkese aynı gider (bölüm 1).
- İç puan kalite yönetimi içindir; şoföre prim/ceza kararı Owner'ındır. Google yorum sayısı şoför hedefine bağlanmaz (kural 0.4).

## 7. Kod ve test kuralları
- Zorunlu testler:
  - review_send_at sınırları: 14:00, 22:40, 01:00, 07:20, 07:45 örnekleri
  - completed geçişinde tek kayıt; tekrar güncellemede ikinci kayıt yok
  - atlama nedenleri: geçersiz numara, izin yok, opt-out, 21 gün içinde dönüş bacağı, 180 gün içinde sorulmuş
  - dönüş bacağı tamamlanınca istek gider; opt-out bekleyen isteği iptal eder
  - zamanı gelmeden outbox'tan alınmaz; skip_outbox tekrar denenmez
  - payload ve mesajda otel, adres, fiyat yok; ilk ad kullanılır; parametre temizliği
  - dil seçimi ve onaysız dilin en'e düşmesi; 48 saatten eski tamamlanma skip
  - DUR / STOP / СТОП opt_out; "iptal" ve "stop please" opt_out değil
  - messaging_preferences ve opt-out fonksiyonu anon/authenticated'a kapalı
  - iç puan: tamamlanmadan puan yok (not_completed), ikinci puan already_rated, 6 yıldız reddedilir; 3 değerlendirmeden önce "Yeni"; yorum metni şoföre ve müşteri kartına sızmaz; gizlenen puan ortalamaya girmez
- Loglarda telefon maskeli; tam numara ve ad yazılmaz.

## 8. Açık kararlar
1. Varış ve dönüş transferlerinde farklı gecikme (ÖNERİ: varış 2–3 sa, dönüş 30 dk).
2. 180 günlük tekrar sınırı ve 21 günlük dönüş bacağı penceresi (ÖNERİ).
3. DE (ve sonra AR/FA) şablon çevirileri.
4. Üye siteler için kiracı bazında GBP linki ve marka.
5. İYS / KVKK / GDPR değerlendirmesi ve rezervasyon formundaki izin metni (AVUKAT TEYİDİ).
6. Yorum yanıtlarını kimin, hangi sürede yazacağı.
7. İç puan: Bayes ön değeri/ağırlığı ve gösterim eşiği (ÖNERİ 4,5 / 5 / 3); operasyon ölçütlerinin (dakıklık, iptal) kalite puanına katılıp katılmayacağı.
---
name: "agos-pricing-matrix"
description: "AGOS fiyat motoru: shuttle sabit tarifesi, private/VIP bölge+km+yön tarifesi, şoför teklifi ve marj, sürşarjlar, döviz, fiyat snapshot'ı ve Google Routes entegrasyonu. Fiyat, tarife, mesafe, komisyon veya fiyat kodu işlerinde kullan."
---

# AGOS Fiyat Motoru ve Tarife Matrisi

Kapsam: Alanya Group / AGOS transfer fiyatları (Antalya + Muğla; AYT, GZP, DLM), fiyat motoru kodu, tarife verisi, fiyat içeriği ve tarife önerileri. Bu dosyadaki sayılar ya Owner onaylı olduğu belirtilmiş referanslardır ya da ÖRNEK'tir. Canlı değer her zaman merkezi matristen okunur.

## 0. Değişmez kurallar
1. Tek doğruluk kaynağı merkezi fiyat/tarife matrisidir (veritabanı). Fiyat koda, sayfa içeriğine, reklam metnine, prompt'a veya tasarıma sabit yazılmaz. Claude fiyat tahmin etmez, uydurmaz; bilinmeyen fiyat için yer tutucu/kısa kod kullanır.
2. Owner onayı olmayan hiçbir sayı (km ücreti, çarpan, sürşarj, komisyon) canlıya girmez. Taslaklarda "ÖNERİ" etiketi taşır; tarife değişikliği yeni bir tarife sürümü + Owner onayı ister.
3. Shuttle, Private, VIP ve Tur ayrı ürünlerdir; formülleri ve anlamları birleştirilmez.
4. Fiyat sunucuda hesaplanır. İstemciden gelen fiyat kabul edilmez; rezervasyon yalnız geçerli bir quote_id ile oluşur ve sunucu teklifi yeniden doğrular. Fiyatsız talep (quote modu) pending ve fiyatsız açılır; fiyatı yalnız müşterinin seçtiği şoför teklifinden sunucu hesaplar.
5. Fiyat rezervasyon anında (teklif toplanan işte müşteri teklifi seçtiği anda) dondurulur (snapshot): müşteri fiyatı, şoför/araç ödemesi, AGOS payı, üye komisyonu, para birimi, kur ve tarife sürümü. Sonradan tarife veya kur değişse de mevcut rezervasyon yeniden fiyatlanmaz.
6. Para float ile tutulmaz: veritabanında numeric, kodda tam sayı küçük birim (cent/kuruş) veya decimal kütüphanesi. Yuvarlama tek bir fonksiyonda yapılır.
7. Hesaplanamayan fiyat uydurulmaz: Google/kur servisi hatasında teklif "manual_review" olur ve müşteriye WhatsApp/operasyon yolu gösterilir.

## 1. Ürün modelleri

### A) Shuttle — sabit tarife (Alanya Group kendisi satıp işletir)
- Km hesabı yok. Fiyat yolcu sayısına göre tarife tablosundan gelir.
- Son bilinen Owner onaylı lansman tarifesi (Ağu 2026): 1 yolcu 30 €, 2 yolcu 50 €, 3 yolcu 60 €; 4. yolcudan itibaren her ek yolcu +10 € (4 = 70 €, 5 = 80 €). Bu değerleri koda gömme; matrisle karşılaştırma ve test verisi olarak kullan. Hat bazında farklılaşırsa matristen okunur.
- İşletme: saatlik sabit sefer, en az 1 yolcu. Aktif bölgeler: Alanya, Side, Belek, Kemer. GZP pilotu: Alanya merkez ↔ Gazipaşa Havalimanı (Okurcalar, Avsallar, Türkler kapsamda).
- Doğrudan AYT ↔ GZP shuttle ürünü yok; iki bacak olarak kurgulanır (AYT↔Alanya + Alanya↔GZP).
- Land of Legends shuttle ayrı üründür; sözleşme olmadan durağı/saati/fiyatı kesin sayılmaz.

### B) Private / VIP — şoför teklifi + tarife
Owner kararları (30 Eki 2026), uygulama: bids_ledger.sql (agos-pool-finance):
- Kural: şoför kendi fiyatını verir; sistem HER ZAMAN üstüne %30 koyar → müşteri fiyatı = şoför teklifi × 1,30. Oran tek yerde durur: `driver_markup_factor()` (1,30). Koda, n8n'e, arayüze ikinci kez yazılmaz.
- AGOS payı = müşteri fiyatı − şoför teklifi ≈ müşteri fiyatının %23,1'i (1 − 1/1,30). Eski "AGOS minimum payı = müşteri fiyatının %30'u" kuralı GEÇERSİZ; kodda kullanılmaz.
- Teklifler arasından seçimi MÜŞTERİ yapar. Sistem otomatik seçmez.
- İki fiyat modu (`dispatch_jobs.price_mode`):
  - quote — fiyatsız talep (rezervasyon pending, total_price boş): her teklif müşteriye round(teklif × 1,30, 2) olarak gösterilir. Müşteri seçince rezervasyon fiyatı bu değerle dondurulur ve onaylanır.
  - fixed — müşteriye fiyatı önceden verilmiş rezervasyon (ör. B2 tarifesiyle anlık fiyat): müşteri fiyatı DEĞİŞMEZ. Tavan = floor(müşteri fiyatı ÷ 1,30 × 100) / 100 (ör. 80 € → 61,53 €). Tavan üstü teklif `above_cap` olur, müşteriye gösterilmez; şoföre "kabul sınırının üstünde" denir, tavan değeri SÖYLENMEZ (müşteri fiyatını ele verir). Tavan altındaki tekliflerde fark AGOS payına kalır.
- B2 Tarife modu (30 Eki 2026 yönü): açılış ücreti + yol km, araç sınıfı, bölge ve seyahat yönüne göre (AYT→Alanya ile Alanya→AYT farklı olabilir). Bölge dışı / dönüş işi az rotalarda +%60. B2 ile verilen müşteri fiyatı havuzda fixed modun tavanını belirler.
- B1/B2 seçimi (ÖNERİ, Owner onayı bekler): tarife şeridi olan rotada sitede anlık B2 fiyatı (fixed); tarifesi olmayan veya özel taleplerde teklif toplama (quote).

### C) Üye (white-label SaaS) siteleri
- Üye sitelerden gelen shuttle talepleri merkezi onaylı shuttle tarifesiyle Alanya Group operasyonuna gider; üye %20 komisyon kazanır (komisyon tabanı: müşteri fiyatı varsayımı — teyit et).
- Private talepler kaynağı olan üyenindir: kendi aracıyla yapar veya tedarikçi havuzuna açarken araç net ödemesini kendisi belirler. Müşteri fiyatı, araç neti, üye kazancı ve platform ücreti ayrı alanlardır; platform havuz ücreti onaylanmadı.

### D) Tur / aktivite / yat
- Tedarikçi teklifiyle gelir; komisyon kararı yok. ×1,30 kuralı yalnız private/VIP/grup transferleri (şoför havuzu) içindir.

## 2. Tarife modu hesap sırası (B2)
Sıra sabittir ve fiyat dökümünde (breakdown) her adım ayrı satır olur:
1. Adresleri bölgeye eşle: from_zone, to_zone (yönlü).
2. Araç sınıfını seç: yolcu + bagaj kapasitesine sığan sınıf (sedan, suv, vip_vito, sprinter; daha büyük sınıflar eklenince matrise).
3. Taban: tarife şeridi (from_zone, to_zone, sınıf) varsa ondan; yoksa açılış ücreti(from_zone, sınıf) + rota km × km ücreti(sınıf).
4. Bölge dışı / az dönüşlü rota katsayısı (onaylı oran matristen; bilinen yön +%60).
5. Sürşarjlar: her biri ayrı satır (gece, sezon, ek hizmet). Yüzdeli sürşarjlar varsayılan olarak 3-4. adım sonucundaki tabana toplanır, birbirinin üstüne bindirilmez (farklı karar Owner'dan). Ek hizmetler (çocuk koltuğu vb.) adet başı sabit ücret.
6. Asgari ücret kontrolü (matriste tanımlıysa).
7. Yuvarlama (para birimine göre tek kural).
8. Gerekirse kur çevrimi (bk. bölüm 4).
9. Para dağılımı: müşteri fiyatı → şoför/araç ödemesi, AGOS payı, üye komisyonu. Havuza giden işte şoför ödemesi tarifeden değil, seçilen tekliften gelir (fixed modda tavan kontrolüyle).
10. Snapshot: teklif kaydına girdiler, döküm, tarife sürümü, kur ve geçerlilik süresi yazılır.

Çarpan mı, sınıf bazında ücret mi: araç sınıfı farkları ya çarpanla (ör. sedan 1,0 / vip_vito 1,5 / sprinter 2,2 — ÖRNEK, onaysız) ya da sınıf bazında açılış + km ücretiyle ifade edilir; ikisi birlikte kullanılmaz. Öneri: sınıf bazında satırlar (daha şeffaf, şoför maliyetine daha yakın). Hangisi seçilirse seçilsin suv sınıfı da tanımlanmalı.

Zaman kuralları:
- Gece/sezon pencereleri alma saatine göre Europe/Istanbul yerel saatiyle değerlendirilir (Türkiye 2016'dan beri kalıcı UTC+3, yaz saati yok).
- Sınırlar açık tanımlanır (ör. 23:00 dahil, 06:00 hariç).
- Uçuş rötarı almayı gece penceresine kaydırırsa dondurulmuş fiyat değişmez (ÖNERİ).

## 3. Mesafe ve Google entegrasyonu
- Distance Matrix API artık "Legacy". Yeni entegrasyonlar Routes API Compute Route Matrix kullanır (POST https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix, X-Goog-FieldMask başlığıyla yalnız gereken alanlar: originIndex, destinationIndex, distanceMeters, duration, condition).
- Fiyat için kararlı km kullan: trafik duyarlı olmayan rota tercihi; trafik duyarlı süre yalnız varis tahmini içindir ve daha pahalı SKU'dur.
- Kullanım şartları (Service Specific Terms, Haziran 2026 sürümü — güncelini kontrol et): Routes API'den yalnız lat/lng en fazla 30 gün önbelleğe alınabilir; place_id önbelleğe alınabilir; mesafe ve süre için önbellek izni yoktur. Google içeriği Google olmayan haritayla kullanılamaz. Bu yüzden "Google mesafe sonuçlarını cache'leyip maliyeti düşür" yaklaşımı kullanılmaz.

Onun yerine maliyet ve uyum için:
1. Tarife şeritleri: sık rotalar (havalimanı ↔ bölge) için fiyat veya "tarife km'si" işletmenin kendi onayladığı veridir; kaynağı (ör. operasyon ölçümü) ve onay tarihi yazılır. Taleplerin çoğu API çağrısı olmadan fiyatlanır ve aynı rota her zaman aynı fiyatı verir.
2. Adres → bölge: Places Autocomplete (session token ile) → place_id → bölge poligonu. Kalıcı kayıtta bölge ve place_id tutulur; lat/lng 30 günü aşmaz.
3. Tablo dışı rota: teklif anında tek Routes çağrısı. Sonuç teklif/rezervasyon kaydında fiyat gerekçesi olarak tutulacaksa bunun şartlara uygunluğunu teyit et (DOĞRULA).
4. Maliyet koruması: autocomplete'te debounce + session token, teklif başına tek matrix çağrısı, sunucu tarafı anahtar (API + IP kısıtlı), tarayıcı anahtarı referrer kısıtlı, GCP bütçe alarmı ve günlük kota, işletme başına ayrı GCP projesi.
5. Hata yolu: timeout/hata/ZERO_RESULTS → teklif manual_review; fiyat tahmin edilmez.

## 4. Para birimi ve kur
- Tarife baz para birimi tek olur (ÖNERİ: EUR; Owner kararı). Gösterim ve ödeme para birimleri: EUR, USD, GBP, TRY.
- Kur kaynağı ve tazeliği AÇIK KARAR (OD-22). Öneri: resmi günlük kur (TCMB veya ECB), günde 1-2 kez çekilir, tarihli kur tablosunda tutulur.
- Teklifte fx_rate, fx_source, fx_timestamp saklanır; teklifin geçerlilik süresi vardır (ÖNERİ: 30 dk). "Güncel kur" yalnız yeni tekliflere uygulanır.
- Nakit tahsilatın para birimi ve mutabakat toleransı AÇIK KARAR (OD-23).
- Yuvarlama para birimine göre tek fonksiyonda (ÖNERİ: EUR/USD/GBP tam birime yukarı, TRY 10 TL'ye yukarı); yuvarlama farkı dökümde ayrı satır.

## 5. Veri modeli (Supabase / Postgres)
- pricing_zones: id, code, name, geom (PostGIS poligon), region, is_low_return.
- tariff_versions: id, status (draft / approved / archived), effective_from, approved_by, approved_at, note. Canlıda tek bir approved sürüm etkindir.
- tariff_lanes: version_id, product, from_zone, to_zone, vehicle_class, mode (fixed / km), fixed_price, opening_fee, tariff_km, km_rate, currency, source.
- shuttle_fares: version_id, line_id, pax_count, price, currency (veya taban + ek yolcu kuralı).
- surcharge_rules: version_id, code, kind (percent / fixed / per_item), value, applies_to (ürün, sınıf), condition (saat penceresi, sezon tarihleri), stacking.
- fx_rates: currency_pair, rate, source, fetched_at.
- price_quotes: id, input_hash, inputs, breakdown (jsonb satırlar), customer_price, currency, fx snapshot, tariff_version_id, status (quoted / manual_review / expired / used), expires_at.
- reservations: quote_id + değişmez para alanları (customer_price, driver_payout, agos_share, member_commission, currency, fx_rate). total_price yalnız pending/cancelled iken boş olabilir (quote modu; `reservations_price_required` kısıtı). RLS: tarife tablolarını yalnız admin yazar; şoför müşteri fiyatını ve tavanı atamadan önce görmez (nakit işte kazanana tahsilat tutarı gösterilir).
- dispatch_jobs: price_mode (fixed / quote), driver_price_cap (fixed modda), offer_deadline, expires_at (müşteri seçimi son saati). job_offers: driver_price, customer_price, status (active / withdrawn / selected / rejected / above_cap).

## 6. Kod kuralları
- Hesap çekirdeği saf fonksiyondur: calculatePrice(input, tariff) → { lines, total }; I/O yok, deterministik. Google, kur ve veritabanı erişimi ayrı katmanda.
- Aynı girdiler aynı teklifi üretir (input_hash ile idempotent).
- Rezervasyon oluşturma: quote_id var mı, süresi dolmadı mı, kullanılmadı mı, girdiler eşleşiyor mu — tek transaction'da kontrol edilip used yapılır.
- Log'larda kişisel veri yok; quote_id ve bölge kodları yeterli.
- Zorunlu test seti:
  - Shuttle 1-8 yolcu
  - AYT→Alanya ile Alanya→AYT yön farkı
  - Bölge dışı katsayısı
  - Gece sınırları (22:59 / 23:00 / 05:59 / 06:00 İstanbul saati)
  - Sezon başlangıç/bitiş günü
  - Çocuk koltuğu ve kapasite aşımı (sınıf yükseltme)
  - Para birimi yuvarlaması
  - Google hatası → manual_review
  - Süresi dolmuş veya tekrar kullanılan quote
  - Tarife sürümü değişince eski rezervasyonun fiyatının değişmediği
  - ×1,30: quote modunda 45 → 58,50, 50 → 65,00; fixed modda 80 € → tavan 61,53 (61,53 kabul, 61,54 above_cap), müşteri fiyatı 80 kalır
  - Müşteri seçimi sonrası rezervasyon fiyatı ve şoför ödemesi dondurulur; sonraki teklif/tavan değişikliği etkilemez

## 7. Claude'un çalışma biçimi
- Site, reklam veya WhatsApp metni yazarken fiyat yalnız matris kısa kodundan/yer tutucudan gelir; "başlayan fiyatlarla" gibi ifadeler matristeki gerçek değere dayanmalıdır.
- Yeni tarife önerirken: rakip fiyat araştırması (URL + tarih), şoför/araç maliyeti ve katılım marjı, sezon etkisi; çıktı ÖNERİ etiketli tablo + Owner karar listesi.
- Kod değişikliğinde: önce mevcut tarife sürümü ve testler; değişiklik staging'de golden testlerle doğrulanır, sonra Owner GO.
- Çelişen iki kural görürsen birini sessizce seçme; AÇIK KARAR olarak yaz ve sor.
- Eski taslaklarda "müşteri fiyatının en az %30'u", sabit şoför ödemesi veya "AL KOD" görürsen bunlar emekliye ayrılmış kurallardır; 30 Eki 2026 kararını uygula ve belirt.

## 8. Açık kararlar (Ekim 2026 sonu itibarıyla)
KARARLAŞTI (30 Eki 2026): müşteri fiyatı = teklif × 1,30; seçim müşteride; fiyatı belli işte tavan = fiyat ÷ 1,30.
1. Hangi rotada anlık B2 fiyatı (fixed), hangisinde teklif toplama (quote) — yukarıdaki ÖNERİ.
2. ×1,30 sonucunun yuvarlanması: şu an sente (2 hane); tam birime yuvarlama istenirse tek fonksiyonda değişir.
3. Araç sınıfı: çarpan mı, sınıf bazında ücret mi; değerler; suv dahil.
4. Gece, sezon ve ek hizmet sürşarjlarının değerleri ve bindirme kuralı.
5. "Az dönüşlü" bölgelerin listesi ve +%60'ın tam uygulama koşulu.
6. Baz para birimi, kur kaynağı/tazeliği (OD-22), nakit toleransı (OD-23).
7. KDV/vergi tabanı.
8. Üye %20 komisyonunun tabanı.
9. Yuvarlama kuralları, asgari ücret, teklif geçerlilik süresi.
10. Google mesafesinin teklif kaydında saklanmasının şartlara uygunluğu.
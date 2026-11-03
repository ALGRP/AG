# K15 · Supplier collection + weekly settlement — QA ve karar raporu

**Tarih:** 03.11.2026 · **Durum:** LOCAL_ONLY. Canlı ödeme, banka transferi, otomatik borç tahsilatı ve gerçek müşteri verisi yok. Canlıya geçiş Owner GO ister.

**İnceleme türü:** Kodu yazan oturumdan bağımsız bir yapay zekâ ajanı inceledi. Ajan kod yazmadı, yalnız okudu ve kırmaya çalıştı.
- Bu inceleme **insan bağımsız kabulünün yerine geçmez.** Linear kuralı "yazan kendi işini kabul edemez" geçerlidir.
- Fatura, vergi, yasal taşıma/acentacılık yetkisi ve tahsilatın hukuki sorumlusu mali müşavir ve hukuk incelemesine tabidir.

## 1. Kapsam

| Teslim (Owner listesi) | Nerede | Durum |
| -- | -- | -- |
| Yerel veritabanı modeli | `packages/db/migrations/0001_network_core.sql` | Postgres 16'da uygulandı; kurallar tek tek denendi (§4) |
| Hesaplama testleri | `packages/core/src/settlement.test.ts`, `apps/api/src/api.test.ts` | 76/76 test geçiyor |
| Örnek haftalık rapor | `docs/ornek-hafta-2026-W45.html` (+ `.json`) | Sentetik; `npm run report:sample` ile yeniden üretilir |
| Haftalık tedarikçi hesap ekstresi | Rapor §1 | Var |
| Site komisyon alacakları raporu | Rapor §2 | Var (shuttle %20 ve private/VIP satış farkı ayrı etiketli) |
| AGOS sistem payları raporu | Rapor §3 | Var |
| Ödeme ve dekont eşleştirme ekranı | Rapor §4 + `POST /v1/admin/receipts`, `GET /v1/admin/settlements/:week` | **Rapor görünümü ve API var. Etkileşimli panel ekranı yok** (yönetim paneli, kimlik + 2FA kararından sonra; SEL-332) |
| Borç ve ihtilaf takip listesi | Rapor §5 | Var |
| İptal/iade düzeltme testleri | `settlement.test.ts`, `api.test.ts` | Var |
| Bağımsız QA ve karar raporu | Bu belge | — |

## 2. Kural bazında sonuç (düzeltmelerden sonra)

| Kural | Sonuç | Nasıl sağlanıyor |
| -- | -- | -- |
| Fiyat 30/50/60/70, 5+ manuel | GEÇTİ | Tarife yalnız 1–4 kişiyi taşır. 5+ fiyatsız alınır; fiyat onaylanmadan hak ediş gösterilmez |
| %20 / %10 / %70, alanyagroup.com dahil | GEÇTİ | `SHUTTLE_SPLIT_V1`; DB tetikleyicisi payları `split_policy` tablosundan doğrular |
| Kendi aracı %90 / %10, kendine komisyon yok | GEÇTİ | Kod ve DB; yalnız yetkisi doğrulanmış site (kod ve DB) |
| Hesap dönemi ve son tarih | GEÇTİ | ISO hafta, Pzt 00:00 – Paz 23:59 İstanbul, Salı 18:00. Sınırlar testli; 53. hafta dahil |
| Owner alan listesi (20 alan) | GEÇTİ | `SettlementLine` ve `booking` tablosu |
| 1 · Tek kaynak | GEÇTİ | Kod sabiti + SQL seed testi + DB tetikleyicisi. İade düzeltmesi de aynı politikayı kullanır |
| 2 · Tahsilatı tedarikçi yapar | GEÇTİ | Kod + DB CHECK |
| 3 · Site ve AGOS alacakları ayrı | GEÇTİ | Ayrı borç kalemleri; private/VIP satış farkı ayrı tür |
| 4 · Tahsil edilmiş + tamamlanmış işler | GEÇTİ | Hesaba girme anı = max(tamamlanma, tahsilat). Geç gelen tahsilat sonraki kapanışa devreder |
| 5 · İstisna listesi | GEÇTİ | İptal, iade, kısmi iade, eksik/yok tahsilat, kayıt yok, itiraz, mükerrer şüphesi. Açık olanlar çözülene kadar her hafta listede kalır. İtiraz sonucu ve mükerrer incelemesi için uçlar var |
| 6 · Dekont eşleştirme | GEÇTİ | Hafta + ödeyen + alacaklı + para birimi. Aynı dekont iki kez girilemez. Eşleşmeyen dekont listelenir |
| 7 · Eksik ve geciken ödeme | GEÇTİ | Ödenmemiş, kısmi, son tarihten sonra ödenmiş, fazla ödeme, iade sonrası geri ödenecek |
| 8 · Eski hafta silinmez, düzeltme hareketi | GEÇTİ | Kapanış anlık görüntüsü değişmez. Düzeltme yeni haftaya kümülatif yazılır. DB: silme, TRUNCATE ve donmuş alanlarda değişiklik engelli |
| 9 · İkinci komisyon / ikinci tahsilat yok | GEÇTİ | Tek tahsilat kaydı (kod + DB). İş tek haftaya girer. İade referansı tekil |
| 10 · SaaS ayrı | GEÇTİ | Ayrı tablolar. Abonelik dekontları (`purpose: subscription`) komisyonlarla eşleştirilmez |
| Private/VIP | GEÇTİ | Hak edişi site belirler; AGOS 0 (kod + DB); kendi aracı / pass. Havuz bu sürümde yok |
| Canlı ödeme yok | GEÇTİ | `payout_execution` sabit (kod + DB CHECK). Para gönderen kod yok |

## 3. QA bulguları ve yapılanlar

| # | Önem | Bulgu | Düzeltme | Test |
| -- | -- | -- | -- | -- |
| 1 | YÜKSEK | Hafta kapandıktan sonra girilen tahsilat hiçbir haftada hesaplanmıyordu | Hesaba girme anı = max(tamamlanma, tahsilat); hesaplanmamış uygun işler sonraki kapanışa devreder; haftalar sırayla kapanır | core + API |
| 2 | YÜKSEK | Mükerrer işaretli ama gerçekten yapılmış ve ödenmiş iş kayboluyordu | Mükerrer şüphesi artık istisna listesinde; inceleme sonrası `clear-duplicate` ile hesaba girer | core + API |
| 3 | ORTA-YÜKSEK | Kapanış öncesi kısmi iade işi tamamen düşürüyordu | Açık istisna `partially_refunded`; çözülene kadar her hafta görünür | core |
| 4 | ORTA | Seferde fiyatı onaylanmamış iş varken sefer tamamlanınca o iş bir daha tamamlanamıyordu | Bekleyen iş varsa sefer `assigned` kalır; hazır olunca aynı uçla tamamlanır | API |
| 5 | ORTA | Son tarihten sonra yapılan ödeme raporlanmıyordu | `paid_late` + "Geç ödendi" satırı | core |
| 6 | ORTA | İade sonrası tedarikçiye geri ödenecek tutar görünmüyordu | `credit_due` durumu, borç listesinde satır, ekstrede "geri alacağı" | core |
| 7 | ORTA-DÜŞÜK | Kısmi iadelerde yuvarlama birikiyordu; iade tekrar gönderilince iki kez yazılıyordu; düzeltme referansı tekil değildi | Kümülatif hesap (negatif yuvarlama farkı dahil); `refundReference` zorunlu ve tekil; referans `ADJ-<kod>-<hafta>-<sıra>` | core (5000 × 1 cent dahil) + API |
| 8 | ORTA-DÜŞÜK | Veritabanı boşlukları: doğrulanmamış kendi aracı, 0/0/5000 pay, NULL ile CHECK atlatma, hesaplanmış işte alan değişikliği, hatalı hafta biçimi, tekrar düzeltme, TRUNCATE | Tetikleyici (politika + yetki + dondurma), CHECK'ler, UNIQUE, TRUNCATE engeli, `booking_refund` tablosu | Postgres'te tek tek denendi |
| 9 | DÜŞÜK | Ekstrede bir alacaklıya fazla ödeme başka alacaklının borcunu kapatıyordu; AGOS "alınan" fazla ödemeyi içeriyordu | Alacaklı bazında kalan; fazla ödeme ayrı; "alınan" borçla sınırlı | core |
| 10 | DÜŞÜK | Tedarikçi kimliği büyük/küçük harf farkıyla kendi aracı kontrolünü atlatabiliyordu | Kimlikler yalnız küçük harf | API |
| — | Veri | İtiraz notuna kişisel veri yazılabiliyordu | E-posta ve telefon numarası maskelenir (kod); DB e-posta içeren notu reddeder | API + DB |
| — | Küçük | Gövdesiz POST (`/close`, `/complete`) 415 dönüyordu | Gövdesiz POST boş nesne sayılır | API |
| — | Etiket | Private/VIP satış farkı "Site komisyonu" yazıyordu | Ayrı tür: "Site satış farkı (private/VIP)" | core |

## 4. Veritabanında denenen kurallar (Postgres 16)

Aşağıdaki işlemlerin hepsi veritabanı tarafından reddedildi:
- Doğrulanmamış sitenin kendi aracıyla tedarikçi olması
- Politikaya aykırı pay dağılımı (0/0/5000)
- NULL site payıyla hak ediş girmek
- Shuttle tahsilatını sitenin yapması
- Private işte AGOS payı
- Kendi aracında kendine komisyon
- İkinci tahsilat kaydı
- Hesaplanmış işi başka haftaya taşımak
- Hesaplanmış işin tutar, tamamlanma zamanı veya satış tarafını değiştirmek
- İadeyi azaltmak
- Rezervasyon silmek
- Kapanmış haftayı değiştirmek
- TRUNCATE
- Aynı dekontu iki kez girmek
- Aynı iade referansını iki kez girmek
- Düzeltmeyi aynı ya da eski haftaya yazmak
- Hatalı hafta kimliği
- Aynı düzeltmeyi iki kez yazmak
- Ödeme gönderimini açmak
- İtiraz notunda e-posta

## 5. Bilerek açık bırakılanlar (karar gerekiyor)

| Konu | Neden açık |
| -- | -- |
| 5+ kişi fiyat onayı | Onaylanabilecek tutara alt/üst sınır yok (QA: 1 cent onaylanabiliyor). Onaylayanın kimliği kaydedilmiyor: yönetim girişi (IdP + 2FA, SEL-332) gelmeden kimlik yok |
| Denetim izi | Fiyat onayı, dekont, kapanış ve iade işlemlerini kimin yaptığı kaydedilmiyor (aynı neden). Admin erişimi geçici tek anahtar |
| Fazla ödeme ve iade geri ödemesi | İade mi edilecek, sonraki haftaya mahsup mu? (K20, K21) |
| Eksik tahsilat | Komisyon tam satış üzerinden mi, tahsil edilen üzerinden mi? (K22) |
| Kapanmış haftaya itiraz | Süreç ve süre sınırı (K23) |
| Private/VIP iadesi (kapanmış iş) | Hak edişi site belirlediği için otomatik bölünmüyor; elle düzeltme olayı oluşuyor |
| Tedarikçi kaydı | Tedarikçi listesi ve belgeleri yok; kimlik serbest metin. Tedarikçi kaydı ayrı iş (SEL-192) |
| Ödeme ve dekont ekranı | Yalnız rapor görünümü. Etkileşimli eşleştirme ekranı yönetim paneliyle gelecek |
| Kalıcı depo | Çalışan sunucu bellek deposu kullanıyor; şema adayı CRS'e eşlenmeden (G1, SEL-331) gerçek veri yok |

## 6. Karar önerisi

**Öneri: yerel kabul uygun; canlı için değil.** Owner K15 kurallarının hepsi yerelde testlerle ve veritabanı kurallarıyla sağlanıyor; QA'nın bulduğu 10 hatanın hepsi düzeltildi ve teste bağlandı.

Canlıya geçmeden önce gerekenler:
1. İnsan bağımsız kabulü (farklı kimlik)
2. Mali müşavir ve hukuk görüşü (tahsilatın hukuki sorumlusu, fatura, vergi, taşıma/acentacılık yetkisi)
3. Yönetim girişi ve 2FA (SEL-332), işlem yapan kimliğin kaydı
4. CRS eşlemesi (G1)
5. §5'teki açık kararlar
6. Owner GO

# H · Açık Owner kararları ve önerilerim

Sıra önceliğe göre. İlk yedisi Faz 2'ye geçmeden gerekiyor. "Önerim" sütunu Claude'un görüşüdür; karar Owner'ındır.

| # | Karar | Neden şimdi | Önerim |
| -- | -- | -- | -- |
| **H-1** | Bağımsız inceleyici kim olacak (insan; güvenlik + finans), kapsamı ve bütçesi ne? | Atanmış kişi yok (SEL-326). Hiçbir iş kabul edilemiyor; kritik yol burada tıkalı. | Bir kişi veya firma ata. AI saldırgan incelemeleri bu kişinin girdisi olsun, yerine geçmesin. |
| **H-2** | AI kimlikleri ayrılsın mı, Owner kararı nasıl doğrulansın? | Linear'da herkes "ALANYA GROUP", GitHub'da herkes "ALGRP". "OWNER KARARI" metni doğrulanamıyor (C §4 R1). | Her AI ayrı kimlik veya imza satırıyla yazsın. Owner kararı yalnız Owner hesabından ya da doğrudan oturum teyidiyle geçerli olsun ve karar kimliği alsın (ör. `2026-11-03/K15`). |
| **H-3** | Kanonik karar kaydı neresi? | Linear indeksi ve repo çelişki tablosu ayrışabilir. | Linear resmî kayıt. Repo yalnız kodun uyguladığı kuralları karar kimliğiyle taşısın; testler sabitleri bu kimliklerle doğrulasın. |
| **H-4** | Kanonik kod hangisi: PR #9 TypeScript `@ag/core` mi, SEL-456 saf JS MVP mi? | Fiyat ve pay mantığı iki ayrı kodda; tek fiyat kaynağı ilkesi riskte. | **V2 devir:** iki ayrı hesap motoru bırakılmaz; tek yetkili finans skill'i PR #9 ile uyumlu `agos-consortium-settlement`. Önerim: `@ag/core` kanonik aday (bağımsız QA şartıyla); SEL-456'nın tenant atfı ve onboarding mantığı ona test ve şartname olarak taşınsın. Owner teyidi bekleniyor. |
| **H-5** | Kod sahipliği bundan sonra kimde? | PR #9'u Claude yazdı; yeni dağılımda kod Codex'in. | Codex. Claude şartname, kabul senaryosu ve akran incelemesi yapsın. PR #9'un akran incelemesi Codex'te. |
| **H-6** | Skill'lerin kanonik kaynağı ve ajanlara dağıtımı nasıl olacak? | Mac (38), org senkronu (6), Codex ve Hermes kopyaları ayrışabilir. | Repo `skills/` tek kaynak; claude.ai org skill'i, Mac kurulumu ve Codex paketi buradan SHA ile üretilsin. |
| **H-7** | SEL-456 zip'i ve Mac envanteri teslim edilsin mi? | Üç yönlü birleştirme bu iki girdi olmadan yapılamaz. | Zip'i repo'ya (veya Linear ekine) koy. Mac'te `tools/skill-inventory.mjs` çalıştır, çıktıyı paylaş. |
| **H-8** | B2B kanalında 5 kişi 80 € ve %10–15 komisyon, konsorsiyumla nasıl ilişkilenecek? | "Tek fiyat kaynağı" kuralıyla çelişiyor (A §5). Aynı partner iki rolde olabilir. | 5+ kuralı tüm kanallarda aynı olsun; kanal farkı yalnız komisyon tablosunda dursun. Aynı partnerde konsorsiyum kuralı öncelikli olsun. |
| **H-9** | K17: hat bazında 5+ min/max fiyatlar | Sınır yokken 5+ fiyat hiçbir hatta onaylanamıyor. | Önce yalnız pilot hatları için tablo ver. |
| **H-10** | K8: hat kapsamı, bölge sınırları, geçerlilik tarihi, ilk açılacak hatlar | Uydu pilotu ve fiyat yayını buna bağlı. | AYT↔Alanya ile başla; GZP↔Alanya pilot olarak kalsın. |
| **H-11** | Private/VIP kısmi tahsilatta orantılı bölme | Yerel aday kural olarak duruyor. | Mali müşavirle teyit et; sözleşmeye yaz. |
| **H-12** | Sistemin iş kullanıcıları ve rolleri (admin, finans yöneticisi, operatör); tedarikçi girişinde 2FA | Kapanış, itiraz ve mahsup kimin elinde olacak belli değil. SEL-332'de tedarikçi 2FA'sı açık. | Kişi listesi çıkar; tedarikçiye de 2FA. Bugün yerelde 2FA'sız yapılabilen kapanış, iade ve dekont girişleri staging'den önce 2FA'ya bağlansın. |
| **H-13** | Reklam bağlantı modeli ve ilk platform | MCC ve Meta yetki modeli sorumluluk ve erişim doğurur. | Partnerin kendi hesabı, kullanıcı düzeyinde salt okunur erişim, önce Google; MCC ve Meta hukuk incelemesinden sonra. |
| **H-14** | Skill değerlendirme koşumları için bütçe | Koşumlar gerçek ve ücretli. | Önce fiyat skill'inin taban ölçümü (5 senaryo × 3 koşu); sonucu görünce genişlet. |
| **H-15** | KVKK ve rıza yaklaşımı (uydu sitelerde ölçüm) | Reklam ölçümü kişisel veri işler. | Rıza yönetimi zorunlu; rıza yoksa yalnız anonim ölçüm; hukuk onayı. |
| **H-16** | Mali müşavir ve hukuk soru listesi | Canlıya geçiş koşulu 2. | (1) Kim kime fatura keser (site komisyonu, AGOS payı, tedarikçi bedeli)? (2) KDV ve stopaj nasıl? (3) Tahsilatın hukuki sorumlusu kim? (4) Partner sitelerin transfer satış yetkisi nasıl kurulur (TÜRSAB / acentelik)? (5) Reklam ölçümünde KVKK rolleri ne? |
| **H-17** | Konsorsiyum işi Hermes'ten dağıtılsın mı? | SEL-324/326 G0 HOLD sürüyor. | Hayır; kabul gelene kadar elle devir. |
| **H-18** | İlk pilotun kapsamı | Reklam otomasyonu kritik yolu uzatıyor. | İlk pilot: uydu site + rezervasyon + haftalık kapanış. Reklamı partner kendi hesabında yürütür, biz yalnız ölçeriz. |
| **H-19** | Aynı hafta içinde bir iade düzeltmesiyle yeni bir komisyonun tek kalemde netleşmesi "mahsup" sayılır mı? | Bağımsız okuma F6. T1: mahsup yalnız yazılı onayla. | **V2 devir ile yanıtlandı:** yazılı mahsup onayı olmadan netleşmez (D-F03). Uygulandı (4b305b7); karar kaydı Linear'a işlenmeli. |
| **H-20** | "7 takvim günü" nasıl sayılır: tam 168 saat mi, 7. günün sonuna kadar mı? | Bugünkü kod 168 saat sayıyor. 7. gün akşam açılan itiraz "süre dışı" etiketi alıyor (otomatik ret yok). | İletimden sonraki 7. günün sonu, 23:59 İstanbul. |
| **H-21** | Müşteri itirazı "haklı" bulunursa mali etkisi ne olur? | Bugün "haklı" ve "haksız" sonuç aynı hesaplanıyor (F10). | Haklı itiraz iade veya düzeltme kaydıyla işlensin; komisyon net tahsilattan (T2) yeniden hesaplansın. Karar tek başına komisyonu serbest bırakmasın. |
| **H-22** | 5+ kişi manuel fiyatın alt sınırı 4 kişilik 70 €'nun altına inebilir mi? | Bugün 0,01 € gibi bir alt sınır onaylanabiliyor (A12.6). | Hayır. 5+ alt sınırı ≥ 70 € olsun; sınır tablosu buna göre doğrulansın. |
| **H-23** | Küsurat dağıtım politikası: kalan kuruşlar kime ve nasıl yazılır? | V2 devir D-F02. Bugün kümülatif AGOS payı her zaman ≥ tam %10. Ama tek haftanın küçük farkında AGOS eksiye düşebilir: 49,99 € sonrası son 1 kuruşta AGOS −1, site +1, tedarikçi +1. Algoritma karar gelmeden değiştirilmez (test `todo`). | **(a)** Bugünkü kural kalsın: kümülatif hesap, rezervasyon toplamında kayma yok, kalan AGOS'a; tek haftanın eksi kuruşu kabul edilir ve ekstrede açıklanır. **(b)** Her tahsilat kendi içinde bölünsün: hiçbir hafta eksi olmaz, ama rezervasyon toplamında 1–2 kuruşluk kayma olabilir. Önerim (a); en basit ve toplamlar kesin. |

## Bu aşamada değişmeyenler

- PR #9 merge edilmez.
- Gerçek reklam hesabı açılmaz, harcama başlatılmaz.
- Canlı CRS ve müşteri verisi, canlı ödeme ve banka transferi değişmez.
- SEL-324/326 kapıları korunur. Canlıya geçiş ayrı Owner LIVE GO ister.

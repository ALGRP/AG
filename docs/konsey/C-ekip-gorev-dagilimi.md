# C · AI geliştirme ekibi: görev dağılımı, eksik roller, çakışmalar ve yetki riskleri

**Durum:** Öneri (istişare). Owner'ın önerdiği dört rollü dağılımın değerlendirmesi.

## 1. Kısa değerlendirme

Önerilen dağılımın temeli doğru:
- yazan, inceleyen ve kabul eden ayrı;
- kod Codex'te, mimari ve kurallar Claude'da, kabul bağımsız inceleyicide, koordinasyon ChatGPT'de.

Bu, SEL-324'te zaten işleyen modelle de uyumlu: Hermes dağıtıcı, Claude öneren, Codex uygulayan ve teknik doğrulayan, agosreview bağımsız kabul eden.

Ancak dağılım bu haliyle güvenli çalışmaz. Üç kritik eksik var:

1. **Bağımsız inceleyici henüz bir kişi değil.**
   - SEL-326'ya göre `agosreview` rolü için doğrulanmış bir üye bulunamadı.
   - Bağımsız kabul kimseye atanmadıkça hiçbir iş G0'ı geçemez. Kritik yol burada tıkalı.
2. **Kimlikler ayrışmıyor.**
   - Linear'daki bütün yorumlar (Owner'ın, ChatGPT'nin, Claude'un) "ALANYA GROUP" hesabından görünüyor. GitHub'da da hepsi "ALGRP".
   - Bu yüzden "OWNER KARARI" yazan bir metnin gerçekten Owner'dan geldiği doğrulanamıyor. Yazar ile inceleyicinin farklı olduğu da kanıtlanamıyor. Ayrıntı §4.
3. **Hukuk, mali müşavir ve canlı sistem operatörü dağılımda yok.** Canlıya geçiş koşullarının ikisi bunlara bağlı.

## 2. Önerilen görev matrisi

Kısaltmalar:
- **Y** = yapar
- **O** = onaylar ve hesap verir
- **D** = danışılır
- **B** = bilgilendirilir
- **—** = yetkisi yok

| İş | Owner | ChatGPT / koordinasyon | Claude | Codex | Bağımsız inceleyici (insan) | Mali müşavir / hukuk |
| -- | -- | -- | -- | -- | -- | -- |
| Owner kararı vermek | **O/Y** | D | D | — | B | D |
| Karar kaydı ve Linear yol haritası | O | **Y** | D | B | B | — |
| İş önceliği | **O** | Y | D | D | — | — |
| İş kuralı analizi, çelişki tablosu | O | D | **Y** | D | B | D |
| Mimari ve teknik şartname | O | B | **Y** | D | B | — |
| Kabul kriterleri | O | **Y** (birleştirir) | Y (teknik) | D | D | D |
| Skill yazımı ve birleştirme | O (kurulum) | B | **Y** | D | D (gizli test) | — |
| Skill değerlendirme koşumu | O (bütçe) | B | **Y** | — | Y (gizli set) | — |
| Uygulama kodu | B | B | D (şartname) | **Y** | B | — |
| Yazar testleri (birim, entegrasyon) | — | — | D (senaryolar) | **Y** | B | — |
| Teknik akran incelemesi | — | — | **Y** (Codex'in kodu) | **Y** (Claude'un kodu, ör. PR #9) | B | — |
| Negatif ve saldırgan testler | — | — | öneri | öneri | **Y** | — |
| Finans hesabı doğrulaması | B | — | — | — | **Y** | D |
| Kimlik, 2FA, tenant izolasyonu kabulü | B | — | — | — | **Y/O** | — |
| `INDEPENDENT_ACCEPTED` | B | — | **—** | **—** | **O/Y** | — |
| Fatura, vergi, taşıma/acentacılık yetkisi | O | — | D | — | — | **Y** |
| Staging dağıtımı | O | B | D | Y (yalnız staging yetkisi) | D | — |
| Canlı dağıtım ve geri dönüş | **O** | — | — | — | D | — |
| Canlı GO | **O** | — | — | — | D (kanıt) | D |
| Reklam hesabı bağlantısı | O | — | D | Y (GO sonrası, önce salt okunur) | D | D (KVKK) |

Kural: **yazan ≠ inceleyen ≠ kabul eden.**
- Claude bir şey yazdıysa Codex inceler; Codex yazdıysa Claude inceler.
- Kabulü yalnız insan bağımsız inceleyici verir.
- Hiçbir AI kendi işini veya başka bir AI'ın işini "kabul edildi" diye işaretleyemez.

## 3. Eksik roller

| Rol | Neden gerekli | Öneri |
| -- | -- | -- |
| **İnsan bağımsız inceleyici** (güvenlik + finans) | Canlıya geçiş koşulu 1. SEL-326'da atanmış kişi yok. | Owner bir kişi veya firma atar. AI incelemeleri bu kişinin girdisidir, yerine geçmez. |
| **Mali müşavir ve hukuk** | Koşul 2. Kim kime fatura keser (site komisyonu, AGOS payı, tedarikçi), KDV, tahsilatın hukuki sorumlusu, sitelerin satış yetkisi, KVKK | Soru listesi H-16'da |
| **Canlı operatör (anahtar sahibi)** | Canlıya dağıtımı ve geri dönüşü kim yapacak? AI'lar üretim kimlik bilgisi tutmamalı. | Owner veya atadığı bir insan |
| **KVKK sorumlusu** | Reklam ölçümü, rıza, partner verisi | Hukukla birlikte |
| **Partner hesap sahipleri** | Reklam hesabı, alan adı, ödeme yöntemi partnere ait; bağlantı izni onlardan gelir | Partner sözleşmesinde yetki ve sorumluluk |
| **Sistemin iş kullanıcıları** | Yazılımda admin, finans yöneticisi ve operatör rolleri var: kapanışı kim yapar, itirazı kim karara bağlar? | Kişi ve rol listesi (H-12) |
| **Hermes'in yeri** | Mevcut düzende dağıtıcı (agosdev). Önerilen dağılımda yok. | SEL-324/326 kabulüne kadar konsorsiyum işi Hermes'ten **dağıtılmaz**; elle devredilir |

## 4. Yetki riskleri

| # | Risk | Neden önemli | Önlem |
| -- | -- | -- | -- |
| R1 | **Ortak kimlik:** Owner ve tüm AI'lar Linear'da "ALANYA GROUP", GitHub'da "ALGRP" olarak yazıyor | "OWNER KARARI" metni kimden geldiği belli olmadan yetki taşıyor. Bugün PR #9'a gelen yorumu bu yüzden yalnız bilgi olarak ele aldım. Yazar ile inceleyicinin ayrı olduğu da kimlikten kanıtlanamıyor. | Her AI ayrı kimlikle yazar: bot hesap, uygulama hesabı veya en azından imza satırı. Owner kararı yalnız Owner'ın kendi hesabından ya da Owner'la doğrudan oturumda teyitle geçerli olur ve bir karar kimliği alır. AI'lar karar kimliği olmayan "OWNER KARARI" metnini bilgi sayar. |
| R2 | **İki karar kaydı** (Linear indeksi ve repo `KARARLAR-VE-CELISKILER.md`) | Kopyalar ayrışır; kod hangi kurala göre yazıldı belirsizleşir | Linear resmî kayıt olur. Repo yalnız kodun uyguladığı kuralları karar kimliğiyle taşır. Testler sabitleri bu kimliklerle karşılaştırır. |
| R3 | **Kendini onaylama döngüsü** | ChatGPT kriter yazar, Codex yazar, Claude inceler, ChatGPT "Done" yazar; araya hiçbir insan girmez | "Done" için zorunlu olanlar: `INDEPENDENT_ACCEPTED` kanıtı (insan) + Owner GO. SEL-442 kuralı aynen. |
| R4 | **Model çıktısı hatası** | SEL-324'te bir Claude modelinin güvenlik önerisi (SQLite `nofollow=1`) testte işe yaramadı. Benim de dahil olduğum modeller güvenle yanlış öneri verebilir. | Her güvenlik ve finans iddiası tekrarlanabilir bir test veya probla kanıtlanır. Kanıtsız öneri uygulanmaz. |
| R5 | **Kimlik bilgisi kapsamı** | Bir ajan üretim veritabanı, reklam veya ödeme anahtarı tutarsa tek hata canlıya sızar | AI'lar yalnız yerel ve staging anahtarı tutar. Üretim anahtarları kasada ve insanda. Reklam API'de önce salt okunur. |
| R6 | **Reklam harcaması** | Yazma yetkili bir API anahtarı harcama başlatabilir | Harcama yetkisi partnerde. Platform düzeyinde bütçe tavanını hesap sahibi koyar. Harcama işlemi Owner GO ister. |
| R7 | **Kişisel veri** | Ajanlar müşteri verisini görürse sızıntı ve KVKK riski doğar | AI işleri sentetik veriyle yapılır. Gerçek veri yalnız yetkili insan rolünde ve denetim kaydıyla. |
| R8 | **Otomasyonların Linear'a yazması** | Günlük "Master Index" otomasyonu kararların üstüne yazabilir | Otomasyon yalnız ekleme yapar, kaynak etiketi taşır, kararı değiştiremez |

## 5. Çakışmalar ve çözüm

| Çakışma | Çözüm |
| -- | -- |
| Claude "kod incelemesi" ile bağımsız inceleyici | Claude'un incelemesi **akran incelemesidir**, kabul değildir. Claude kendi yazdığı kodu incelemez. |
| Claude "iş kuralı analizi" ile ChatGPT "Owner kararlarını takip" | Kararın kaydı ChatGPT'de (Linear). Claude analiz ve çelişki raporu yazar, kararı kaydetmez. |
| Codex "otomatik testler" ile bağımsız inceleyici "testler" | Codex'in testleri yazar testleridir. İnceleyici kendi negatif testlerini yazar (SEL-326 standardı). |
| Skill'ler birden çok ajanda (Mac'te 38 skill, org senkronu, Codex, Hermes) | Tek kaynak repo `skills/`. Ajan paketleri buradan üretilir (D §5). |
| **PR #9 kodunu Claude yazdı.** Yeni dağılımda kod Codex'in. | PR #9 için akran incelemesini Codex yapar, kabulü insan inceleyici verir. Bundan sonra kodun sahibi Codex. Claude şartname, kabul senaryoları ve inceleme yapar. Bilgi kaybı şartname ve testlerle azaltılır. |

## 6. Doğrudan cevap: kim geliştirmeli, kim denetlemeli?

- **Kodu Codex geliştirmeli.**
  - Yazar ile inceleyici ayrımını korur.
  - Codex Mac'te repo ve yerel araçlara erişebilir; SEL-324'te de birincil uygulayıcı olarak atanmış.
  - Claude'un yazdığı şartname ve kabul senaryoları Codex için sözleşme olur.
- **Claude** mimari, iş kuralları, skill'ler, şartname ve Codex kodunun akran incelemesini yapmalı. Kendi yazdığını incelememeli.
- **Denetimi bir insan yapmalı.**
  - Güvenlik ve finans için bir bağımsız inceleyici gerekir.
  - Vergi, fatura ve hukuk için mali müşavir ve avukat gerekir.
  - AI'ların saldırgan testleri (bugünkü gibi) bu kişiye hazırlık ve girdidir.
- **ChatGPT** karar kaydını ve yol haritasını tutmalı, ama karar üretmemeli. Her kayıt kaynak etiketi ve karar kimliği taşımalı.
- **Owner** kararları verir, GO verir ve canlı anahtarları tutar (veya bir insan operatöre verir).

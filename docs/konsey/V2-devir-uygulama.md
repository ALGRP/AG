# AGOS Skills V2 devri: uygulama raporu

**Tarih:** 03.11.2026
**Kaynak:** Owner'ın bu oturuma yüklediği "Claude'a devir — AGOS Skills V2" belgesi.
**Durum:**
- `LOCAL_ONLY · DRAFT · REVIEW`
- `INDEPENDENT_ACCEPTED=NO` · `LIVE_CHANGED=NO`
- PR merge yok. Üretim CRS'ine yazma, banka transferi, reklam hesabı, kampanya, gerçek dönüşüm gönderimi, aktif skill kurulumu ve servis yeniden başlatma yok.

## 1. Kaynak sabitleme

| | Commit |
| -- | -- |
| Devirde incelenen | `96ebf0a86804727f16b1e747ac402a154ebf2b79` |
| Önceki sürüm | `c0b3175313082589449fd497d3fa572b3c7acc36` |
| Bu çalışmadan önceki HEAD | `f9cbb6ef3a7455bb34dde0849bf95a3f407df57d`. Arada `7b27751` ve `f9cbb6e` var; ikisi de yalnız belge, test ve araç ekliyor, uygulama kodu aynı. |
| Kırmızı testler | `e866a3c11c0674c074000d6e024361bd5728f079` |
| En küçük düzeltme | `4b305b79824445e91ec3c2d8d552e66ae93bedcf` |

**`96ebf0a` → `4b305b7` arasında değişen uygulama dosyaları:**
- `packages/core/src/settlement.ts`
- `packages/core/src/booking.ts`
- `apps/api/src/service.ts`
- `apps/api/src/report-html.ts`
- `packages/db/migrations/0001_network_core.sql`
- Yeni testler: `packages/core/src/settlement.regression.test.ts`, `apps/api/src/policy-freeze.test.ts`

**Eski kabul taşınmaz.** `96ebf0a` ve `c0b3175` için verilmiş bir kabul zaten yok. `4b305b7`'deki uygulama değişiklikleri yeniden incelenmelidir.

**Bu oturuma gelmeyenler:**
- Mac'teki 12 skill'in hash envanteri
- V1 ZIP doğrulaması (`evidence/`)

Bu yüzden kurulu sürüm hash'leri bu oturumda uzlaştırılamadı. Bu oturumun görebildiği 6 org skill'inin hash'leri: [A](./A-skill-envanteri-ve-celiskiler.md).

## 2. Karar çelişkilerinin birleştirilmesi

- T1/T2/T3 ve K17 kontrol mekanizması **yalnız yerel QA için** onaylı; canlı kabul değildir.
- **Açık kalanlar:**
  - K8 hat kapsamları ve tarihleri
  - K17 sayısal fiyat sınırları
  - Private/VIP orantılı tahsilat sözleşmesi
  - küsurat dağıtım politikası (**H-23**, yeni)

**Eski kurallar silinmedi;** konsorsiyum kapsamından ayrıldı. Önerilen politika kimlikleri (Owner teyidi gerekir):

| Politika kimliği | Kural | Geçerli olduğu yer | Konsorsiyumda |
| -- | -- | -- | -- |
| `legacy-shuttle-tariff-2026-08` | 5 kişi 80 €, +10 €/kişi | Ağustos 2026 lansman tarifesi | Geçersiz (K17) |
| `b2b-distributor-2026-11-02` | %10–15; 1–5 kişi 30/50/60/70/80 € | Dış B2B kanalı (SEL-88, SEL-197) | Uygulanmaz; 5 kişi 80 € çelişkisi açık (H-8) |
| `pool-offer-markup-1.30` | Şoför teklifi × 1,30 | AG'nin kendi private/VIP havuz ürünü | Shuttle'a uygulanmaz |
| `pool-ledger-auto-netting-legacy` | Otomatik mahsup | AG'nin kendi havuz cari hesabı | Yok; yazılı onay + 2FA |
| `central-card-collection-legacy` | Kart tahsilatının merkeze yazılması | Eski merkezî tahsilat önerisi | Yok; tahsilatı tedarikçi yapar |

**Finans skill'i:**
- Tek yetkili finans skill'i **`agos-consortium-settlement`**. `agos-weekly-settlement` (SEL-456 adayı) ona yönlenir ve ayrı kurulmaz.
- İki hesap motoru bırakılmaz: kanonik aday `@ag/core`; SEL-456'nın saf JS MVP'si yalnız test ve şartname girdisi olur (H-4).
- B belgesindeki "agos-weekly-settlement adı korunsun" önerim bu kararla değişti.
- Güncellenen dosyalar: [`skills/agos-consortium-settlement/SKILL.md`](../../skills/agos-consortium-settlement/SKILL.md), [`skills/ORG-SKILL-UPDATES-2026-11-03.md`](../../skills/ORG-SKILL-UPDATES-2026-11-03.md), A, B, H.

## 3. Finans regresyonları: önce kırmızı test, sonra en küçük düzeltme

| Devir kimliği | Kural | Test | `e866a3c` (önce) | Düzeltme (`4b305b7`) | Sonra |
| -- | -- | -- | -- | -- | -- |
| D-F03 | Yeni komisyon ile iade alacağı yazılı mahsup onayı olmadan netleşmez | `settlement.regression.test` D-F03 | FAIL | Borç kalemleri yöne göre ayrı; borçlunun ödemesi yalnız borç kalemine eşlenir | PASS |
| D-F04 | İade ve onaylı iyi niyet iadesi müşteri borcu yaratmaz | D-F04 (3 test) | FAIL 3/3 | Müşteri borcu = fiyat − brüt tahsilat | PASS |
| D-F06 | İptal filtresi kaydedilmiş komisyonun ters hareketini atlamaz | D-F06 (3 test) | FAIL 2/3 (üçüncüsü ters kayıt hiç yazılmadığı için geçiyordu) | İptal haftasında bir kez `cancellation_reversal` (kod, HTML rapor, DB CHECK) | PASS |
| D-F05 | Önceki paylar güncel politikayla yeniden hesaplanmaz | D-F05 (2 test) + `policy-freeze.test` (3 test) | FAIL 2/2 | Önceki paylar gerçek kayıtlardan; politika fiyatla dondurulur (`PriceSnapshot.splitPolicyId`); bilinmeyen politika hata verir | PASS |
| D-F02 | Küsurat AGOS payını azaltabiliyor | 1 karakterizasyon + 1 `todo` | `todo`: 49,99 € sonrası son 1 kuruşta AGOS −1, site +1, tedarikçi +1 | **Değiştirilmedi** (politika kararı önce) | BLOCKED: H-23 |

**Normal yolda davranış değişmedi:** mevcut 78 test aynen geçiyor.

**Gerçekten çalıştırılan testler:**

| Komut | Commit | Sonuç |
| -- | -- | -- |
| `node --test packages/core/src/settlement.regression.test.ts` | `e866a3c` | 11 test: 2 geçti, 8 kaldı, 1 todo |
| `npm run check` (tsc + tüm testler) | `4b305b7` | tsc temiz; 92 test: 91 geçti, 0 kaldı, 1 todo |
| `node --test "qa-independent/**/*.test.ts"` | `4b305b7` | 83 test: 59 geçti, 24 kaldı. Öncesi 56/27; `A3.4`, `A3.5` ve `A3.11` yeşile döndü, başka değişiklik yok |
| `npm run report:sample` | `4b305b7` | W45 aynı; W46'da yalnız tamamen iade edilmiş `AG-Q3ES5G` müşteri borcu listesinden çıktı |
| PostgreSQL 16.15: migration + `0001_probes.sql` + yeni tür denemesi | `4b305b7` | Migration temiz; 16/16 reddedildi; eksi `cancellation_reversal` kabul, artı `cancellation_reversal` red |

`evidence/narrow-probes.json` bu oturuma gelmedi; o dar deneyler yeniden çalıştırılmadı (**NOT_RUN**).

## 4. Skill birleştirme ve davranış testi

**Durum: BLOCKED.** Bu oturuma yalnız devir belgesi geldi; paket gelmedi.

| Kalem | Durum | Not |
| -- | -- | -- |
| Paketin 6 skill adayı | BLOCKED | Dosyalar yok |
| 12 mevcut skill için ek öneriler | BLOCKED | Dosyalar yok |
| Mac'teki 12 skill'in hash'leri | BLOCKED | `evidence/` yok; bu oturum Mac'i göremiyor |
| Üç yönlü birleştirme | BLOCKED | Girdiler gelince ortak taban yoksa "iki yollu inceleme" etiketiyle yapılır |
| 72 ajan senaryosu (eski ve yeni sürüm) | NOT_RUN | Paket yok. Sahte araç ve sentetik veriyle koşulmalı; ücretli koşum bütçe onayı ister (H-14) |
| 72 Python referans testi | NOT_RUN | Paket yok |
| Yapılabilen kısım | DONE (iki yollu öneri) | `agos-consortium-settlement` V2 kurallarına göre güncellendi; ORG önerilerindeki "kaldır" maddeleri "ayrı politika kimliğiyle koru" yapıldı. Org skill'lerinin yerel kopyalarına yazılmadı. |

## 5. Reklam entegrasyonu hazırlığı

Ayrıntı: [reklam-entegrasyonu-hazirlik.md](./reklam-entegrasyonu-hazirlik.md). **Hiçbir madde doğrulanmadı.**
- Resmî sayfalar (`developers.google.com`, `support.google.com`, `developers.facebook.com`) bu oturumun ağ politikasınca engellendi; maddeler arama özetinden.
- Arama özetlerinin işaret ettiği değişiklikler:
  - Google Ads API'de developer token'ın Cloud proje erişimine devredilmesi
  - Search'te manuel dil hedeflemenin kalkması
  - offline dönüşümün Data Manager API'ye taşınması
  - ortalama günlük bütçenin kesin sınır olmaması
  - Meta'da Advanced Access için App Review ve Business Verification gerekmesi
  - Conversions API'de IP, URL ve referrer alanlarının rıza ve minimizasyonla sınırlanması

## 6. Kayıt ve kabul

| Alan | Değer |
| -- | -- |
| Kesin commit | `4b305b7` (kod) ve bu raporun belge commit'i |
| Değişen dosyalar | §1'deki uygulama dosyaları + `skills/agos-consortium-settlement/SKILL.md`, `skills/ORG-SKILL-UPDATES-2026-11-03.md`, `docs/konsey/A`, `B`, `E`, `H`, `README`, bu rapor, reklam hazırlık notu, `docs/KARARLAR-VE-CELISKILER.md`, `docs/ornek-hafta-2026-W45.json` |
| Gerçekten çalıştırılan testler | §3 tablosu |
| Kaynak kapsamı | Repo ve bu oturumun 6 org skill'i: GÖRÜLDÜ. Paket, `evidence/` ve Mac: GÖRÜLMEDİ. Resmî reklam sayfaları: ENGELLİ. |
| Açık bulgular | Bağımsız AI okumasının F1, F2, F3, F4 ve F7–F14'ü (24 `[RULE]` testi kırmızı); D-F02 (H-23) |
| İnceleyici | **Yok.** Yazar Claude. Akran incelemesi (Codex) ve insan bağımsız kabul gerekli. |
| Linear | SEL-456 (skill ve reklam), SEL-163 (QA), SEL-197 (partner mimarisi), SEL-442 (kısa indeks) |

**Sonraki tek adım:** Devirdeki paketi repo'ya veya SEL-456'ya ekle: 6 aday, 12 ek öneri, 72 senaryo, `evidence/`. §4 bu olmadan ilerleyemiyor. H-23 (küsurat politikası) ayrıca karar bekliyor.

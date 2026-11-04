# Canlıya geçiş yol haritası (5 adım, kapılı)

**Tarih:** 04.11.2026 (güncelleme 22:30 TRT) · **Hazırlayan:** Claude (Owner'ın 5 adımlık planına göre) · **Taban:** PR #9 `8c2a6e1`
**Durum:** `LOCAL_ONLY · INDEPENDENT_HUMAN_ACCEPTED=NO · G0 HOLD · CANLIYA HAZIR DEĞİL`

Kural: bir adımın **çıkış ölçütlerinin hepsi** sağlanmadan sonraki adıma geçilmez. Testlerin geçmesi Owner kararı veya insan kabulü yerine geçmez. Yeni özellik eklemek yerine yalnız bu yolu açan işler yapılır.

Mevcut Alanya Group siteleri bu süreçte kapatılmaz. Rezervasyon ve ödeme almayan tanıtım sayfaları ayrı bir yayın süreciyle hazırlanabilir; bu yol haritasının kapılarına bağlı değildir.

## Bugünkü durum

| Ölçü | Değer |
| -- | -- |
| `npm run check` (`f5de97c`) | 353: 338 geçti, 14 todo, 1 skip, 0 kaldı |
| PostgreSQL testleri (atılabilir PG16) | 132: 127 geçti, 5 todo, 0 kaldı |
| Açık güvenlik/finans bulguları | PR3-N2 (P3). PR3-N7/N8/N9/N10 kapandı |
| Açık QA-F4 probları | Q22/Q32 (H-22/K17), Q27/Q28 (K8). L ve P grupları PASS (aday, 0012–0014) |
| Owner kararı bekleyen | H-20, H-21, H-22/K17, H-23, H-25, H-26, K8, H-16 (mali/hukuk) |

## Adım 1 · İki güvenlik hatası (Codex uygular, Claude test eder) — **TAMAM (04.11.2026, `ff9899a`)**

PR3-N7 (`86c8b0d`), PR3-N8 (`f247054`) ve incelemede çıkan PR3-N9 (`ff9899a`) akran incelemesinden PASS (aday) aldı. Ayrıntı: inceleme raporu §23–§24.

| İş | Kabul testi (beklenti değişmeden geçmeli) |
| -- | -- |
| PR3-N7: site devrinde eski rezervasyonun atfı donar; komisyon yeni sahibe geçmez; eski rezervasyon güncellenebilir | `packages/db/src/attribution-hardening.test.ts` PR3-N7 × 2 |
| PR3-N8: tedarikçi kimliği biçimi uygulama ve veritabanında tek kaynaktan | aynı dosya, PR3-N8 |

**Çıkış:**
- Üç test yeşil.
- Q33–Q35 hâlâ doğru nedenle reddediliyor.
- Tüm DB ve uygulama testleri 0 kaldı.
- Claude akran incelemesi PASS.

## Adım 2 · Merkezi rezervasyon veritabanı (SEL-331)

| İş | Sorumlu | Çıkış ölçütü |
| -- | -- | -- |
| Gerçek CRS şemasının alınması (salt okunur şema dökümü, veri yok) | Owner / CRS sahibi | `pg_dump --schema-only` çıktısı veya eşdeğer belge repo dışı güvenli kanaldan |
| Aday şema (0001–0008) ↔ CRS eşleme tablosu: her tablo/kolon için "aynı / dönüştür / yeni" | Codex, Claude inceler | Eşlemesiz kolon kalmaz; finans kolonlarının hepsi eşlenmiş |
| CRS bağlantı katmanı (adaptör): doğrulanmış kimlikten `app.party_id` / `app.scope`, kapanışta `pg_advisory_xact_lock`, SAVEPOINT'siz kapanış (PR3-N2) | Codex | `close-lifecycle` PR3-N2 yeşil veya "SAVEPOINT yok" kuralı adaptör testinde |
| Kalan QA-F4 probları: ~~L (Q30)~~ PASS `6b15f09`; ~~P (Q23–26, Q29, Q31)~~ PASS `ce61a04` + PR3-N10 `05e036d`; R (Q27–28) K8 bekliyor | Codex, Claude inceler | Tam nedenle red; Q22/Q32 H-22 kararıyla |
| Mevcut kayıtlar için geri doldurma (backfill) ve çakışma temizliği: 0006 `NOT NULL` kolonları, 0007 normalize tekil indeks, 0008 atıf kontrolü | Codex + Owner onayı | Kuru koşu raporu: kaç satır etkilenir, hangileri elle karar ister |
| Yedek ve geri dönüş: göç öncesi tam yedek, geri yükleme provası, her göç için geri alma betiği | Owner / altyapı | Atılabilir kopyada geri yükleme provası belgeli |

**Çıkış:** CRS kopyasında (canlı değil) 0001–00xx sırasıyla uygulanır, tüm DB testleri yeşil, geri dönüş provası yapılmış.

## Adım 3 · Gerçek güvenlik entegrasyonları

| İş | Bilet | Çıkış ölçütü |
| -- | -- | -- |
| Yönetici girişi + gerçek 2FA (IdP), imzalı oturum; HTTP'de 2FA isteyen uçların (fiyat onayı, mahsup, itiraz kararı, mükerrer temizleme, kredi) yalnız gerçek 2FA ile açılması | SEL-332 | Statik yönetim anahtarı kaldırılmış; A8.x ve A14.3 gerçek oturumla geçer |
| Site kapsamlı kimlik (yerel `SITE_TOKENS` yerine IdP) | SEL-332 | A6.3–A6.10 gerçek kimlikle geçer |
| Turnstile site anahtarları ve gizli anahtar; `build:sites` canlı sitede anahtar yoksa hata (QA-F11 §15.1 öneri 5) | — | Her pilot sitede widget görünür, siteverify hostname/action kontrolü gerçek ağda doğrulanmış |
| Bağımsız güvenlik kabulü | SEL-324/326 | İnsan inceleyicinin yazılı kabulü |

## Adım 4 · Staging uçtan uca deneme (test verisiyle)

Senaryolar (her biri ayrı kanıt; gerçek müşteri verisi yok):
1. Rezervasyon oluşturma (pilot site, Turnstile, Origin), kimlik ve atıf doğru.
2. Fiyat: 1–4 kişi otomatik; 5+ manuel onay (2FA) ve K17 sınırları.
3. Komisyon: 50 € → 10/5/35; kısmi 30 + 20; kendi aracı 0/5/45.
4. İptal (öncesi/sonrası tahsilat), iade, kredi notu (H-25 kararına göre).
5. Haftalık ekstre: kapanış, itiraz, mahsup (yazılı onay + 2FA), site görünümü.
6. Şoföre ve müşteriye bildirim (outbox → kanal; gerçek gönderim yalnız test numaralarına).
7. Veri izolasyonu: site A, site B'yi göremez (API + RLS).
8. Geri dönüş provası.

**Çıkış:** bağımsız inceleyici senaryo raporunu kabul eder (PASS/FAIL tablosu, kanıtlar).

## Adım 5 · Kontrollü canlı pilot

**Önkoşul Owner kararları (pilot başlamadan):**
- H-10/K8 pilot hat kapsamı (öneri: AYT↔Alanya).
- K17/H-22 5+ fiyat sınırları.
- H-23 küsurat.
- H-20 itiraz süresi.
- H-21 haklı itirazın mali etkisi.
- H-25 kredi.
- H-26 makbuz tahsisi.
- H-16 mali müşavir ve hukuk (fatura, KDV, tahsilat sorumluluğu, acentelik yetkisi).
- **Owner LIVE GO.**

**Pilot kapsamı (öneri, H-18):**
- 1–2 uydu site, 1 hat, sınırlı saat aralığı.
- Reklam yok veya partnerin kendi hesabında yalnız ölçüm.

**İzleme:**
- Gerçek rezervasyonlar, hata kayıtları, dönüşüm.
- Haftalık ekstre farkları.
- İtirazlar.

**Durdurma ölçütleri:** herhangi bir finans tutarsızlığı, yetkisiz veri erişimi veya ödeme hatası → pilot durur, geri dönüş planı uygulanır.

**Genişleme:** iki temiz haftalık kapanıştan sonra Owner kararıyla diğer sitelere.

## Bu oturumdan yapılamayanlar (dürüst not)

- Gerçek CRS şemasına, staging'e, IdP'ye ve Turnstile anahtarlarına erişimim yok. Bunlar Owner / altyapı tarafından sağlanmalı.
- Kod sahipliği Codex'te; Claude test yazar ve inceler. Yazar kendi işini kabul edemez.
- Canlıya geçiş, ödeme, reklam ve gerçek müşteri verisi bu yol haritasındaki kapılar geçilmeden açılmaz.

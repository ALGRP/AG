# A · Skill envanteri ve çelişki raporu

**Tarih:** 03.11.2026 · **Hazırlayan:** Claude (bu oturum) · **Durum:** SALT OKUNUR envanter. Hiçbir skill silinmedi, değiştirilmedi veya kurulmadı.

- Makine okunur envanter: [`skills/inventory/2026-11-03-bulut-oturumu.json`](../../skills/inventory/2026-11-03-bulut-oturumu.json)
- Envanter aracı (salt okunur, ağa çıkmaz): [`tools/skill-inventory.mjs`](../../tools/skill-inventory.mjs)

## 1. Kapsam: ne görüldü, ne görülmedi

| Kaynak | Bu oturumda | Not |
| -- | -- | -- |
| claude.ai org skill'leri (bu oturuma senkron, 03.11 11:58 UTC) | **GÖRÜLDÜ** | 6 AGOS skill + 9 Anthropic skill |
| Repo, PR #9 `skills/` (c0b3175) | **GÖRÜLDÜ** | 1 skill taslağı + 1 değişiklik önerisi |
| SEL-456 `AGOS_Consortium_Skills_Ads_MVP_V1.zip` (beyan SHA-256 `6ab42a6c…6c59`) | **GÖRÜLMEDİ** | Linear issue'da ek yok, repo'da yok |
| SEL-442 `AGOS_NEW_CHAT_SKILL_INTAKE_V1_20261102.zip` (`agos-skill-intake`) | **GÖRÜLMEDİ** | Kurulum yok (SEL-442) |
| Mac'te kurulu 38 skill | **GÖRÜLMEDİ** | Mac dosya sistemi bu bulut oturumundan erişilemez |
| Codex ve Hermes skill/talimat setleri | **GÖRÜLMEDİ** | Konum doğrulanmalı |

**Sonuç:** Üç yönlü birleştirme (kurulu, aday, ortak taban) bu oturumda **tamamlanamaz**. Üç eksik girdi var:
1. SEL-456 zip'inin kendisi.
2. Mac manifesti.
3. Adayların hangi sürümden türetildiği (taban).

Aşağıdaki çelişki listesi yalnız görülen dosyalara dayanır. SEL-456 adaylarının içeriği hakkında yalnız Linear'daki beyanlar kullanıldı.

## 2. Kurulu AGOS skill'leri (bu ortam)

Altı skill'in hepsi 03.11 Owner kararlarından **önce** güncellenmiş.

| Skill | Org güncelleme | SKILL.md SHA-256 | Satır | Değerlendirme |
| -- | -- | -- | -- | -- |
| agos-pricing-matrix | 30.10 10:52 | `86ef0045e7087cf7…` | 132 | **ESKİ KURAL:** 5 = 80 €, +10 €/kişi, "AG kendisi satıp işletir", %20 tabanı "teyit et" |
| agos-pool-finance | 30.10 13:19 | `9876d38a9683955c…` | 158 | **ESKİ KURAL:** "otomatik mahsup", "Shuttle AG'nin kendi işi"; Supabase'e bağlı |
| agos-governance | 30.10 13:19 | `97c7a21fe1efb507…` | 129 | **KISMEN ESKİ:** 2FA kuralı güncel, uygulaması Supabase'e özgü; tenant izolasyonu yok |
| ag-domain-network-seo | 02.11 10:47 | `6565636bc895e1f7…` | 270 | Tek fiyat kaynağı kuralı uyumlu; K1 ve uydu kurulumu eksik |
| agos-notification-automations | 30.10 11:02 | `db978e94b51e1b0b…` | 144 | Uyumlu (outbox, dondurulmuş fiyat) |
| agos-reviews | 30.10 12:51 | `5f956b3b6d5b1294…` | 126 | Uyumlu; konsorsiyum kapsamı dışında |

Tam SHA-256, dosya ağacı özeti (`tree_sha256`) ve plugin kimlikleri JSON envanterde.

**Neden önemli:** Bu skill'ler bugün de etkin. Fiyat veya hak ediş üzerinde çalışan herhangi bir ajan bu eski kuralları uygulayabilir. Örneğin 5 kişiye otomatik 80 € fiyat verebilir ya da mahsubu otomatik yapabilir. Bu yüzden B listesinde ilk sırada bunların düzeltilmesi var.

## 3. Çelişkiler: kurulu skill ↔ güncel Owner kuralları

S1–S10 numaraları [`skills/ORG-SKILL-UPDATES-2026-11-03.md`](../../skills/ORG-SKILL-UPDATES-2026-11-03.md) dosyasıyla aynıdır; orada satır satır önerilen metin var. Bu envanterde yeni bulunanlar S11–S15.

| # | Skill | Mevcut metin | Güncel kural | Öneri |
| -- | -- | -- | -- | -- |
| S1 | agos-pricing-matrix | "Alanya Group kendisi satıp işletir" | K15: işi tedarikçi yapar ve tahsil eder | Başlığı ve akışı değiştir |
| S2 | agos-pricing-matrix | "+10 €/kişi (5 = 80 €)" | 5+ otomatik fiyat yok; 80 € açılmaz | Konsorsiyumda K17 kuralı; eski satır silinmez, `legacy-shuttle-tariff-2026-08` kimliğiyle tarihsel bölüme (V2 devir) |
| S3 | agos-pricing-matrix | %20 tabanı "teyit et" | T2: fiilen tahsil edilen tutar | Kesinleştir |
| S4 | agos-pricing-matrix | test verisi "1–8 yolcu" | Otomatik 1–4 | Düzelt |
| S5 | agos-pricing-matrix | Hat kuralı (AYT ↔ GZP yok, iki bacak) | K8: her yön ayrı kod, kapsam, aktif/pasif | Kalır; K8 ayrıntısı eklenir |
| S6 | agos-pricing-matrix | Veri modeli "(veya taban + ek yolcu kuralı)" | Ek yolcu kuralı yok; 5+ hat bazında min/max | Düzelt |
| S7 | agos-pool-finance | "Shuttle AG'nin kendi işi" | K15: shuttle tedarikçiye atanır | Düzelt |
| S8 | agos-pool-finance | "nakit/kart otomatik mahsup" | T1: konsorsiyumda mahsup yalnız yazılı onay + 2FA | Konsorsiyumdan ayır; AG'nin kendi havuz cari hesabı için `pool-ledger-auto-netting-legacy` kimliğiyle koru (V2 devir) |
| S9 | agos-pool-finance | Haftalık kapanış metni | T3: kapanmış hafta değişmez, itiraz 7 gün | Ek metin |
| S10 | agos-pool-finance / agos-pricing-matrix | ×1,30 havuz kuralı | Konsorsiyum shuttle'ına uygulanmaz | Kalır; `pool-offer-markup-1.30` kimliğiyle |
| **S11** | agos-governance §3 | "Nakit işte komisyon borcu … mahsup tedarikçi düzeyinde yapılır" | T1: otomatik mahsup yok | Konsorsiyumdan ayır; havuz ürününde politika kimliğiyle koru. Konsorsiyumda mahsup ayrı, yazılı onaylı kayıttır |
| **S12** | agos-governance, agos-pool-finance | Supabase'e özgü uygulama: `app_role()`, Supabase Dashboard'dan MFA silme, security definer fonksiyonları | SEL-331: çekirdek mevcut CRS. SEL-332: kimlik sağlayıcı kararı açık | Kuralı sağlayıcıdan bağımsız yaz; Supabase ayrıntısını `references/` altına "tarihsel taslak" diye taşı |
| **S13** | agos-governance | Tenant izolasyonu bölümü yok | Konsorsiyum çok kiracılı: siteler birbirinin verisini, komisyonunu, reklam hesabını göremez | Bölüm ekle: tenant kimliği her kayıtta, satır düzeyi yetki, kiracı bazlı kimlik bilgisi kasası, çapraz kiracı negatif testleri |
| **S14** | ag-domain-network-seo | Fiyat WordPress shortcode'undan gelir; uydu kurulumu ve domain doğrulama yok | K1: ana site Next.js; partner uydular statik HTML/SSG, fiyat derlemede merkezi tarifeden | Bölüm ekle; WordPress kısmı ana site göçü bitene kadar kalır |
| **S15** | agos-pool-finance | Haftalık kapanış ve cari | Konsorsiyum haftalık kapanışı ayrı skill adayında | Kapsamı ayır (bkz. §4) |

## 4. Mükerrer ve örtüşme riskleri

| Risk | Kaynaklar | Öneri |
| -- | -- | -- |
| **Haftalık kapanış üç yerde** | `agos-consortium-settlement` (repo) · `agos-weekly-settlement` (SEL-456) · `agos-pool-finance` (kapanış bölümü) | **V2 devir kararı:** tek yetkili finans skill'i **agos-consortium-settlement**. `agos-weekly-settlement` ona yönlenir; benzersiz içeriği görülünce birleştirilir. pool-finance konsorsiyum kapanışını oraya devreder. Benim önceki önerim ("agos-weekly-settlement adı korunsun") bu kararla değişti. |
| **20/10/70 tablosu birden çok yerde** | agos-consortium-policy (SEL-456) · agos-pricing-matrix · repo taslağı | Pay tablosunun tek yeri `agos-consortium-policy`. Diğerleri ona atıf yapar, tabloyu kopyalamaz. |
| **İki kod adayı** | SEL-456 saf JS MVP (29/29 test) · PR #9 TypeScript `@ag/core` (78/78 test) | Fiyat, komisyon ve kapanış mantığı iki ayrı kodda. "Tek fiyat kaynağı" ilkesine aykırı ayrışma riski. Biri kanonik seçilmeli (H-4). |
| **SEL-456 "tam tahsil" ifadesi** | SEL-456 madde 9: "tam tahsil/ifa kanıtı" | T2 kısmi tahsilatta pay doğurur. Aday metni T2'den önce yazılmış olabilir. Birleştirmede kontrol edilmeli. |

## 5. Kanallar arası fiyat çelişkisi (Owner kararı gerekli)

- SEL-88, SEL-197 ve SEL-63'te dış B2B dağıtıcı tarifesi var:
  - 1–5 kişi 30/50/60/70/**80 €**
  - %10–15 komisyon
- Konsorsiyumda 5+ kişi **manuel onaylıdır**.
- Owner notu iki kanalın ayrı olduğunu ve karışmaması gerektiğini söylüyor. Ancak shuttle fiyat kararında "tek fiyat kaynağı, siteler arası çelişen fiyat yok" kuralı da var.
- Sonuç: aynı müşteri 5 kişilik iş için bir B2B kanalında 80 €, bir konsorsiyum sitesinde "fiyat onayı gerekli" görebilir.
- Karar H-8'de.

## 6. Referans verilen ama bu ortamda olmayan skill'ler

| Skill | Referans veren |
| -- | -- |
| agos-realtime-dispatch | agos-pool-finance, agos-notification-automations |
| automation-security-ops | agos-notification-automations |
| agos-ai-booking-intake | SEL-88, SEL-197 |
| agos-transfer-yield-planning | SEL-88, SEL-197 |
| agos-skill-intake | SEL-442 (yeni sohbet standardı) |

Bunlar Mac'teki 38 skill arasında olabilir. Mac manifesti gelince eşlenir; yoksa "kırık referans" olarak düzeltilir.

## 7. Üç yönlü birleştirme prosedürü (eksik girdiler gelince)

1. **Envanter (salt okunur):**
   - Mac'te şunu çalıştır: `node tools/skill-inventory.mjs --label mac-claude ~/.claude/skills > mac-claude.jsonl`.
   - Aynısını Codex ve Hermes klasörleri için tekrarla.
   - SEL-456 zip'ini yeni ve boş bir klasöre aç, `--label sel456` ile çalıştır.
   - Zip'in SHA-256'sı beyanla (`6ab42a6c…6c59`) karşılaştırılır.
2. **Taban seçimi:**
   - Taban, adayın türetildiği sürümdür.
   - Aday bunu belirtmiyorsa taban, aynı adlı en eski bilinen sürümdür (bugün için 30.10 org sürümü). Bu durum açıkça **VARSAYIM** diye yazılır.
3. **Birleştirme:**
   - Komut: `git merge-file --diff3 -p KURULU.md TABAN.md ADAY.md > BIRLESIK.md`. Çıkış kodu çakışma sayısıdır.
   - Her çakışma güncel Owner kararına göre elle çözülür ve kararın kimliği not edilir.
4. **Yazma yeri:**
   - Birleşik aday `skills/candidates/<ad>/` altına yazılır; kurulu dosyanın üstüne asla yazılmaz.
   - Ardından değerlendirme çalışır (D), bağımsız kabul gelir.
   - Kurulum ayrı bir kapıdır.
5. **Kanıt:**
   - Üç girdinin ve birleşik dosyanın SHA-256'sı ile çakışma listesi SEL-456'ya L4 kanıtı olarak yazılır.

## 8. Sınırlar

- Bu envanteri yazan oturum, PR #9'daki skill taslağının da yazarıdır. Kendi taslağımı mükerrer riski olarak işaretledim; kabulü bağımsız incelemeye bırakıyorum.
- İçeriği görülmeyen adaylar (SEL-456, Mac) hakkında içerik yargısı verilmedi.

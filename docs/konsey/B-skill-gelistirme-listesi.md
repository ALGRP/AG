# B · Geliştirilecek skill listesi ve önerilen değişiklikler

**Durum:** Öneri (istişare). Bu belge hiçbir skill'i değiştirmez. Uygulama, Owner mutabakatından sonra Faz 2'de yapılır. Kurulu dosyaların üstüne yazılmaz; adaylar `skills/candidates/<ad>/` altında üretilir.

**İlke:** Owner'ın 10 alanı için **yeni skill açmadan önce** var olan veya aday olan skill'e bağlanır. Toplam 9 skill 10 alanı karşılar:
- 4 mevcut skill iyileştirilir.
- 1 skill birleştirmeyle oluşur.
- SEL-456'dan 3 aday incelenir.
- 1 yeni skill var; o da yalnız Mac envanterinde karşılığı yoksa açılır.

## 1. Alan → skill eşlemesi

| # | Owner alanı | Hedef skill | İşlem | Kaynaklar |
| -- | -- | -- | -- | -- |
| 1 | Konsorsiyum iş kuralları ve partner yönetimi | **agos-consortium-policy** | SEL-456 adayını incele ve birleştir | SEL-456 adayı · K15/K12/K18 · repo taslağının kural bölümü |
| 2 | Shuttle fiyatlandırma ve komisyon hesaplama | **agos-pricing-matrix** | Mevcut skill iyileştirilir | Kurulu sürüm `86ef0045…` · S1–S4, S7 · K17/K8 |
| 3 | Private/VIP tedarikçi pass ve iş havuzu | **agos-pool-finance** | Mevcut skill iyileştirilir | Kurulu sürüm `9876d38a…` · S5, S6, S12, S15 |
| 4 | Tedarikçi tahsilatı ve haftalık hesap kapanışı | **agos-consortium-settlement** (tek yetkili finans skill'i; V2 devir) | Birleştirme; `agos-weekly-settlement` buna yönlenir | Repo `agos-consortium-settlement` + SEL-456 `agos-weekly-settlement` adayı + pool-finance kapanış bölümü |
| 5 | Google Ads / MCC hesap bağlantıları | **agos-tenant-ads-onboarding** (Google için `references/google-ads.md`) + **agos-ads-budget-control** | SEL-456 adaylarını incele | SEL-456 · SEL-446/453 (AG'nin kendi hesabı ayrı tutulur) |
| 6 | Meta Business ve reklam hesabı | **agos-tenant-ads-onboarding** (Meta için `references/meta.md`) | SEL-456 adayını incele | SEL-456 |
| 7 | Uydu site oluşturma ve SEO | **ag-domain-network-seo** (+ `references/uydu-kurulum.md`) | Mevcut skill iyileştirilir | Kurulu sürüm `6565636b…` · K1 · PR #9 `@ag/ssg` kuralları |
| 8 | Rezervasyon dönüşüm ve reklam performansı | **agos-ads-attribution** | SEL-456 adayını incele | SEL-456 · SEL-446 (dönüşüm P0) · KVKK |
| 9 | Tenant izolasyonu, kimlik, güvenlik | **agos-governance** | Mevcut skill iyileştirilir | Kurulu sürüm `97c7a21f…` · S11–S13 · SEL-332 · SEL-324 dersleri |
| 10 | Bağımsız test, release, rollback | **agos-release-gate** | **Yeni**, ama yalnız Mac'te karşılığı yoksa | SEL-163 · SEL-326 · PR #9 QA planı (E) |

5 ve 6 tek skill'de toplanır; platform farkları `references/` altında durur. Hesap sahipliği, izin, kanıt ve "önce salt okunur" kuralları iki platformda aynı olduğu için iki ayrı skill ikiz kural üretir. SEL-456 adayı farklı bölmüşse incelemede ona uyulur.

## 2. Eğitim önceliği (neden bu sıra)

| Sıra | Skill | Neden önce |
| -- | -- | -- |
| 1 | agos-pricing-matrix | **Bugün etkin ve yanlış öğretiyor** (80 €, +10 €/kişi). Fiyat işi yapan her ajan bunu uygulayabilir. En ucuz ve en acil düzeltme. |
| 2 | agos-consortium-policy | Tek kural kaynağı. Diğer skill'ler pay tablosunu buradan alır; önce bu sabitlenmezse kopyalar ayrışır. |
| 3 | agos-consortium-settlement | Para hareketi kuralları. Mükerrer üç kaynak tek yerde toplanmalı (V2 devir: bu ad tek yetkili). |
| 4 | agos-governance | Çok kiracılı kodun her satırı buna dayanır: tenant, 2FA, kimlik. Supabase'e bağlı metin, CRS kararıyla çelişiyor. |
| 5 | agos-release-gate | Bundan sonraki her kabulün biçimi. Yazar ile kabul edenin ayrımı burada kurallaşır. |
| 6 | agos-pool-finance | Otomatik mahsup kaldırılır, kapanış settlement'a devredilir. |
| 7 | ag-domain-network-seo | K1 ve uydu kurulum adımları. Pilot site öncesi yeterli. |
| 8–10 | agos-tenant-ads-onboarding, agos-ads-budget-control, agos-ads-attribution | Tenant kaydı, kimlik ve rıza altyapısı olmadan uygulanamaz. Skill taslağı ve değerlendirmesi yapılabilir, API işi yapılmaz. |

## 3. Skill bazında önerilen değişiklikler

### 3.1 agos-pricing-matrix (iyileştir)
- S1–S4 ve S7 uygulanır:
  - Tarife 1–4 kişi rezervasyon toplamıdır: 30/50/60/70 €.
  - 5+ kişi otomatik fiyatlanmaz.
  - 80 € ve +10 €/kişi kaldırılır.
  - Her yön ayrı hat kodu; AYT-GZP yasak.
  - Pasif hatta fiyat üretilmez.
- K17: manuel fiyat yalnız hattın onaylı min/max sınırı içinde, 2FA'lı admin veya finans yöneticisi tarafından, gerekçe ve denetim kaydıyla.
- Pay tablosu kopyalanmaz; `agos-consortium-policy`'ye atıf yapılır.
- Kanal notu: B2B dağıtıcı tarifesi ayrı kanaldır, karıştırılmaz (H-8 kararına kadar "AÇIK" işaretli).

### 3.2 agos-consortium-policy (SEL-456 adayı + birleştirme)
- Paylar:
  - Shuttle %20 site / %10 AGOS / %70 tedarikçi; alanyagroup.com dahil.
  - Kendi aracıyla %90 / %10; yalnız yetkisi doğrulanmış site.
  - Private/VIP'de AGOS ek komisyonu 0.
- SaaS 200 €/ay. Reklam giderleri site sahibine aittir; 40 €/gün yalnız örnek.
- Partner yaşam döngüsü:
  - kayıt (yasal kişi, yetki belgesi, sözleşme, domain)
  - askıya alma
  - çıkış
  - veri iadesi
- Her kural bir karar kimliği taşır (ör. `2026-11-03/K15`); kaynağı Linear'daki Owner kaydıdır.

### 3.3 agos-consortium-settlement (birleştirme; `agos-weekly-settlement` buna yönlenir)
- T1/T2/T3 kuralları ve fark modeli: `pay(net tahsilat) − pay(önceki kapanış)`.
- Hafta sınırları ve Salı 18:00 son ödeme.
- Dekont amaçları, itiraz akışı, mahsup için yazılı onay.
- Repo taslağındaki 21 test senaryosu `evals/` altına taşınır.
- SEL-456 metnindeki "tam tahsil" ifadesi T2'ye göre düzeltilir (bkz. A §4).
- Private/VIP kısmi tahsilatta orantılı bölme "ADAY KURAL, mali müşavir kabulü bekler" etiketiyle yazılır.

### 3.4 agos-governance (iyileştir)
- Kuralları sağlayıcıdan bağımsız yaz:
  - Admin yetkisi yalnız 2FA'lı oturumda.
  - Rol yalnız CRS kaydından okunur.
  - Supabase ayrıntısı `references/` altına taşınır (S12).
- 2FA'sız **hiçbir** admin işlemi yapılamaz (SEL-332). Bugün PR #9'da kapanış, iade, tahsilat ve dekont kaydı 2FA istemiyor (yerel). Bkz. E §2.
- Tenant izolasyonu bölümü (S13):
  - Her kayıtta tenant kimliği.
  - API'de kiracı kapsamlı yetki.
  - Veritabanında satır düzeyi güvenlik.
  - Kiracı bazlı kimlik bilgisi kasası (reklam ve OAuth anahtarları).
  - Çapraz kiracı negatif testleri.
- Otomatik mahsup cümlesi kaldırılır (S11).
- Ajan kimlikleri: her AI ayrı kimlikle yazar; "OWNER KARARI" metni yalnız doğrulanmış Owner kimliğinden geçerlidir (bkz. C §4).

### 3.5 agos-release-gate (yeni; Mac'te karşılığı yoksa)
- Kanıt şablonu:
  - Commit SHA'sı sabitlenir.
  - Komut ve çıkış kodu kaydedilir.
  - Sonuçlar PASS / FAIL / NOT TESTED olarak ayrılır.
- Bayraklar: `INDEPENDENT_ACCEPTED`, `LIVE_CHANGED`, `PRODUCTION_CHANGED`.
- Yazar ile kabul edenin ayrımı.
- Geri dönüş provası.
- Canlıya geçişin 8 koşulu ve Owner LIVE GO kontrol listesi.
- Kaynak: SEL-163, SEL-326 ve SEL-324'teki kanıt biçimi.

### 3.6 agos-pool-finance (iyileştir)
- S5, S6, S12 ve S15 uygulanır.
- Havuz ve teklif akışı (×1,30, müşteri seçimi, tavan) korunur.
- Haftalık kapanış `agos-weekly-settlement`'a devredilir.
- PASS akışı: tedarikçi hak edişini site belirler; satıştan büyük olamaz.

### 3.7 ag-domain-network-seo (iyileştir)
- K1: ana site Next.js + TypeScript; partner uydular statik HTML/SSG ve ortak TypeScript şablonu.
- Fiyat derleme anında merkezi tarifeden gelir; elle fiyat varsa site derlenmez.
- Önizleme `noindex`, CSP, hreflang, sitemap.
- Uydu kurulum adımları (`references/uydu-kurulum.md`):
  - tenant kaydı
  - domain sahipliği doğrulaması (TXT)
  - önizleme
  - Owner GO
  - Search Console
  - sitemap
- WordPress bölümleri ana site göçü bitene kadar kalır.

### 3.8–3.10 Reklam skill'leri (SEL-456 adaylarının incelemesi)
- Hesap sahibi partnerdir. Bağlantı OAuth veya yetki devriyle kurulur; önce **salt okunur**.
- Hesap açma, ödeme yöntemi bağlama ve harcama başlatma: hesap sahibinin onayı + Owner GO.
- MCC ve Meta yetki modelinin erişim düzeyi resmi dokümandan doğrulanır. En az yetkiyle başlanır.
- Reklam harcaması asla AGOS kartına aktarılmaz.
- Bütçeyi site belirler; platform tarafında üst sınır hesap sahibinde kalır.
- Dönüşüm ölçümü:
  - Her tenant'ın ayrı GA4/GTM, Pixel ve CAPI kimliği olur.
  - Rıza (KVKK) olmadan olay gönderilmez.
  - Tarayıcı ve sunucu olayları tekilleştirilir.
  - Çapraz kiracı sızıntı testi yapılır.
- AG'nin kendi Google Ads hesabı (SEL-446/453) bu skill'lerin kapsamı dışındadır.

## 4. Her skill için zorunlu yapı

Owner'ın 10 alanı tek şablonda: [`skills/TEMPLATE-SKILL.md`](../../skills/TEMPLATE-SKILL.md).

Ek kurallar:
- Her iş kuralı yanında karar kimliği ve durumu (KESİN / TASLAK / AÇIK) bulunur.
- Yasaklar gerekçesiyle yazılır. Model kuralın nedenini bilince kenar durumda daha doğru davranır.
- SKILL.md 500 satırın altında kalır. Uzun ayrıntı `references/`, tekrarlayan hesap `scripts/` altına gider.
- Test senaryoları skill'in `evals/` klasöründe, `claude plugin eval` biçiminde durur (bkz. D).
- Gizli anahtar, müşteri verisi ve tam sohbet dökümü skill'e girmez.

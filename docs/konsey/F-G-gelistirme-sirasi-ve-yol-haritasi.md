# F · Yazılım geliştirme sırası ve bağımlılıklar · G · SEL-442 piramidine göre yol haritası

**Durum:** Öneri (istişare). Süre tahmini Faz 1 mutabakatından sonra verilir. Süreyi asıl belirleyen dış bağımlılıklardır: bağımsız inceleyici ataması, CRS staging erişimi, kimlik sağlayıcı kararı.

## F.1 Mevcut sistemi koruma ilkeleri

1. **Yeniden yazım yok.**
   - Canlı WordPress sitesi, mevcut rezervasyon akışı ve SEO içeriği yerinde kalır.
   - Ana sitenin Next.js'e geçişi ayrı bir hattır ve eşdeğerlik kanıtlanmadan yapılmaz.
2. **Tek rezervasyon kaynağı CRS PostgreSQL.**
   - Yeni kod CRS'e bir bağdaştırıcıyla bağlanır.
   - PR #9'daki bellek deposu yalnız yerel geliştirme içindir; yeni rezervasyon veritabanı kurulmaz.
3. **Kenardan büyüt.**
   - Yeni yetenekler mevcut sistemin yanına eklenir; önce salt okunur, sonra yazma.
   - Her adımın geri dönüşü vardır.
4. **Sıra:** önce kural, kimlik ve veri; sonra arayüz; en son dış entegrasyon (reklam, ödeme).
5. **PR #9'daki kural motoru** (`@ag/core`: fiyat, pay, haftalık kapanış) bağımsız QA'dan geçerse kanonik kural kütüphanesi olur ve CRS'e bağdaştırıcıyla bağlanır.

## F.2 Geliştirme sırası

| # | Adım | Bağımlı olduğu | Sorumlu | Çıkış ölçütü (kanıt) |
| -- | -- | -- | -- | -- |
| **F0** | **Yönetişim temeli** (kod yok): AI kimliklerinin ayrılması, karar kimliği biçimi, bağımsız inceleyici ataması, mali müşavir/hukuk soru listesi | — | Owner, ChatGPT | İnceleyici adı; Owner kararı yalnız doğrulanmış kimlikten; H-1/H-2/H-3 kararlı |
| **F1** | **Skill konsolidasyonu**: Mac envanteri, SEL-456 zip, eski kuralın düzeltilmesi (önce fiyat skill'i), birleşik adaylar, değerlendirme, bağımsız kabul, kurulum | F0 (kabul için); envanter girdileri | Claude (yazım, koşum), inceleyici (gizli set) | B'deki 9 skill eşikleri geçer (D §3); kurulum Owner GO'su |
| **F2** | **PR #9 düzeltme turu ve bağımsız QA.** AI okumasının 4 yüksek ve 10 orta bulgusu (F1–F14, E §3) Codex'te düzeltilir; Claude şartname ve akran incelemesi yapar; ardından insan inceleyici. Kanonik kod kararı da burada (PR #9 TypeScript mi, SEL-456 JS mi). | F0 (inceleyici); H-5, H-19…H-22 | Codex (düzeltme); Claude (inceleme); inceleyici (kabul) | `qa-independent` testlerindeki tüm `[RULE]` testleri yeşil; DB kısıtları eklenmiş; `INDEPENDENT_ACCEPTED=YES/NO` + FAIL listesi; H-4 kararı |
| **F3** | **CRS staging**: erişim (SEL-329), salt okunur şema dökümü, eşleme (SEL-331), PostgreSQL bağdaştırıcısı, staging testleri | SEL-329 erişimi; F2 | Codex; Claude (eşleme incelemesi) | Eşleme tablosu onaylı; staging'de migration ve geri dönüş PASS; mevcut regresyon değişmedi |
| **F4** | **Kimlik ve 2FA** (SEL-332): sağlayıcı kararı, admin 2FA, rolün CRS'ten okunması, statik anahtarın kaldırılması; **tüm** admin işlemleri 2FA'lı | Owner IdP kararı | Codex; inceleyici | 2FA'sız oturum hiçbir admin işlemi yapamaz (test); acil durum prosedürü |
| **F5** | **Tenant modeli**: tenant kaydı (site, partner, yasal kişi, domain, faturalama, reklam hesabı), kiracı kapsamlı API yetkisi, CRS'te satır düzeyi güvenlik | F3, F4 | Codex; Claude (şartname); inceleyici | Çapraz kiracı negatif testleri PASS: başka sitenin rezervasyonu, ekstresi, komisyonu, reklam verisi okunamaz ve değiştirilemez |
| **F6** | **Partner paneli MVP**: önce salt okunur (kendi rezervasyonları, ekstreleri, alacakları), sonra işlemler (atama, tahsilat girişi) | F4, F5 | Codex | Partner yalnız kendi tenant'ını görür; finans işlemleri 2FA ister |
| **F7** | **Uydu site şablonu ve ilk pilot site** (önizleme, noindex): fiyat derlemede merkezi tarifeden, form merkezi API'ye (staging) | F3, F5; K8 hat onayı; 5+ için K17 sınırları | Codex; Claude (SEO şartnamesi) | Elle fiyat yok (derleme reddeder); form → staging CRS uçtan uca; mobil QA |
| **F8** | **Reklam**: tenant reklam kaydı → partner hesabını izinle bağlama (salt okunur, sandbox) → dönüşüm ölçümü (rıza, tenant ayrımı) → bütçe görünürlüğü (harcama partnerde) | F5, F6; KVKK; platform izinleri | Codex; Claude (şartname) | Sandbox tenant'ta dönüşüm uçtan uca; çapraz kiracı sızıntı testi PASS; harcama yok |
| **F9** | **Ana site Next.js geçişi (K1)**: URL envanteri ve 301 (SEL-162), SEO eşdeğerliği, tasarım pilotu (SEL-442 kayıtları) | Rezervasyon API'sinin staging'de kararlı olması | Codex; Claude (inceleme) | 301 haritası, SEO eşdeğerlik raporu, geri dönüş; ayrı Owner GO |
| **F10** | **Pilot**: tek tenant sandbox → canlıya geçişin 8 koşulu → Owner LIVE GO → sınırlı canlı → 10–20 siteye ölçek | F1–F7 (F8 isteğe bağlı) | Owner; operatör | 8 koşulun her biri kanıtlı; geri dönüş provası yapılmış |

**Kritik yol:** F0 → F2 ve F3 → F4 → F5 → F6/F7 → F10.

**Öneri:**
- İlk pilotu reklam otomasyonu olmadan aç. Partner reklamını kendi hesabında kendisi yürütür; biz yalnız dönüşümü ölçeriz.
- F8 kritik yolda değil; pilotu bekletmez.
- F9 konsorsiyum MVP'sinin kritik yolunda değil.

## F.3 Paralel yürüyebilenler

- F1 (skill) ile F2 (PR #9 QA) aynı anda yürür.
- F9 hazırlığı (salt okunur URL envanteri) F3'ü beklemez.
- Mali müşavir ve hukuk görüşmesi F0'da başlar; F10'a kadar sonuçlanmalı.

---

## G · SEL-442 piramidine göre yol haritası

Yeni mükerrer issue açılmaz. Her adım mevcut bir SEL kaydına bağlanır. Uygun kayıt yoksa en yakın L3'e yorum olarak eklenir.

```
L0  SEL-442  AGOS Master Index (Owner kuralları, kapılar, indeks)
└─ L1  AGOS Konsorsiyumu
   ├─ L2-a  AI konseyi ve skill yönetişimi ── L3: SEL-442 (intake), SEL-456 (skill paketi), SEL-448 (AI Council runtime)
   ├─ L2-b  Konsorsiyum çekirdeği: fiyat, pay, kapanış ── L3: SEL-88, SEL-63, SEL-197, SEL-163
   ├─ L2-c  Kimlik ve tenant izolasyonu ── L3: SEL-332; SEL-324/326 (G0 güvenlik kapıları)
   ├─ L2-d  CRS entegrasyonu ── L3: SEL-329, SEL-331, SEL-327
   ├─ L2-e  Uydu siteler, SEO, ana site göçü ── L3: SEL-306, SEL-363, SEL-162, SEL-352
   ├─ L2-f  Reklam ve ölçüm ── L3: SEL-456, SEL-446, SEL-453
   ├─ L2-g  Hukuk, vergi, KVKK ── L3: SEL-396, SEL-401
   └─ L2-h  QA ve release ── L3: SEL-163
L4  Kanıt: commit SHA, PR (ör. ALGRP/AG#9 @ c0b3175), test çıktıları, skill envanteri, probe sonuçları
```

### Fazlar

| Faz | Kapsam | L3 bağlantıları | Çıkış ölçütü | Kapı |
| -- | -- | -- | -- | -- |
| **1 · İstişare ve hazırlık** (şimdi) | Bu paket (A–H), envanter, şablon, başlangıç senaryoları, PR #9 yazar tekrarı ve AI saldırgan okuması | SEL-442, SEL-456, SEL-163 | Owner mutabakatı; H-1…H-7 kararları; Mac envanteri ve SEL-456 zip teslim | Owner |
| **2 · Skill geliştirme ve yerel testler** | F1; birleşik adaylar, değerlendirme koşumları | SEL-456, SEL-442 | Eşikler (D §3); bağımsız kabul; kurulum GO | İnceleyici → Owner |
| **3 · Çekirdeğin kabulü ve altyapı** | F2, F3, F4 | SEL-163, SEL-329/331, SEL-332 | PR #9 kabul/red; staging CRS PASS; 2FA zorunlu | İnceleyici → Owner |
| **4 · Çok kiracılı ürün** | F5, F6, F7 | SEL-197, SEL-306, SEL-363 | Çapraz kiracı testleri PASS; pilot site önizlemede | İnceleyici → Owner |
| **5 · Reklam ve ölçüm** | F8 | SEL-456, SEL-446 | Sandbox tenant dönüşüm kanıtı; harcama yok | KVKK + Owner |
| **6 · Pilot ve ölçek** | F10; ayrı hat F9 | SEL-163, SEL-162 | 8 koşul + Owner LIVE GO | Owner LIVE GO |

Her faz kapısında ChatGPT/koordinasyon SEL-442'ye L0→L4 kaydını yazar:
- tarih ve kaynak
- durum ve engel
- tek sonraki eylem
- sorumlu
- kapı

Kayıtta kişisel veri, gizli anahtar veya tam sohbet dökümü olmaz.

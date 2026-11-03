# AGOS Konsorsiyumu · Skill geliştirme ve AI konseyi · Faz 1 istişare paketi

**Tarih:** 03.11.2026 · **Hazırlayan:** Claude · **Karar:** İSTİŞARE + SKILL HAZIRLIĞI. Canlı değişiklik yok.
**Durum:** `LOCAL_ONLY · LIVE_CHANGED=NO · PRODUCTION_CHANGED=NO · INDEPENDENT_ACCEPTED=NO`. PR #9 merge edilmez. SEL-324/326 G0 HOLD.

## Değerlendirmem (özet)

1. **Görev dağılımının temeli doğru, ama bugün güvenli çalışmaz.**
   - Kabul eden insan yok: bağımsız inceleyici atanmamış (SEL-326).
   - Kimlikler ayrışmıyor: Linear'da herkes "ALANYA GROUP", GitHub'da herkes "ALGRP".
   - Bu ikisi çözülmeden hiçbir iş G0'ı geçemez ve "Owner kararı" doğrulanamaz.
2. **Kurulu skill'ler eski kural öğretiyor.**
   - `agos-pricing-matrix` hâlâ "5 kişi = 80 €, +10 €/kişi" diyor.
   - `agos-pool-finance` ve `agos-governance` otomatik mahsup diyor.
   - Altı AGOS skill'inin hepsi 03.11 kararlarından önce yazılmış.
   - İlk eğitim işi bunları düzeltmek.
3. **Mükerrer riski var.**
   - Haftalık kapanış üç yerde: PR #9'daki benim taslağım, SEL-456 adayı ve pool-finance. Benim taslağım ayrı skill olarak kurulmamalı.
   - Fiyat ve pay mantığı iki ayrı kodda: PR #9 TypeScript ve SEL-456 JS MVP.
4. **Envanter yarım.**
   - Bu bulut oturumu Mac'teki 38 skill'i, Codex ve Hermes setlerini ve SEL-456 zip'ini göremiyor.
   - Üç yönlü birleştirme bu girdiler gelmeden tamamlanamaz. Mac için salt okunur bir envanter aracı hazırladım.
5. **PR #9'u ben yazdım; bağımsız değerlendiremem.**
   - Testleri temiz bir checkout'ta yeniden koştum: 78/78, probların 16'sı da reddedildi, rapor byte düzeyinde aynı.
   - Bu sonuçlar ana yolları kanıtlıyor, kenar durumları kanıtlamıyor.
6. **Ayrı AI ajanının saldırgan okuması 4 yüksek ve 10 orta bulgu çıkardı** (E §3; testler `qa-independent/` altında).
   - Atanmış sefere sonradan katılan rezervasyon hiç hesaplanmıyor; site ve AGOS payı kayboluyor.
   - Aynı mahsup iki kez kaydedilebiliyor.
   - Kiracı (site) bazında yetki yok.
   - Veritabanı şeması defter tablolarında 34 kural ihlalinin hepsini kabul ediyor.
   - Ayrıca: iade edilen tutar müşteri borcu görünüyor; ilk kapanış önceki haftayı atlayabiliyor; tarifeye 5. eleman eklenince 80 € geri geliyor; `NODE_ENV=prod` canlı kapıyı atlatıyor.
   - Bunların hepsini kendi yeniden koşumumla veya kodla doğruladım.
   - Benim öz değerlendirmem 10 alanda fazla iyimserdi. Yazanın kendi işini kabul edememesi kuralının neden gerekli olduğunu bu sonuç gösteriyor.
   - Faz 1'de düzeltme yapılmadı; düzeltme turu Codex'e önerildi (F2).

## Öncelik sırasıyla plan

1. **Yönetişim temeli** (kod yok): bağımsız inceleyiciyi ata, AI kimliklerini ayır, karar kimliği biçimini kabul et (H-1, H-2, H-3).
2. **Envanteri tamamla:** SEL-456 zip'ini repo'ya koy; Mac'te `tools/skill-inventory.mjs` çalıştır (H-7).
3. **Eski fiyat kuralını düzelt:**
   - Önce `agos-pricing-matrix`, sonra `agos-consortium-policy`.
   - Önce taban ölçümü (eski skill) alınır, sonra aday ölçülür (D).
4. **Haftalık kapanışı tek skill'de topla:** `agos-weekly-settlement` (B §3.3).
5. **`agos-governance`:**
   - Sağlayıcıdan bağımsız 2FA kuralı.
   - Tenant izolasyonu bölümü.
   - Otomatik mahsup cümlesinin kaldırılması.
6. **PR #9 düzeltme turu ve insan QA:**
   - F1–F14 Codex'te düzeltilir; Claude inceler.
   - `[RULE]` testleri yeşile dönünce insan inceleyici kabul kararını verir.
   - Kanonik kod kararı (H-4) da bu adımda.
   - Bu madde 3–5 ile paralel yürür.
7. **CRS staging, 2FA ve tenant modeli:** F3 → F4 → F5.
8. **Partner paneli ve pilot uydu site:** F6, F7.
9. **Reklam:** önce salt okunur ve sandbox; harcama yok (F8).
10. **Pilot:** 8 koşul + Owner LIVE GO. Ana site Next.js göçü ayrı hatta yürür (F9).

## İtirazlarım

1. **Bağımsız değerlendirme:** "78 testi bağımsız olarak yeniden değerlendir" isteğini tam karşılayamam, çünkü kodu ben yazdım. Yaptığım: yazar tekrarı ve ayrı AI ajanının okuması. Kabul insan inceleyicinin.
2. **Ortak kimlik:** Bugünkü düzende benim Linear yorumlarım ile Owner'ın kararları aynı hesaptan görünüyor. Konsey genişlemeden önce ayrılmalı.
3. **Reklam entegrasyonu erken:** tenant izolasyonu, kimlik ve rıza altyapısı olmadan başlamamalı. Skill taslağı olur, API işi olmaz.
4. **Next.js göçü kritik yolda olmamalı:** konsorsiyum pilotunu bekletmemeli.
5. **Değerlendirme bütçesi:** "Eğitim" koşumları ücretli; bütçe ve gizli test seti olmadan ölçüm güvenilir olmaz.

## Paket içeriği

| | Belge | Ek dosyalar |
| -- | -- | -- |
| A | [Skill envanteri ve çelişki raporu](./A-skill-envanteri-ve-celiskiler.md) | [`skills/inventory/2026-11-03-bulut-oturumu.json`](../../skills/inventory/2026-11-03-bulut-oturumu.json), [`tools/skill-inventory.mjs`](../../tools/skill-inventory.mjs) |
| B | [Geliştirilecek skill listesi ve öneriler](./B-skill-gelistirme-listesi.md) | [`skills/TEMPLATE-SKILL.md`](../../skills/TEMPLATE-SKILL.md) (10 zorunlu alan) |
| C | [Görev dağılımı, eksik roller, yetki riskleri](./C-ekip-gorev-dagilimi.md) | — |
| D | [Skill eğitim ve değerlendirme planı](./D-skill-egitim-degerlendirme-plani.md) | [`skills/evals/`](../../skills/evals/) (22 senaryo, 51 ölçüt; `claude plugin eval` biçimi) |
| E | [PR #9 bağımsız QA planı ve yeniden değerlendirme](./E-pr9-bagimsiz-qa-plani.md) | [`qa-independent/`](../../qa-independent/) (83 test, 34 SQL probu; 27 `[RULE]` testi bilerek kırmızı) |
| F, G | [Geliştirme sırası ve SEL-442 yol haritası](./F-G-gelistirme-sirasi-ve-yol-haritasi.md) | — |
| H | [Açık Owner kararları ve önerilerim](./H-owner-kararlari.md) | — |

## Bu oturumda yapılmayanlar

- Hiçbir skill değiştirilmedi, silinmedi veya kurulmadı.
- Uygulama kodu değişmedi. Eklenen tek araç salt okunur envanter betiği.
- Canlı rezervasyon, ödeme, reklam, CRS veya müşteri verisine dokunulmadı.
- Değerlendirme koşumu (ücretli model çalıştırması) yapılmadı; bütçe onayı bekliyor.

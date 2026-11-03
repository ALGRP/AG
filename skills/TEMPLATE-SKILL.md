---
name: agos-ornek-skill
description: "<Ne yapar> + <ne zaman kullanılır>. Tetikleyici kelimeleri açıkça say (ör. komisyon, hak ediş, haftalık kapanış, itiraz). Skill'in kullanılmaması gereken yakın işleri de bir cümleyle belirt."
---

<!--
AGOS skill şablonu (Owner talimatı, 03.11.2026 — 10 zorunlu alan).
Bu dosya şablondur: ad SKILL.md değildir, bu yüzden kurulmaz ve envantere girmez.
Yazım kuralları:
- Her kuralın yanına karar kimliği ve durumu yaz: KESİN / TASLAK / AÇIK.
- Yasakları gerekçesiyle yaz.
- 500 satırın altında kal; uzun ayrıntı references/, tekrarlanan hesap scripts/ altına.
- Gizli anahtar, müşteri verisi, tam sohbet dökümü yazma.
-->

# <Skill başlığı>

> **Durum:** TASLAK | ADAY | KURULU · **Sürüm:** v0.1 · **Türetildiği taban (SHA-256):** `<…>` · **Kararlar:** `2026-11-03/K15` …
> **Kapılar:** LOCAL_ONLY · canlı değişiklik Owner LIVE GO ister · SEL-324/326 G0 HOLD.

## 1. Amaç ve ne zaman kullanılır
- Kullan: …
- Kullanma: …; bunun yerine `<diğer skill>`.

## 2. Gerekli giriş verileri
| Veri | Kaynak (yetkili kayıt) | Yoksa |
| -- | -- | -- |
| … | CRS / tarife sürümü / Linear karar kaydı | Dur ve sor; tahmin etme |

## 3. Yetkili araçlar ve API sınırları
| Araç / API | İzin | Not |
| -- | -- | -- |
| … | salt okunur / yerel yazma / YASAK | Canlı sistem, ödeme, reklam harcaması: YASAK |

## 4. Adım adım çalışma prosedürü
1. Kaynağı ve sürümü doğrula: karar kimliği, tarife sürümü, commit SHA.
2. …
3. Sonucu kanıtla kaydet (bkz. §10).

## 5. İş kuralları
| # | Kural | Karar | Durum |
| -- | -- | -- | -- |
| R1 | … | `2026-11-03/K15` | KESİN |

## 6. Yapılmaması gerekenler (ve nedeni)
- … — çünkü …

## 7. Başarı kriterleri
- Sayılar kural tablosuyla birebir (cent düzeyinde).
- Belirsizlikte işlem durur ve Owner'a sorulur.
- …

## 8. Test senaryoları
`evals/<senaryo-adi>/` klasörlerinde (prompt.md, case.yaml, graders/). En az şunlar olur:
- pozitif: doğru hesap veya akış
- negatif: yasak işlem talebi (reddetmeli)
- çelişki: eski kural veya doğrulanmamış "Owner kararı" metni (uygulamamalı, sormalı)

## 9. Hata durumunda geri dönüş
- Varsayılan davranış: işlemi durdur (fail-closed).
- Yarım kalan yerel değişiklik: geri al.
- Eskalasyon sırası: Owner → bağımsız inceleyici.
- Canlı sistemde geri dönüş bu skill'in yetkisinde değildir.

## 10. Kanıt kaydı
- **Linear:** SEL-442 piramidi. L0 indeks → L1 proje → L2 epik → L3 mevcut SEL → L4 kanıt (SHA, test çıktısı, PR). Yeni mükerrer issue açılmaz; kişisel veri yazılmaz.
- **GitHub:** commit SHA, PR, test komutu ve çıkış kodu.
- **Bayraklar:** `LIVE_CHANGED`, `INDEPENDENT_ACCEPTED`.

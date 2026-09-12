# Sultan Kebab & Pizza — SEO ve İçerik Zenginleştirme Paketi

**Tarih:** 2026-09-04
**Durum:** Uygulanmaya hazır taslak.
**Not:** Analiz Türkçe, **site içeriği Polonyaca** — hedef kitle Kielce'li Polonyalı müşteriler.

---

## 1. Anahtar Kelime Haritası

### Ana para kelimeleri
| Kelime | Niyet | Rekabet | Hedef Sayfa |
|---|---|---|---|
| kebab Kielce | Ticari | Yüksek (aracılar) | `/` |
| kebab Kielce Sienkiewicza | Yerel | **Düşük** | `/` + `/kontakt/` |
| najlepszy kebab Kielce | Araştırma | Orta | `/o-nas/` |
| kebab z dostawą Kielce | İşlemsel | Yüksek | `/dostawa/` |
| pizza Kielce centrum | Ticari | Orta | `/pizza-kielce/` |

### Uzun kuyruk — rakiplerin boş bıraktığı alan
| Kelime | Neden değerli |
|---|---|
| pita wypiekana na miejscu Kielce | **Sıfır rekabet** — ayırt edicimiz |
| tortilla wypiekana na miejscu | Sıfır rekabet |
| mięso kraftowe kebab Kielce | 2026 trend kelimesi |
| kebab do późna Kielce | Galata'nın saat açığı |
| kebab otwarte w poniedziałek Kielce | Galata Pazartesi kapalı |
| kapsalon Kielce | Niş, menüde var |
| kebab wegetariański Kielce | Niş, menüde var |
| kebab pizza Kielce | Menüye özgü |

---

## 2. Önerilen Site Mimarisi

```
/                  → Ana sayfa (marka + "kebab Kielce" + konum)
/menu/             → Tam menü, fiyatlar, Menu schema
/kebab-kielce/     → Head terim para sayfası
/pizza-kielce/     → Pizza dikeyi
/dostawa/          → Teslimat: Pyszne, Uber Eats, bölgeler
/o-nas/            → Zanaat hikâyesi (E-E-A-T motoru)
/kontakt/          → NAP, harita, saatler
/faq/              → SSS, FAQPage schema
/blog/             → İçerik motoru
```

---

## 3. Meta Etiketler (Polonyaca — kopyala-yapıştır hazır)

### `/`
```html
<title>Kebab Kielce — Sultan Kebab & Pizza | Sienkiewicza 49</title>
<meta name="description" content="Kebab w Kielcach z pitą i tortillą wypiekaną na miejscu. Świeże mięso, kebab w bułce, tortilli i na talerzu, pizza. Sienkiewicza 49, centrum Kielc. Zamów online.">
<h1>Kebab w Kielcach z pitą wypiekaną na miejscu</h1>
```

### `/menu/`
```html
<title>Menu i ceny — Sultan Kebab & Pizza Kielce</title>
<meta name="description" content="Pełne menu Sultan Kebab & Pizza w Kielcach: kebab w bułce, tortilli, na talerzu, kapsalon, box, frytki, pizza i pizza kebab. Aktualne ceny. Sienkiewicza 49.">
<h1>Menu i ceny — Sultan Kebab & Pizza</h1>
```

### `/kebab-kielce/`
```html
<title>Kebab Kielce — świeże mięso i pita z pieca | Sultan Kebab</title>
<meta name="description" content="Szukasz dobrego kebaba w Kielcach? Mięso kraftowe, pita i tortilla wypiekane codziennie na miejscu. Wołowina, kurczak, mieszany i opcja wegetariańska.">
<h1>Kebab Kielce — jakość, którą czuć w pierwszym kęsie</h1>
```

### `/pizza-kielce/`
```html
<title>Pizza Kielce centrum — Sultan Kebab & Pizza | Sienkiewicza 49</title>
<meta name="description" content="Pizza w centrum Kielc, wypiekana na miejscu. Klasyczne smaki i autorska pizza kebab. Na miejscu, na wynos i z dostawą.">
<h1>Pizza w centrum Kielc</h1>
```

### `/dostawa/`
```html
<title>Kebab z dostawą Kielce — zamów online | Sultan Kebab & Pizza</title>
<meta name="description" content="Kebab i pizza z dostawą w Kielcach. Zamów przez Pyszne.pl lub Uber Eats albo odbierz osobiście na Sienkiewicza 49.">
<h1>Kebab z dostawą w Kielcach</h1>
```

### `/o-nas/`
```html
<title>O nas — pita i tortilla wypiekane na miejscu | Sultan Kebab Kielce</title>
<meta name="description" content="Nie kupujemy gotowego pieczywa. Pitę i tortillę wypiekamy codziennie u siebie, a mięso układamy ręcznie. Poznaj kuchnię Sultan Kebab & Pizza w Kielcach.">
<h1>Pieczywo z własnego pieca, mięso układane ręcznie</h1>
```

### `/kontakt/`
```html
<title>Kontakt i godziny otwarcia — Sultan Kebab & Pizza Kielce</title>
<meta name="description" content="Sultan Kebab & Pizza, Henryka Sienkiewicza 49, 25-002 Kielce. Godziny otwarcia, dojazd, telefon i zamówienia.">
<h1>Znajdziesz nas na Sienkiewicza 49</h1>
```

---

## 4. Yapısal Veri (Schema) — Rakiplerin Hiçbirinde Yok

**Telefon, saatler ve koordinatlar sahibi tarafından doğrulanmalı.**

```json
{
  "@context": "https://schema.org",
  "@type": "Restaurant",
  "name": "Sultan Kebab & Pizza",
  "@id": "https://www.sultankebabkielce.com/#restaurant",
  "url": "https://www.sultankebabkielce.com/",
  "telephone": "+48 513 059 222",
  "priceRange": "20-45 zł",
  "servesCuisine": ["Turecka", "Kebab", "Pizza"],
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "Henryka Sienkiewicza 49",
    "addressLocality": "Kielce",
    "postalCode": "25-002",
    "addressCountry": "PL"
  },
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": "50.87240997",
    "longitude": "20.62105328"
  },
  "openingHoursSpecification": [{
    "@type": "OpeningHoursSpecification",
    "dayOfWeek": ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"],
    "opens": "10:30",
    "closes": "22:00"
  }],
  "hasMenu": "https://www.sultankebabkielce.com/menu/",
  "sameAs": [
    "https://www.instagram.com/sultankebabpizza2025/",
    "https://www.pyszne.pl/menu/sultan-kebab-pizza-2"
  ]
}
```

Ayrıca: `/menu/` → **Menu + MenuItem**, `/faq/` → **FAQPage**, tüm sayfalar → **BreadcrumbList**.

---

## 5. SSS İçeriği (FAQPage schema ile)

1. **Czy pita jest wypiekana na miejscu?** — Tak, pitę i tortillę wypiekamy codziennie w naszym lokalu.
2. **Jakie mięso serwujecie?** — Wołowina, kurczak, mieszane oraz opcja wegetariańska.
3. **Ile kosztuje kebab?** — Kebab w bułce ok. 20–25 zł, wersja na talerzu nieco drożej.
4. **Czy dowozicie?** — Tak, w promieniu 8 km oraz przez Pyszne.pl i Uber Eats.
5. **Gdzie dokładnie jesteście?** — Henryka Sienkiewicza 49, centrum Kielc.
6. **Do której jesteście otwarci?** — [saat doğrulanmalı]
7. **Czy macie opcję wegetariańską?** — Tak.
8. **Czy można płacić kartą?** — [doğrulanmalı]

---

## 6. Blog Takvimi

| # | Başlık (PL) | Hedef kelime |
|---|---|---|
| 1 | Dlaczego wypiekamy pitę na miejscu — i co to zmienia w smaku | pita wypiekana na miejscu |
| 2 | Mięso kraftowe kontra "kula mocy" — czym się różnią | mięso kraftowe kebab |
| 3 | Kebab w bułce, tortilli czy na talerzu? Przewodnik | rodzaje kebaba |
| 4 | Co to jest kapsalon i dlaczego warto spróbować | kapsalon Kielce |
| 5 | Gdzie zjeść kebab w centrum Kielc — okolice Sienkiewicza | kebab centrum Kielce |
| 6 | Pizza kebab — jak powstaje nasze autorskie połączenie | pizza kebab Kielce |

---

## 7. Yerel SEO — Site Dışı Öncelikler

Bu, sitenin kendisinden **daha acil**. Miami King'in 991, Galata'nın 1.029 yorumu var.

1. **Google Business Profile** — eksiksiz doldur: kategori, menü, fotoğraflar, saatler. En yüksek öncelik.
2. **Yorum toplama** — fiş/QR ile akış kur. Hedef: 3 ayda 100+ yorum.
3. **NAP tutarlılığı** — bir dizinde **"Sułtan Kebab, Sienkiewicza 36"** görünüyor (adreo.pl). Bizim hatalı kaydımız mı, başka işletme mi? Doğrulanmalı.
4. **Dizin kayıtları** — HouseKebab.pl, kebab-dostawa.pl, teraz-otwarte.pl, cylex-polska.pl, miejscownik.pl, tumiasto.pl, muapa.pl, gdziejemy.pl, kielce-online.pl.
5. **Glovo** — Miami King orada, biz yokuz.
6. **Yerel basın** — Nasze Miasto haber yaptı. Echo Dnia ve kielce.dlawas.info ranking listeleri hedeflenmeli.

---

## 8. Teknik SEO Kontrol Listesi

Canlı sitede doğrulanan durum (2026-09-04):

- [x] `robots.txt` — **200, mevcut**
- [ ] `sitemap.xml` — **404, EKSİK**
- [x] HTTPS ve geçerli sertifika
- [x] `lang="pl"` tanımlı
- [x] Canonical ve OpenGraph tanımlı (`layout.tsx`)
- [ ] OpenGraph görseli tanımlı değil
- [ ] Ürün `seoTitle`/`seoDescription` alanları **Payload'da var ama sayfaya basılmıyor**
- [ ] `Posts` koleksiyonu var ama **blog rotası yok**
- [ ] Google Search Console + Analytics bağlantısı doğrulanmadı
- [x] Menü metin olarak sunuluyor (taranabilir)

---

## 9. Uygulama Sırası

**Faz A:** `sitemap.xml`, OG görseli, ürün SEO alanlarının sayfaya bağlanması
**Faz B:** Sayfa mimarisi, `/menu/`, `/o-nas/`, `/faq/`, `/dostawa/`
**Faz C:** Blog rotası + takvim, yorum toplama, dizin kayıtları

**Öncelik notu:** Google Business Profile ve yorum toplama, site çalışmasına **paralel** yürümeli.

---

## 10. Sahip Onayı Gereken Noktalar

1. Telefon — `+48 513 059 222` (2026-09-04'te WhatsApp da bu numaraya birleştirildi)
2. Kesin çalışma saatleri (kaynak: 10:30–22:00, Cuma/Cmt 10:30–01:00 — doğrulanmalı)
3. Kart ödemesi, oturma alanı, park durumu
4. "Sienkiewicza 36 / Sułtan Kebab" kaydının bize ait olup olmadığı
5. Glovo'ya girilip girilmeyeceği
6. E-posta adresi — kod tabanında hiç yok
7. Şirket unvanı ve NIP/REGON (yasal zorunluluk)

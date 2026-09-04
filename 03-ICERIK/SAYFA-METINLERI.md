# Sultan Kebab & Pizza — Sayfa Metinleri ve SEO Paketi

**Tarih:** 2026-09-04
**Dil:** Site metinleri **Polonyaca** (hedef kitle Kielce), açıklamalar Türkçe.
**Kaynak veriler:** Bu oturumda canlı sistemden doğrulanan değerler kullanıldı.

> ⚠️ **Çalışma saatleri hiçbir metne yazılmadı.** Google İşletme kaydınızdaki
> saatler teyit edilmedi. Metinlerde `[GODZINY]` yer tutucusu bırakıldı —
> saatler gelince tek seferde doldurulacak.

---

## Kullanılan doğrulanmış veriler

| Alan | Değer | Kaynak |
|---|---|---|
| Adres | Henryka Sienkiewicza 49, 25-002 Kielce | JSON-LD + canlı site |
| Telefon / WhatsApp | +48 513 059 222 | 2026-09-04'te birleştirildi |
| Teslimat yarıçapı | 8 km | `orders/create`, `delivery/quote` |
| Teslimat ücreti | 10 zł | aynı |
| Minimum sipariş | 40 zł | aynı |
| Ücretsiz teslimat | 100 zł üzeri | aynı |
| Ürün sayısı | 42, 10 kategori | canlı menü API |
| Fiyat aralığı | 6–45 zł | canlı menü API |
| Koordinatlar | 50.87240997, 20.62105328 | `maps/config` |

Kategoriler: kebab w bułce (3), kebab w picie (4), tortilla/durum (4),
kebab na frytkach (4), box i kapsalon (6), pizza (10), sałatki i meze (4),
napoje (7).

---

## 1. Ana sayfa `/` — mevcut sayfanın zenginleştirilmesi

Ana sayfa şu an tek sayfalık vitrin. Aşağıdaki metin, menünün **üstüne** kısa bir
tanıtım bloğu, **altına** ise güven ve bilgi bloğu olarak eklenmeli. Amaç:
Google'ın sayfayı "ince içerik" saymaması ve "pita wypiekana na miejscu"
sorgusunda eşleşmesi.

### Hero altı — kısa tanıtım (menünün üstüne)

```html
<section class="sk-intro">
  <h2>Kebab w Kielcach, w którym pieczywo powstaje u nas</h2>
  <p>
    Większość lokali kupuje gotową pitę z hurtowni. My wypiekamy ją codziennie
    na miejscu — tak samo jak tortillę. Dzięki temu pieczywo trafia do Ciebie
    ciepłe i miękkie, a nie odgrzane po tygodniu w zamrażarce.
  </p>
  <p>
    Mięso układamy ręcznie, warstwa po warstwie. To dłuższa robota niż gotowy
    blok z hurtowni, ale różnicę czuć już przy pierwszym kęsie.
  </p>
  <p>
    Jesteśmy przy <strong>Henryka Sienkiewicza 49</strong>, w samym centrum
    Kielc. Zamów z dostawą w promieniu 8 km albo odbierz osobiście bez kolejki.
  </p>
</section>
```

### Menü altı — güven bloğu

```html
<section class="sk-trust">
  <h2>Dlaczego warto</h2>
  <ul>
    <li><strong>Pita i tortilla z własnego pieca</strong> — wypiekane codziennie na miejscu.</li>
    <li><strong>Mięso układane ręcznie</strong> — wołowina, kurczak, mieszane lub opcja wegetariańska.</li>
    <li><strong>Centrum Kielc</strong> — Sienkiewicza 49, dwa kroki od deptaka.</li>
    <li><strong>Dostawa i odbiór</strong> — dowozimy w promieniu 8 km, minimum 40 zł, gratis od 100 zł.</li>
    <li><strong>Szeroki wybór</strong> — kebab w bułce, picie, tortilli, na frytkach, w boxie, kapsalon, pizza, sałatki i meze.</li>
  </ul>
</section>
```

---

## 2. `/o-nas/` — zanaat hikâyesi

Bu sayfa **en değerli olanı.** Rakiplerin hiçbirinde bu hikâye yok ve 2026
trendi (elle dizilen taze et) tam buna denk geliyor. E-E-A-T sinyali de burada
üretiliyor.

```html
<title>O nas — pita i tortilla wypiekane na miejscu | Sultan Kebab Kielce</title>
<meta name="description" content="Nie kupujemy gotowego pieczywa. Pitę i tortillę wypiekamy codziennie u siebie, a mięso układamy ręcznie. Poznaj kuchnię Sultan Kebab & Pizza przy Sienkiewicza 49 w Kielcach.">
<h1>Pieczywo z własnego pieca, mięso układane ręcznie</h1>
```

**Gövde metni:**

> Kebab w Polsce ma opinię jedzenia, o którym lepiej nie myśleć za długo. Chcemy
> to zmienić — przynajmniej w Kielcach.
>
> **Pieczywo.** Prawie każdy lokal kupuje pitę i tortillę w hurtowni: mrożone,
> pakowane, odgrzewane. My wypiekamy je codziennie na miejscu, w naszym lokalu
> przy Sienkiewicza 49. To znaczy, że pita, którą dostajesz, powstała tego
> samego dnia, kilka metrów od miejsca, w którym stoisz. Jest miękka w środku
> i chrupiąca na brzegu — a nie gumowata.
>
> **Mięso.** Nie zamawiamy gotowego bloku. Mięso układamy ręcznie, warstwa po
> warstwie, i pieczemy na pionowym rożnie. Ta metoda zajmuje więcej czasu i
> kosztuje więcej pracy, ale daje strukturę, której nie da się podrobić —
> kawałki mięsa, a nie jednolita masa.
>
> **Wybór.** Wołowina, kurczak, mieszane albo wersja wegetariańska. Kebab w
> bułce, w picie, w tortilli, na frytkach, w boxie albo jako kapsalon. Do tego
> pizza wypiekana u nas — z autorską pizzą kebab włącznie. Sałatki i meze, jeśli
> masz ochotę na coś lżejszego.
>
> **Gdzie nas znaleźć.** Henryka Sienkiewicza 49, w samym centrum Kielc. Możesz
> zjeść na miejscu, odebrać na wynos albo zamówić z dostawą w promieniu 8 km.
>
> Zadzwoń: **+48 513 059 222**

---

## 3. `/kebab-kielce/` — ana para sayfası

```html
<title>Kebab Kielce — świeże mięso i pita z pieca | Sultan Kebab</title>
<meta name="description" content="Szukasz dobrego kebaba w Kielcach? Pita i tortilla wypiekane codziennie na miejscu, mięso układane ręcznie. Wołowina, kurczak, mieszane, opcja wege. Sienkiewicza 49.">
<h1>Kebab Kielce — jakość, którą czuć w pierwszym kęsie</h1>
```

**Gövde metni:**

> Dobry kebab zaczyna się od dwóch rzeczy: pieczywa i mięsa. Obie robimy u
> siebie.
>
> **Pita i tortilla wypiekane na miejscu.** Codziennie, w naszym lokalu przy
> Sienkiewicza 49. Żadnego mrożonego pieczywa z hurtowni.
>
> **Mięso układane ręcznie.** Warstwa po warstwie, pieczone na pionowym rożnie.
>
> ### W czym podajemy
>
> - **Kebab w bułce** — klasyka, wersja na szybko.
> - **Kebab w picie** — nasze pieczywo, świeżo z pieca.
> - **Tortilla / durum** — zawijana, wygodna na wynos.
> - **Kebab na frytkach** — dla większego głodu.
> - **Box** — mięso, frytki, sos, surówka.
> - **Kapsalon** — holenderska klasyka: frytki, mięso, ser, sos, zapiekane.
>
> ### Mięso do wyboru
>
> Wołowina · kurczak · mieszane · opcja wegetariańska
>
> ### Ceny
>
> Kebab w bułce zaczyna się od ok. 20 zł, wersje na talerzu i boxy nieco
> drożej. Pełne, aktualne ceny znajdziesz w [menu](/#menu).
>
> ### Dostawa czy odbiór?
>
> Dowozimy w promieniu **8 km** od lokalu. Minimalne zamówienie **40 zł**,
> koszt dostawy **10 zł**, a przy zamówieniu od **100 zł dostawa jest gratis**.
> Możesz też odebrać osobiście przy Sienkiewicza 49 — bez kolejki, gdy
> zamówienie będzie gotowe.

---

## 4. `/pizza-kielce/`

```html
<title>Pizza Kielce centrum — wypiekana na miejscu | Sultan Kebab & Pizza</title>
<meta name="description" content="Pizza w centrum Kielc, wypiekana u nas. Klasyczne smaki i autorska pizza kebab. Na miejscu, na wynos i z dostawą w promieniu 8 km. Sienkiewicza 49.">
<h1>Pizza w centrum Kielc</h1>
```

**Gövde metni:**

> Ten sam piec, w którym powstaje nasza pita, wypieka też pizzę. Ciasto
> przygotowujemy u siebie, a pizzę pieczemy dopiero po Twoim zamówieniu —
> dlatego trafia do Ciebie gorąca, a nie odgrzewana.
>
> W menu znajdziesz klasyki oraz **pizzę kebab** — nasze autorskie połączenie
> dwóch rzeczy, które robimy najlepiej: ciasta z pieca i mięsa z rożna.
>
> Pizzę zamówisz z dostawą w promieniu 8 km albo odbierzesz osobiście przy
> Sienkiewicza 49. Ceny zaczynają się od ok. 25 zł — [zobacz pełne menu](/#menu).

---

## 5. `/dostawa/`

```html
<title>Kebab z dostawą Kielce — zamów online | Sultan Kebab & Pizza</title>
<meta name="description" content="Kebab i pizza z dostawą w Kielcach. Promień 8 km, minimum 40 zł, dostawa 10 zł, gratis od 100 zł. Zamów online lub odbierz przy Sienkiewicza 49.">
<h1>Kebab z dostawą w Kielcach</h1>
```

**Gövde metni:**

> ### Zasady dostawy
>
> | | |
> |---|---|
> | Promień dostawy | 8 km od Sienkiewicza 49 |
> | Minimalne zamówienie | 40 zł |
> | Koszt dostawy | 10 zł |
> | Dostawa gratis | od 100 zł |
>
> Adres sprawdzamy podczas składania zamówienia — jeśli jesteś poza strefą,
> dowiesz się od razu, zanim zapłacisz.
>
> ### Gdzie zamówić
>
> Najtaniej i najszybciej — **bezpośrednio u nas**, przez [menu na tej
> stronie](/#menu). Zamówienie trafia prosto do naszej kuchni.
>
> Jesteśmy też na **Pyszne.pl** i **Uber Eats**, jeśli wolisz swoją zwykłą
> aplikację.
>
> ### Wolisz odebrać?
>
> Zamów wcześniej i odbierz przy Sienkiewicza 49, gdy będzie gotowe — bez
> kolejki i bez kosztu dostawy.
>
> Pytania? Zadzwoń: **+48 513 059 222**

---

## 6. `/kontakt/`

```html
<title>Kontakt i godziny otwarcia — Sultan Kebab & Pizza Kielce</title>
<meta name="description" content="Sultan Kebab & Pizza, Henryka Sienkiewicza 49, 25-002 Kielce. Telefon +48 513 059 222. Godziny otwarcia, dojazd i zamówienia online.">
<h1>Znajdziesz nas na Sienkiewicza 49</h1>
```

**Gövde metni:**

> **Adres**
> Henryka Sienkiewicza 49
> 25-002 Kielce
>
> **Telefon i WhatsApp**
> +48 513 059 222
>
> **Godziny otwarcia**
> `[GODZINY]` ← Google İşletme kaydından doldurulacak
>
> **Jak dojechać**
> Jesteśmy w centrum, przy głównym deptaku Kielc. Dojdziesz pieszo z Rynku w
> kilka minut.
>
> **Zamówienia**
> Online przez [nasze menu](/#menu), telefonicznie, albo przez Pyszne.pl i
> Uber Eats.
>
> **Znajdź nas w sieci**
> Instagram · TikTok · Facebook

---

## 7. `/faq/` — SSS (FAQPage schema ile birlikte)

Sorular Polonyaca, cevaplar kısa ve doğrudan. AI aramada (ChatGPT, Gemini,
Perplexity) alıntılanabilir olması için bu format önemli.

| Soru | Cevap |
|---|---|
| Czy pita jest wypiekana na miejscu? | Tak. Pitę i tortillę wypiekamy codziennie w naszym lokalu przy Sienkiewicza 49. |
| Jakie mięso serwujecie? | Wołowinę, kurczaka, mieszane oraz opcję wegetariańską. |
| Ile kosztuje kebab? | Kebab w bułce od ok. 20 zł. Pełne ceny w menu. |
| Czy dowozicie? | Tak, w promieniu 8 km. Minimum 40 zł, dostawa 10 zł, gratis od 100 zł. |
| Gdzie dokładnie jesteście? | Henryka Sienkiewicza 49, 25-002 Kielce — w centrum miasta. |
| Do której jesteście otwarci? | `[GODZINY]` |
| Czy macie opcję wegetariańską? | Tak, kebab wegetariański jest w stałym menu. |
| Czy można płacić kartą? | `[ÖDEME — teyit bekliyor]` |
| Czy można zamówić przez Pyszne.pl? | Tak, jesteśmy na Pyszne.pl i Uber Eats. Bezpośrednio u nas jest jednak taniej. |
| Czy można odebrać osobiście? | Tak. Zamów wcześniej i odbierz bez kolejki. |

---

## 8. Sayfa yayına alındıktan sonraki sitemap

Yeni sayfalar canlıya çıkınca `03-ICERIK/sitemap.xml` bunlarla genişletilmeli.
**Sayfa gerçekten yayında değilse URL'yi eklemeyin** — 404 veren bir sitemap
zarar verir.

```xml
<url><loc>https://www.sultankebabkielce.com/o-nas/</loc><priority>0.8</priority></url>
<url><loc>https://www.sultankebabkielce.com/kebab-kielce/</loc><priority>0.9</priority></url>
<url><loc>https://www.sultankebabkielce.com/pizza-kielce/</loc><priority>0.8</priority></url>
<url><loc>https://www.sultankebabkielce.com/dostawa/</loc><priority>0.7</priority></url>
<url><loc>https://www.sultankebabkielce.com/kontakt/</loc><priority>0.7</priority></url>
<url><loc>https://www.sultankebabkielce.com/faq/</loc><priority>0.6</priority></url>
```

---

## 9. Uygulama sırası

**Adım 1 — bugün, risksiz.** `sitemap.xml` dosyasını sunucuda `public/` altına
koyun, rebuild edin, Search Console'a gönderin.

**Adım 2 — saatler gelince.** JSON-LD saatleri + `priceRange` + `geo` +
`paymentAccepted` düzeltmesi, ve `storefront.html` içindeki
`storeConfig.openingHours` bloğunun aynı değerlere hizalanması.

**Adım 3 — ana sayfa zenginleştirmesi.** Bölüm 1'deki iki blok mevcut
`storefront.html`'e eklenir. Yeni sayfa gerektirmez, en hızlı SEO kazancı.

**Adım 4 — yeni sayfalar.** `/o-nas/` önce (en değerli içerik), sonra
`/kebab-kielce/`, `/pizza-kielce/`, `/dostawa/`, `/kontakt/`, `/faq/`.
Her sayfa yayına girdikçe sitemap genişletilir.

**Adım 5 — yasal sayfalar.** Gizlilik, çerez, şartlar. Şirket unvanı ve
NIP/REGON gerekiyor; bu bilgiler gelmeden yazılamaz.

---

## 10. Hâlâ eksik bilgiler

1. **Çalışma saatleri** — Google İşletme kaydından. Üç metinde yer tutucu var.
2. **Ödeme yöntemleri** — kart/BLIK geçiyor mu? SSS'de ve JSON-LD'de gerekli.
3. **Şirket unvanı + NIP/REGON** — yasal sayfalar için.
4. **E-posta** — kod tabanında hiç yok, iletişim sayfasına gerekli.

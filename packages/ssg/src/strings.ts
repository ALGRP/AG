// Arayüz metinleri. Yeni dil yalnız gerçek yerelleştirme ile eklenir (toplu otomatik çeviri yok).
const en = {
  bookTitle: "Book your transfer",
  shuttle: "Shared shuttle",
  private: "Private transfer",
  vip: "VIP transfer",
  route: "Route",
  pickup: "Pick-up (airport, hotel or address)",
  dropoff: "Drop-off",
  pickupAt: "Date and time",
  passengers: "Passengers",
  returnAt: "Return date and time (optional)",
  flightNo: "Flight number (optional)",
  name: "Full name",
  email: "Email",
  phone: "Phone (with country code)",
  notes: "Notes (optional)",
  consent: "I agree that my details are used to process this booking request.",
  submit: "Send booking request",
  sending: "Sending…",
  priceFrom: "Price for your group",
  successShuttle: "Request received. Our operations team will confirm your seat.",
  successPrivate: "Request received. The operator will send you a quote.",
  yourRef: "Your booking code",
  yourToken: "Your access code (keep it private)",
  error: "Something went wrong. Please check the form or contact us on WhatsApp.",
  noJs: "JavaScript is off. Please book via WhatsApp:",
  lookupTitle: "Check your booking",
  lookupRef: "Booking code",
  lookupToken: "Access code",
  lookupSubmit: "Check status",
  lookupNotFound: "No booking found for this code.",
  reviewsTitle: "What travellers say",
  whatsapp: "WhatsApp",
  home: "Home",
  status: "Status",
};

type Strings = typeof en;

const tr: Strings = {
  bookTitle: "Transferinizi ayırtın",
  shuttle: "Paylaşımlı shuttle",
  private: "Özel transfer",
  vip: "VIP transfer",
  route: "Hat",
  pickup: "Alış noktası (havalimanı, otel veya adres)",
  dropoff: "Bırakış noktası",
  pickupAt: "Tarih ve saat",
  passengers: "Kişi sayısı",
  returnAt: "Dönüş tarihi ve saati (isteğe bağlı)",
  flightNo: "Uçuş numarası (isteğe bağlı)",
  name: "Ad soyad",
  email: "E-posta",
  phone: "Telefon (ülke koduyla)",
  notes: "Notlar (isteğe bağlı)",
  consent: "Bilgilerimin bu rezervasyon talebinin işlenmesi için kullanılmasını kabul ediyorum.",
  submit: "Rezervasyon talebini gönder",
  sending: "Gönderiliyor…",
  priceFrom: "Grubunuz için fiyat",
  successShuttle: "Talebiniz alındı. Operasyon ekibimiz koltuğunuzu onaylayacak.",
  successPrivate: "Talebiniz alındı. Operatör size fiyat teklifi gönderecek.",
  yourRef: "Rezervasyon kodunuz",
  yourToken: "Erişim kodunuz (kimseyle paylaşmayın)",
  error: "Bir sorun oluştu. Formu kontrol edin veya WhatsApp'tan bize yazın.",
  noJs: "JavaScript kapalı. Lütfen WhatsApp üzerinden rezervasyon yapın:",
  lookupTitle: "Rezervasyonumu sorgula",
  lookupRef: "Rezervasyon kodu",
  lookupToken: "Erişim kodu",
  lookupSubmit: "Durumu göster",
  lookupNotFound: "Bu koda ait rezervasyon bulunamadı.",
  reviewsTitle: "Misafirlerimiz ne diyor",
  whatsapp: "WhatsApp",
  home: "Ana sayfa",
  status: "Durum",
};

const de: Strings = {
  ...en,
  bookTitle: "Transfer buchen",
  shuttle: "Shuttle (geteilt)",
  private: "Privattransfer",
  vip: "VIP-Transfer",
  route: "Strecke",
  pickup: "Abholung (Flughafen, Hotel oder Adresse)",
  dropoff: "Ziel",
  pickupAt: "Datum und Uhrzeit",
  passengers: "Personen",
  returnAt: "Rückfahrt (optional)",
  flightNo: "Flugnummer (optional)",
  name: "Vor- und Nachname",
  email: "E-Mail",
  phone: "Telefon (mit Ländervorwahl)",
  notes: "Anmerkungen (optional)",
  consent: "Ich willige ein, dass meine Angaben zur Bearbeitung dieser Buchungsanfrage verwendet werden.",
  submit: "Buchungsanfrage senden",
  sending: "Wird gesendet…",
  priceFrom: "Preis für Ihre Gruppe",
  successShuttle: "Anfrage erhalten. Unser Team bestätigt Ihren Platz.",
  successPrivate: "Anfrage erhalten. Sie erhalten ein Angebot.",
  yourRef: "Ihr Buchungscode",
  yourToken: "Ihr Zugangscode (bitte geheim halten)",
  error: "Etwas ist schiefgelaufen. Bitte prüfen Sie das Formular oder schreiben Sie uns per WhatsApp.",
  noJs: "JavaScript ist deaktiviert. Bitte buchen Sie per WhatsApp:",
  lookupTitle: "Buchung prüfen",
  lookupRef: "Buchungscode",
  lookupToken: "Zugangscode",
  lookupSubmit: "Status anzeigen",
  lookupNotFound: "Keine Buchung zu diesem Code gefunden.",
  reviewsTitle: "Das sagen unsere Gäste",
  home: "Startseite",
};

const TABLE: Record<string, Strings> = { en, tr, de };

export function t(locale: string): Strings {
  return TABLE[locale] ?? en;
}

/** Marka beyanı (AGNET-SEO §2) — yalnız ownership = "ag_brand" sitelerde. */
export function brandStatement(locale: string, brand: string): { before: string; link: string; after: string } {
  switch (locale) {
    case "de":
      return { before: `${brand} ist eine Marke der `, link: "Alanya Group", after: ". Die Transfers werden von der Alanya Group (Alanya, Türkei) durchgeführt." };
    case "tr":
      return { before: `${brand}, bir `, link: "Alanya Group", after: " markasıdır. Transferler Alanya Group tarafından gerçekleştirilir." };
    case "ru":
      return { before: `${brand} — бренд `, link: "Alanya Group", after: ". Трансферы выполняет Alanya Group (Аланья, Турция)." };
    default:
      return { before: `${brand} is an `, link: "Alanya Group", after: " brand. Transfers are operated by Alanya Group, Alanya, Türkiye." };
  }
}

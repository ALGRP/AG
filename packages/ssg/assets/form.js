// Rezervasyon ve sorgulama formları. Bağımlılık yok; sayfa render'ını engellemez (defer).
(function () {
  "use strict";
  var form = document.getElementById("booking-form");
  var lookup = document.getElementById("lookup-form");
  function t(el, key) { return el.getAttribute("data-t-" + key) || key; }
  function show(el, text) { el.textContent = text; }
  function newKey() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return String(Date.now()) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  }
  function money(m, locale) {
    try { return new Intl.NumberFormat(locale, { style: "currency", currency: m.currency }).format(m.amountMinor / 100); }
    catch (e) { return (m.amountMinor / 100).toFixed(2) + " " + m.currency; }
  }

  if (form) {
    var api = form.getAttribute("data-api");
    var locale = form.getAttribute("data-locale");
    var out = form.querySelector(".result");
    var priceEl = form.querySelector(".price");
    var routeRow = form.querySelector("[data-for=shuttle]");
    var returnRow = form.querySelector("[data-for=private]");
    var key = newKey();

    function product() { var c = form.querySelector("input[name=product]:checked"); return c ? c.value : "private"; }
    function sync() {
      var p = product();
      if (routeRow) routeRow.hidden = p !== "shuttle";
      if (returnRow) returnRow.hidden = p === "shuttle";
      quote();
    }
    function quote() {
      if (!priceEl) return;
      priceEl.textContent = "";
      if (product() !== "shuttle") return;
      var route = form.elements.routeCode && form.elements.routeCode.value;
      var at = form.elements.pickupAt.value;
      var pax = form.elements.passengers.value;
      if (!route || !at || !pax) return;
      fetch(api + "/v1/public/shuttle-quote?route=" + encodeURIComponent(route) + "&date=" + encodeURIComponent(at.slice(0, 10)) + "&passengers=" + encodeURIComponent(pax))
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (q) {
          if (!q) return;
          priceEl.textContent = q.requiresApproval ? t(form, "needs-approval") : t(form, "price") + ": " + money(q, locale);
        })
        .catch(function () {});
    }
    form.addEventListener("change", sync);
    form.addEventListener("input", function () { key = newKey(); });
    sync();

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var f = form.elements;
      var p = product();
      var body = {
        siteId: form.getAttribute("data-site"),
        product: p,
        pickup: f.pickup.value,
        dropoff: f.dropoff.value,
        pickupAt: f.pickupAt.value,
        passengers: Number(f.passengers.value),
        flightNo: f.flightNo.value,
        notes: f.notes.value,
        website: f.website.value,
        consent: f.consent.checked,
        customer: { name: f.name.value, email: f.email.value, phone: f.phone.value, locale: locale }
      };
      if (p === "shuttle") body.routeCode = f.routeCode.value;
      else if (f.returnPickupAt && f.returnPickupAt.value) body.returnPickupAt = f.returnPickupAt.value;
      var ts = form.querySelector("[name=cf-turnstile-response]");
      if (ts && ts.value) body.humanToken = ts.value;
      else {
        // A missing or expired site challenge must not be silently submitted as a valid booking.
        show(out, t(form, "error"));
        return;
      }
      function resetChallenge() {
        if (window.turnstile && typeof window.turnstile.reset === "function") {
          window.turnstile.reset();
        }
      }
      var btn = form.querySelector("button[type=submit]");
      btn.disabled = true;
      show(out, t(form, "sending"));
      fetch(api + "/v1/public/bookings", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": key },
        body: JSON.stringify(body)
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
        .then(function (res) {
          btn.disabled = false;
          if (!res.ok) { resetChallenge(); show(out, t(form, "error")); return; }
          var b = res.body;
          var lead = b.next === "price_requires_approval" ? t(form, "ok-approval") : (b.product === "shuttle" ? t(form, "ok-shuttle") : t(form, "ok-private"));
          show(out, lead + " " +
            t(form, "ref") + ": " + b.ref + " · " + t(form, "token") + ": " + b.lookupToken +
            (b.price ? " · " + money(b.price, locale) : ""));
          form.querySelectorAll("input:not([type=radio]):not([type=checkbox]),textarea").forEach(function (i) { if (i.name !== "passengers") i.value = ""; });
          key = newKey();
        })
        .catch(function () { btn.disabled = false; resetChallenge(); show(out, t(form, "error")); });
    });
  }

  if (lookup) {
    var lapi = lookup.getAttribute("data-api");
    var lout = lookup.querySelector(".result");
    lookup.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var ref = lookup.elements.ref.value.trim().toUpperCase();
      fetch(lapi + "/v1/public/bookings/" + encodeURIComponent(ref), { headers: { "x-lookup-token": lookup.elements.token.value.trim() } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (b) {
          if (!b) { show(lout, t(lookup, "notfound")); return; }
          show(lout, b.ref + " · " + t(lookup, "status") + ": " + b.status + " · " + b.pickupAt + " · " + b.pickup + " → " + b.dropoff);
        })
        .catch(function () { show(lout, t(lookup, "notfound")); });
    });
  }
})();

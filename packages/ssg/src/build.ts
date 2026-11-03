import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { formatMoney, money, type ShuttleTariffVersion } from "@ag/core";
import { parseSiteConfig, type SiteConfig } from "./config.ts";
import { escapeHtml, parseFrontmatter, renderMarkdown } from "./markdown.ts";
import { brandStatement, t } from "./strings.ts";

const ASSETS = resolve(import.meta.dirname, "../assets");
const AG_ORG_ID = "https://www.alanyagroup.com/#organization";
const AG_HOME = "https://www.alanyagroup.com/";

export type PageType = "home" | "route" | "guide" | "page" | "lookup";
export type FormKind = "shuttle" | "private" | "both" | "none";

export interface Page {
  readonly locale: string;
  readonly path: string;
  readonly title: string;
  readonly description: string;
  readonly h1: string;
  readonly type: PageType;
  readonly translationKey: string;
  readonly nav: boolean;
  readonly navLabel: string;
  readonly updated: string;
  readonly form: FormKind;
  readonly body: string;
  readonly source: string;
}

export interface Review {
  readonly author: string;
  readonly rating: number;
  readonly date: string;
  readonly text: string;
  readonly lang: string;
  /** Yalnız merkezden doğrulanmış (tamamlanmış yolculuğa bağlı) yorumlar yayımlanır. */
  readonly verified: true;
}

export interface BuildOptions {
  readonly siteDir: string;
  readonly outDir: string;
  /** Merkez API kökü, ör. https://api.agos.example */
  readonly apiBase: string;
  readonly shuttleTariff?: ShuttleTariffVersion;
}

export interface BuildReport {
  readonly siteId: string;
  readonly pages: number;
  readonly indexable: boolean;
  readonly warnings: string[];
  readonly files: string[];
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

export function pathFor(site: SiteConfig, locale: string, slugPath: string): string {
  const clean = slugPath.replace(/(^|\/)index$/, "").replace(/^\/+|\/+$/g, "");
  const prefix = locale === site.defaultLocale ? "" : `/${locale}`;
  return clean === "" ? `${prefix}/` : `${prefix}/${clean}/`;
}

export function loadPages(site: SiteConfig, siteDir: string, errors: string[]): Page[] {
  const pages: Page[] = [];
  for (const locale of site.locales) {
    const base = join(siteDir, "content", locale);
    for (const file of walk(base).filter((f) => f.endsWith(".md"))) {
      const rel = relative(base, file).split(sep).join("/").replace(/\.md$/, "");
      const { data, body } = parseFrontmatter(readFileSync(file, "utf8"));
      const req = (k: string): string => {
        const v = data[k];
        if (typeof v !== "string" || v === "") {
          errors.push(`${file}: missing frontmatter "${k}"`);
          return "";
        }
        return v;
      };
      if (data.draft === true) continue;
      const type = (data.type ?? "page") as PageType;
      if (!["home", "route", "guide", "page", "lookup"].includes(type)) errors.push(`${file}: bad type ${type}`);
      const form = (data.form ?? (type === "home" || type === "route" ? "both" : "none")) as FormKind;
      pages.push({
        locale,
        path: pathFor(site, locale, rel),
        title: req("title"),
        description: req("description"),
        h1: req("h1"),
        type,
        translationKey: typeof data.translationKey === "string" ? data.translationKey : rel,
        nav: data.nav === true,
        navLabel: typeof data.navLabel === "string" ? data.navLabel : (data.h1 as string) ?? rel,
        updated: req("updated"),
        form,
        body,
        source: file,
      });
    }
  }
  return pages;
}

function absUrl(site: SiteConfig, path: string): string {
  return `https://${site.domain}${path}`;
}

function waLink(site: SiteConfig, page: Page): string {
  const msg = `${site.brand} – ${absUrl(site, page.path)}`;
  return `https://wa.me/${site.contact.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`;
}

function jsonLd(site: SiteConfig, page: Page, crumbs: Page[]): unknown[] {
  const siteId = `https://${site.domain}/#website`;
  const out: unknown[] = [];
  const org =
    site.ownership === "ag_brand"
      ? { "@id": AG_ORG_ID }
      : {
          "@type": "TravelAgency",
          "@id": `https://${site.domain}/#organization`,
          name: site.legal.companyName,
          url: `https://${site.domain}/`,
          email: site.contact.email,
          telephone: site.contact.phone ?? site.contact.whatsapp,
        };
  if (page.type === "home") {
    out.push({
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": siteId,
      name: site.brand,
      url: `https://${site.domain}/`,
      inLanguage: page.locale,
      publisher: site.ownership === "ag_brand" ? { "@id": AG_ORG_ID } : { "@id": `https://${site.domain}/#organization` },
    });
    if (site.ownership === "partner") out.push({ "@context": "https://schema.org", ...org });
  }
  if (page.type === "route") {
    out.push({
      "@context": "https://schema.org",
      "@type": "Service",
      serviceType: "Airport transfer",
      name: page.h1,
      url: absUrl(site, page.path),
      provider: site.ownership === "ag_brand" ? { "@id": AG_ORG_ID } : { "@id": `https://${site.domain}/#organization` },
    });
  }
  if (crumbs.length > 1) {
    out.push({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: crumbs.map((c, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: c.navLabel,
        item: absUrl(site, c.path),
      })),
    });
  }
  // Bilerek yok: aggregateRating / Review şeması (uydurma puan yasağı) ve sayfada görünmeyen fiyat.
  return out;
}

function breadcrumbs(page: Page, byPath: ReadonlyMap<string, Page>): Page[] {
  const segs = page.path.split("/").filter(Boolean);
  const chain: Page[] = [];
  for (let i = 0; i <= segs.length; i++) {
    const p = i === 0 ? "/" : `/${segs.slice(0, i).join("/")}/`;
    const hit = byPath.get(p);
    if (hit) chain.push(hit);
  }
  return chain;
}

function bookingForm(site: SiteConfig, page: Page, apiBase: string): string {
  if (page.form === "none") return "";
  const s = t(page.locale);
  const products: Array<[string, string]> = [];
  if (page.form === "shuttle" || page.form === "both") products.push(["shuttle", s.shuttle]);
  if (page.form === "private" || page.form === "both") products.push(["private", s.private], ["vip", s.vip]);
  const radios = products
    .map(([v, l], i) => `<label class="check"><input type="radio" name="product" value="${v}"${i === 0 ? " checked" : ""}> ${escapeHtml(l)}</label>`)
    .join("");
  const routeOptions = site.shuttleRoutes
    .map((r) => `<option value="${escapeHtml(r.code)}">${escapeHtml(r.label[page.locale] ?? r.label[site.defaultLocale] ?? r.code)}</option>`)
    .join("");
  const attrs = {
    sending: s.sending,
    price: s.priceFrom,
    "needs-approval": s.priceNeedsApproval,
    "ok-approval": s.successApproval,
    "ok-shuttle": s.successShuttle,
    "ok-private": s.successPrivate,
    ref: s.yourRef,
    token: s.yourToken,
    error: s.error,
  };
  const dataT = Object.entries(attrs)
    .map(([k, v]) => ` data-t-${k}="${escapeHtml(v)}"`)
    .join("");
  const hasShuttle = products.some(([v]) => v === "shuttle");
  const hasPrivate = products.some(([v]) => v !== "shuttle");
  return `<div class="card"><h2>${escapeHtml(s.bookTitle)}</h2>
<form id="booking-form" class="booking" data-api="${escapeHtml(apiBase)}" data-site="${escapeHtml(site.id)}" data-locale="${escapeHtml(page.locale)}"${dataT}>
<fieldset><legend class="hp">product</legend>${radios}</fieldset>
${hasShuttle ? `<label data-for="shuttle">${escapeHtml(s.route)}<select name="routeCode">${routeOptions}</select></label>` : ""}
<label>${escapeHtml(s.pickup)}<input name="pickup" required maxlength="200" autocomplete="off"></label>
<label>${escapeHtml(s.dropoff)}<input name="dropoff" required maxlength="200" autocomplete="off"></label>
<label>${escapeHtml(s.pickupAt)}<input name="pickupAt" type="datetime-local" required></label>
<label>${escapeHtml(s.passengers)}<input name="passengers" type="number" min="1" max="16" value="2" required></label>
${hasPrivate ? `<label data-for="private">${escapeHtml(s.returnAt)}<input name="returnPickupAt" type="datetime-local"></label>` : ""}
<label>${escapeHtml(s.flightNo)}<input name="flightNo" maxlength="10" autocomplete="off"></label>
<label>${escapeHtml(s.name)}<input name="name" required maxlength="120" autocomplete="name"></label>
<label>${escapeHtml(s.email)}<input name="email" type="email" required autocomplete="email"></label>
<label>${escapeHtml(s.phone)}<input name="phone" type="tel" required autocomplete="tel"></label>
<textarea name="notes" maxlength="1000" rows="2" placeholder="${escapeHtml(s.notes)}" aria-label="${escapeHtml(s.notes)}"></textarea>
<label class="hp" aria-hidden="true">website<input name="website" tabindex="-1" autocomplete="off"></label>
<label class="check"><input type="checkbox" name="consent" required> ${escapeHtml(s.consent)}</label>
${site.turnstileSiteKey ? `<div class="cf-turnstile full" data-sitekey="${escapeHtml(site.turnstileSiteKey)}" data-action="booking"></div>` : ""}
<p class="price" aria-live="polite"></p>
<button type="submit" class="full">${escapeHtml(s.submit)}</button>
<p class="result" role="status" aria-live="polite"></p>
</form>
<noscript><p>${escapeHtml(s.noJs)} <a href="${escapeHtml(waLink(site, page))}">${escapeHtml(s.whatsapp)}</a></p></noscript></div>`;
}

function lookupForm(page: Page, apiBase: string): string {
  const s = t(page.locale);
  return `<div class="card"><form id="lookup-form" class="booking" data-api="${escapeHtml(apiBase)}" data-t-notfound="${escapeHtml(
    s.lookupNotFound,
  )}" data-t-status="${escapeHtml(s.status)}">
<label>${escapeHtml(s.lookupRef)}<input name="ref" required pattern="AG-[A-Za-z0-9]{6}" placeholder="AG-XXXXXX"></label>
<label>${escapeHtml(s.lookupToken)}<input name="token" required autocomplete="off"></label>
<button type="submit">${escapeHtml(s.lookupSubmit)}</button>
<p class="result" role="status" aria-live="polite"></p></form></div>`;
}

function shuttlePriceTable(page: Page, tariff: ShuttleTariffVersion | undefined): string {
  // Tek fiyat kaynağı: merkezi tarife. Tarife yoksa tablo hiç basılmaz (metne fiyat uydurulmaz).
  // Yalnız Owner'ın karar verdiği kişi sayıları listelenir; üstü "onaya tabi" satırıdır.
  if (!tariff) return "";
  const s = t(page.locale);
  const rows = tariff.totalsMinor.map(
    (minor, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(formatMoney(money(minor, tariff.currency), page.locale))}</td></tr>`,
  );
  if (tariff.maxPassengers > tariff.totalsMinor.length) {
    rows.push(`<tr><td>${tariff.totalsMinor.length + 1}+</td><td>${escapeHtml(s.priceOnRequest)}</td></tr>`);
  }
  return `<table><thead><tr><th>${escapeHtml(s.passengers)}</th><th>${escapeHtml(s.totalForBooking)}</th></tr></thead><tbody>${rows.join("")}</tbody></table>`;
}

function reviewsBlock(page: Page, reviews: readonly Review[]): string {
  const mine = reviews.filter((r) => r.verified === true && r.lang === page.locale).slice(0, 6);
  if (mine.length === 0) return "";
  const items = mine
    .map(
      (r) =>
        `<li class="card"><p>${"★".repeat(Math.max(1, Math.min(5, Math.round(r.rating))))}</p><p>${escapeHtml(r.text)}</p><p><small>${escapeHtml(
          r.author,
        )} · ${escapeHtml(r.date)}</small></p></li>`,
    )
    .join("");
  return `<section><h2>${escapeHtml(t(page.locale).reviewsTitle)}</h2><ul class="reviews">${items}</ul></section>`;
}

function footer(site: SiteConfig, page: Page): string {
  const year = page.updated.slice(0, 4);
  let statement = "";
  if (site.ownership === "ag_brand") {
    const b = brandStatement(page.locale, site.brand);
    statement = `<p>${escapeHtml(b.before)}<a href="${AG_HOME}">${escapeHtml(b.link)}</a>${escapeHtml(b.after)}</p>`;
  }
  const license = site.legal.licenseText ? `<p>${escapeHtml(site.legal.licenseText)}</p>` : "";
  return `<footer class="site"><div class="wrap">${statement}<p>© ${escapeHtml(year)} ${escapeHtml(site.legal.companyName)} · <a href="mailto:${escapeHtml(
    site.contact.email,
  )}">${escapeHtml(site.contact.email)}</a></p>${license}</div></footer>`;
}

export function renderPage(
  site: SiteConfig,
  page: Page,
  all: readonly Page[],
  ctx: { apiBase: string; css: string; cssHash: string; tariff?: ShuttleTariffVersion; reviews: readonly Review[]; warnings: string[] },
): string {
  const s = t(page.locale);
  const byPath = new Map(all.filter((p) => p.locale === page.locale).map((p) => [p.path, p]));
  const knownPaths = new Set(all.map((p) => p.path));
  const { html } = renderMarkdown(
    page.body,
    (name) => {
      switch (name) {
        case "booking_form":
          return bookingForm(site, { ...page, form: page.form === "none" ? "both" : page.form }, ctx.apiBase);
        case "lookup_form":
          return lookupForm(page, ctx.apiBase);
        case "shuttle_prices":
          return shuttlePriceTable(page, ctx.tariff);
        case "reviews":
          return reviewsBlock(page, ctx.reviews);
        default:
          ctx.warnings.push(`${page.source}: unknown shortcode {{${name}}}`);
          return "";
      }
    },
    { knownPaths, onBrokenLink: (href) => ctx.warnings.push(`${page.source}: broken or unsafe link ${href}`) },
  );

  const alternates = all.filter((p) => p.translationKey === page.translationKey);
  const hreflang = alternates
    .map((p) => `<link rel="alternate" hreflang="${p.locale}" href="${absUrl(site, p.path)}">`)
    .concat(
      alternates
        .filter((p) => p.locale === site.defaultLocale)
        .map((p) => `<link rel="alternate" hreflang="x-default" href="${absUrl(site, p.path)}">`),
    )
    .join("\n");
  const crumbs = breadcrumbs(page, byPath);
  const nav = all
    .filter((p) => p.locale === page.locale && p.nav)
    .map((p) => `<a href="${p.path}"${p.path === page.path ? ' aria-current="page"' : ""}>${escapeHtml(p.navLabel)}</a>`)
    .join("");
  const langs = alternates
    .filter((p) => p.locale !== page.locale)
    .map((p) => `<a href="${p.path}" hreflang="${p.locale}" lang="${p.locale}">${p.locale.toUpperCase()}</a>`)
    .join("");
  const crumbHtml =
    crumbs.length > 1
      ? `<p class="crumbs">${crumbs
          .map((c, i) => (i === crumbs.length - 1 ? escapeHtml(c.navLabel) : `<a href="${c.path}">${escapeHtml(c.navLabel)}</a>`))
          .join(" › ")}</p>`
      : "";
  const heroForm = (page.type === "home" || page.type === "route") && !page.body.includes("{{booking_form}}")
    ? bookingForm(site, page, ctx.apiBase)
    : "";
  const ld = jsonLd(site, page, crumbs)
    .map((o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`)
    .join("\n");

  return `<!doctype html>
<html lang="${page.locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(page.title)}</title>
<meta name="description" content="${escapeHtml(page.description)}">
${site.indexable ? "" : '<meta name="robots" content="noindex, nofollow">\n'}<link rel="canonical" href="${absUrl(site, page.path)}">
${hreflang}
<meta property="og:title" content="${escapeHtml(page.title)}">
<meta property="og:description" content="${escapeHtml(page.description)}">
<meta property="og:url" content="${absUrl(site, page.path)}">
<meta property="og:type" content="website">
<style>${ctx.css}</style>
${ld}
<script src="/assets/form.js" defer></script>
${site.turnstileSiteKey ? '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>\n' : ""}</head>
<body>
<header class="site"><div class="wrap">
<a class="logo" href="${pathFor(site, page.locale, "")}">${escapeHtml(site.brand)}</a>
<nav class="main" aria-label="main">${nav}</nav>
<span class="lang">${langs}</span>
<a class="wa" href="${escapeHtml(waLink(site, page))}" rel="nofollow">${escapeHtml(s.whatsapp)}</a>
</div></header>
<main>
<section class="hero"><div class="wrap">${crumbHtml}<h1>${escapeHtml(page.h1)}</h1>${heroForm}</div></section>
<div class="wrap content">
${html}
${page.type === "lookup" && !page.body.includes("{{lookup_form}}") ? lookupForm(page, ctx.apiBase) : ""}
</div>
</main>
${footer(site, page)}
</body>
</html>
`;
}

// Fiyat yalnız {{shuttle_prices}} (merkezi tarife) ile basılır; içerikte elle yazılmış tutar derlemeyi durdurur.
const HAND_WRITTEN_PRICE = /(?:€|EUR|TRY|₺|\$|£|USD|GBP)\s?\d|\d(?:[.,]\d+)?\s?(?:€|EUR|TRY|TL|₺|USD|GBP|euro)\b|\d\s?(?:€|₺)/i;

function qa(page: Page, warnings: string[], errors: string[]) {
  if (HAND_WRITTEN_PRICE.test(page.body) || HAND_WRITTEN_PRICE.test(page.title) || HAND_WRITTEN_PRICE.test(page.description)) {
    errors.push(`${page.source}: hand-written price found; use {{shuttle_prices}} (single price source)`);
  }
  if (page.title.length > 60) errors.push(`${page.source}: title is ${page.title.length} chars (max 60)`);
  if (page.description.length < 70 || page.description.length > 160) {
    warnings.push(`${page.source}: description is ${page.description.length} chars (target 140–155)`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(page.updated)) errors.push(`${page.source}: updated must be YYYY-MM-DD`);
}

function sitemap(site: SiteConfig, pages: readonly Page[]): string {
  const urls = pages
    .map((p) => {
      const alts = pages
        .filter((a) => a.translationKey === p.translationKey)
        .map((a) => `<xhtml:link rel="alternate" hreflang="${a.locale}" href="${absUrl(site, a.path)}"/>`)
        .join("");
      return `<url><loc>${absUrl(site, p.path)}</loc><lastmod>${p.updated}</lastmod>${alts}</url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`;
}

function headersFile(site: SiteConfig, apiBase: string, cssHash: string): string {
  const apiOrigin = new URL(apiBase).origin;
  const ts = site.turnstileSiteKey ? " https://challenges.cloudflare.com" : "";
  const csp = [
    "default-src 'self'",
    `script-src 'self'${ts}`,
    `style-src 'sha256-${cssHash}'`,
    "img-src 'self' data:",
    `connect-src 'self' ${apiOrigin}`,
    `frame-src${ts || " 'none'"}`,
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
  return `/*
  Content-Security-Policy: ${csp}
  Referrer-Policy: strict-origin-when-cross-origin
  X-Content-Type-Options: nosniff
  Permissions-Policy: camera=(), microphone=(), geolocation=()
${site.indexable ? "" : "  X-Robots-Tag: noindex, nofollow\n"}/assets/*
  Cache-Control: public, max-age=31536000, immutable
`;
}

export function buildSite(opts: BuildOptions): BuildReport {
  const site = parseSiteConfig(JSON.parse(readFileSync(join(opts.siteDir, "site.json"), "utf8")));
  const errors: string[] = [];
  const warnings: string[] = [];
  const pages = loadPages(site, opts.siteDir, errors);
  const seen = new Set<string>();
  for (const p of pages) {
    if (seen.has(p.path)) errors.push(`duplicate path ${p.path}`);
    seen.add(p.path);
    qa(p, warnings, errors);
  }
  if (!pages.some((p) => p.path === "/")) errors.push("missing home page (content/<defaultLocale>/index.md)");
  if (opts.shuttleTariff) {
    for (const r of site.shuttleRoutes) {
      if (!opts.shuttleTariff.routes.includes(r.code)) {
        errors.push(`site.json: shuttle route ${r.code} is not in tariff ${opts.shuttleTariff.id} (single price source)`);
      }
    }
  }
  const reviewsFile = join(opts.siteDir, "content", "reviews.json");
  const reviews: Review[] = existsSync(reviewsFile)
    ? (JSON.parse(readFileSync(reviewsFile, "utf8")) as Review[]).filter((r) => r.verified === true)
    : [];

  const themeCss = `:root{--accent:${site.theme.accent};--accent-text:${site.theme.accentText}}`;
  const css = readFileSync(join(ASSETS, "style.css"), "utf8").replace(/\n/g, "") + themeCss;
  const cssHash = createHash("sha256").update(css).digest("base64");

  const rendered = pages.map((p) => ({
    page: p,
    html: renderPage(site, p, pages, {
      apiBase: opts.apiBase,
      css,
      cssHash,
      reviews,
      warnings,
      ...(opts.shuttleTariff ? { tariff: opts.shuttleTariff } : {}),
    }),
  }));
  if (errors.length > 0) throw new Error(`build failed for ${site.id}:\n  ${errors.join("\n  ")}`);

  rmSync(opts.outDir, { recursive: true, force: true });
  const files: string[] = [];
  const write = (rel: string, content: string) => {
    const full = join(opts.outDir, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
    files.push(rel);
  };
  for (const r of rendered) write(join(r.page.path.slice(1), "index.html"), r.html);
  write("assets/form.js", readFileSync(join(ASSETS, "form.js"), "utf8"));
  write("_headers", headersFile(site, opts.apiBase, cssHash));
  if (site.indexable) {
    write("sitemap.xml", sitemap(site, pages));
    write("robots.txt", `User-agent: *\nAllow: /\n\nSitemap: https://${site.domain}/sitemap.xml\n`);
  } else {
    write("robots.txt", "User-agent: *\nDisallow: /\n");
  }
  write(
    "build-manifest.json",
    JSON.stringify(
      {
        siteId: site.id,
        domain: site.domain,
        indexable: site.indexable,
        pages: rendered.map((r) => ({
          path: r.page.path,
          locale: r.page.locale,
          updated: r.page.updated,
          sha256: createHash("sha256").update(r.html).digest("hex"),
        })),
      },
      null,
      2,
    ),
  );
  return { siteId: site.id, pages: pages.length, indexable: site.indexable, warnings, files };
}

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { parseShuttleTariff } from "@ag/core";
import { buildSite } from "./build.ts";
import { renderMarkdown } from "./markdown.ts";

const tariff = parseShuttleTariff({
  id: "t1",
  currency: "EUR",
  routes: ["AYT-ALANYA"],
  validFrom: "2026-01-01",
  maxPassengers: 10,
  totalsMinor: [3000, 5000, 6000],
  extraPerPassengerMinor: 1000,
});

function makeSite(over: Record<string, unknown> = {}, pages: Record<string, string> = {}, reviews: unknown[] = []) {
  const dir = mkdtempSync(join(tmpdir(), "ag-ssg-"));
  writeFileSync(
    join(dir, "site.json"),
    JSON.stringify({
      id: "test-site",
      brand: "Test Brand",
      domain: "www.test-brand.example",
      ownership: "ag_brand",
      defaultLocale: "en",
      locales: ["en", "de"],
      indexable: true,
      contact: { whatsapp: "+905000000000", email: "info@test-brand.example" },
      legal: { companyName: "Test Co" },
      theme: { accent: "#123456", accentText: "#ffffff" },
      shuttleRoutes: [{ code: "AYT-ALANYA", label: { en: "AYT → Alanya" } }],
      ...over,
    }),
  );
  const fm = (title: string, extra = "") =>
    `---\ntitle: ${title}\ndescription: A sufficiently long description used for testing the static site generator output here.\nh1: ${title}\nupdated: 2026-11-03\n${extra}---\n`;
  const files: Record<string, string> = {
    "en/index.md": fm("Home", "type: home\n") + "## Prices\n\n{{shuttle_prices}}\n\n{{reviews}}\n\nSee [the guide](/guide/).\n",
    "en/guide.md": fm("Guide", "type: guide\n") + "Back [home](/).\n",
    "de/index.md": fm("Startseite", "type: home\n") + "Hallo.\n",
    ...pages,
  };
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(join(dir, "content", rel, ".."), { recursive: true });
    writeFileSync(join(dir, "content", rel), content);
  }
  writeFileSync(join(dir, "content", "reviews.json"), JSON.stringify(reviews));
  return dir;
}

const build = (dir: string) => {
  const out = mkdtempSync(join(tmpdir(), "ag-out-"));
  const report = buildSite({ siteDir: dir, outDir: out, apiBase: "https://api.example", shuttleTariff: tariff });
  return { out, report, read: (p: string) => readFileSync(join(out, p), "utf8") };
};

describe("ssg build", () => {
  it("emits canonical, hreflang, sitemap and robots for an indexable site", () => {
    const { read } = build(makeSite());
    const home = read("index.html");
    assert.match(home, /<link rel="canonical" href="https:\/\/www.test-brand.example\/">/);
    assert.match(home, /hreflang="de" href="https:\/\/www.test-brand.example\/de\/"/);
    assert.match(home, /hreflang="x-default"/);
    assert.doesNotMatch(home, /noindex/);
    assert.equal((home.match(/<h1>/g) ?? []).length, 1, "exactly one H1");
    const sitemap = read("sitemap.xml");
    assert.match(sitemap, /<loc>https:\/\/www.test-brand.example\/guide\/<\/loc>/);
    assert.match(read("robots.txt"), /Sitemap: https:\/\/www.test-brand.example\/sitemap.xml/);
  });

  it("renders shuttle prices only from the central tariff", () => {
    const { read } = build(makeSite());
    assert.match(read("index.html"), /€50\.00/);
  });

  it("adds the Alanya Group brand statement only on ag_brand sites", () => {
    const ag = build(makeSite()).read("index.html");
    assert.match(ag, /is an <a href="https:\/\/www.alanyagroup.com\/">Alanya Group<\/a> brand/);
    assert.match(ag, /"publisher":\{"@id":"https:\/\/www.alanyagroup.com\/#organization"\}/);
    const partner = build(makeSite({ ownership: "partner" })).read("index.html");
    assert.doesNotMatch(partner, /alanyagroup\.com/);
    assert.match(partner, /"@type":"TravelAgency"/);
  });

  it("keeps preview sites out of the index", () => {
    const { read, report } = build(makeSite({ indexable: false }));
    assert.match(read("index.html"), /<meta name="robots" content="noindex, nofollow">/);
    assert.equal(read("robots.txt"), "User-agent: *\nDisallow: /\n");
    assert.match(read("_headers"), /X-Robots-Tag: noindex/);
    assert.ok(!report.files.includes("sitemap.xml"));
  });

  it("never emits review schema and shows only verified reviews", () => {
    const { read } = build(
      makeSite({}, {}, [
        { author: "Anna", rating: 5, date: "2026-10-01", text: "Very punctual driver.", lang: "en", verified: true },
        { author: "Fake", rating: 5, date: "2026-10-01", text: "unverified text", lang: "en", verified: false },
      ]),
    );
    const home = read("index.html");
    assert.match(home, /Very punctual driver/);
    assert.doesNotMatch(home, /unverified text/);
    assert.doesNotMatch(home, /aggregateRating|"@type":"Review"/);
  });

  it("pins the inline stylesheet with a CSP hash", () => {
    const { read } = build(makeSite());
    const css = /<style>([\s\S]*?)<\/style>/.exec(read("index.html"))![1]!;
    const hash = createHash("sha256").update(css).digest("base64");
    assert.ok(read("_headers").includes(`style-src 'sha256-${hash}'`));
    assert.match(read("_headers"), /connect-src 'self' https:\/\/api.example/);
  });

  it("fails the build on an over-long title and warns on broken internal links", () => {
    assert.throws(
      () => build(makeSite({}, { "en/long.md": "---\ntitle: " + "x".repeat(61) + "\ndescription: d\nh1: H\nupdated: 2026-11-03\n---\nBody\n" })),
      /max 60/,
    );
    const { report } = build(makeSite({}, { "en/links.md": "---\ntitle: L\ndescription: d\nh1: H\nupdated: 2026-11-03\n---\nGo [nowhere](/missing/).\n" }));
    assert.ok(report.warnings.some((w) => w.includes("/missing/")));
  });
});

describe("markdown", () => {
  it("escapes HTML and rejects unsafe link schemes", () => {
    const { html } = renderMarkdown("Hi <script>x</script> [a](javascript:alert(1))", () => "");
    assert.doesNotMatch(html, /<script>|javascript:/);
  });

  it("forbids H1 in the body", () => {
    assert.throws(() => renderMarkdown("# Title", () => ""));
  });
});

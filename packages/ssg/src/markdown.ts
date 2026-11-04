// Küçük, bağımlılıksız Markdown alt kümesi. İçerik editör kontrolündedir; yine de tüm metin kaçışlanır.
// Desteklenen: ## / ### başlık, paragraf, - liste, 1. liste, [metin](url), **kalın**, *italik*,
// ve kendi satırında {{kisa_kod}}. "# " (H1) yasaktır: H1 yalnız ön bilgiden (frontmatter) gelir.

export interface Frontmatter {
  readonly [key: string]: string | boolean | undefined;
}

export function parseFrontmatter(src: string): { data: Frontmatter; body: string } {
  if (!src.startsWith("---\n")) return { data: {}, body: src };
  const end = src.indexOf("\n---", 4);
  if (end < 0) throw new Error("unterminated frontmatter");
  const data: Record<string, string | boolean> = {};
  for (const line of src.slice(4, end).split("\n")) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    const i = line.indexOf(":");
    if (i < 0) throw new Error(`bad frontmatter line: ${line}`);
    const key = line.slice(0, i).trim();
    let value = line.slice(i + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    data[key] = value === "true" ? true : value === "false" ? false : value;
  }
  return { data, body: src.slice(end + 4).replace(/^\n/, "") };
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeHref(url: string): string | undefined {
  if (/^(https:\/\/|\/|#|mailto:|tel:)/.test(url)) return url;
  return undefined;
}

export interface InlineContext {
  /** Dahili linkleri doğrulamak için: bilinen yollar. */
  readonly knownPaths?: ReadonlySet<string>;
  readonly onBrokenLink?: (href: string) => void;
}

export function renderInline(text: string, ctx: InlineContext = {}): string {
  const parts: string[] = [];
  const linkRe = /\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  for (const m of text.matchAll(linkRe)) {
    parts.push(emphasis(escapeHtml(text.slice(last, m.index))));
    const href = safeHref(m[2]!);
    const label = emphasis(escapeHtml(m[1]!));
    if (!href) {
      ctx.onBrokenLink?.(m[2]!);
      parts.push(label);
    } else {
      if (href.startsWith("/") && ctx.knownPaths && !ctx.knownPaths.has(href.split("#")[0]!)) ctx.onBrokenLink?.(href);
      const ext = href.startsWith("https://");
      parts.push(`<a href="${escapeHtml(href)}"${ext ? ' rel="noopener"' : ""}>${label}</a>`);
    }
    last = m.index + m[0].length;
  }
  parts.push(emphasis(escapeHtml(text.slice(last))));
  return parts.join("");
}

function emphasis(escaped: string): string {
  return escaped.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

export type ShortcodeRenderer = (name: string) => string;

export function renderMarkdown(
  body: string,
  shortcode: ShortcodeRenderer,
  ctx: InlineContext = {},
): { html: string; headings: Array<{ level: 2 | 3; text: string }> } {
  const out: string[] = [];
  const headings: Array<{ level: 2 | 3; text: string }> = [];
  let para: string[] = [];
  let list: { tag: "ul" | "ol"; items: string[] } | undefined;

  const flushPara = () => {
    if (para.length) out.push(`<p>${renderInline(para.join(" "), ctx)}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${renderInline(i, ctx)}</li>`).join("")}</${list.tag}>`);
    list = undefined;
  };

  for (const raw of body.split("\n")) {
    const line = raw.trimEnd();
    if (line.trim() === "") {
      flushPara();
      flushList();
      continue;
    }
    if (/^# /.test(line)) throw new Error("H1 in markdown body is not allowed; set h1 in frontmatter");
    const h = /^(#{2,3}) (.+)$/.exec(line);
    if (h) {
      flushPara();
      flushList();
      const level = h[1]!.length as 2 | 3;
      headings.push({ level, text: h[2]! });
      out.push(`<h${level}>${renderInline(h[2]!, ctx)}</h${level}>`);
      continue;
    }
    const sc = /^\{\{([a-z_]+)\}\}$/.exec(line.trim());
    if (sc) {
      flushPara();
      flushList();
      out.push(shortcode(sc[1]!));
      continue;
    }
    const ul = /^- (.+)$/.exec(line);
    const ol = /^\d+\. (.+)$/.exec(line);
    if (ul || ol) {
      flushPara();
      const tag = ul ? "ul" : "ol";
      if (list && list.tag !== tag) flushList();
      list ??= { tag, items: [] };
      list.items.push((ul ?? ol)![1]!);
      continue;
    }
    flushList();
    para.push(line.trim());
  }
  flushPara();
  flushList();
  return { html: out.join("\n"), headings };
}

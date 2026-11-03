#!/usr/bin/env node
// Skill envanteri (SALT OKUNUR). Hiçbir dosyayı değiştirmez, ağa çıkmaz; yalnız stdout'a JSON satırları yazar.
//
// Kullanım:
//   node tools/skill-inventory.mjs --label mac-claude ~/.claude/skills > envanter-mac-claude.jsonl
//   node tools/skill-inventory.mjs --label sel456-zip /tmp/sel456-acik   > envanter-sel456.jsonl
//   node tools/skill-inventory.mjs                                       (varsayılan klasörler, varsa)
//
// Her satır bir skill: ad, klasör, SKILL.md SHA-256, tüm dosyaların SHA-256'sı, ağaç özeti (tree_sha256).
// Aynı tree_sha256 = byte düzeyinde aynı skill. Üç yönlü birleştirme için taban/kurulu/aday bu özetlerle eşlenir.
// Açıklama metni yazılmaz (yalnız özeti); kişisel veri veya gizli anahtar içeren dosya içeriği hiçbir zaman basılmaz.

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, realpathSync, statSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, resolve } from "node:path";

const args = process.argv.slice(2);
let label = "unlabeled";
const roots = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--label") label = args[++i] ?? label;
  else roots.push(args[i]);
}
if (roots.length === 0) {
  const h = homedir();
  for (const d of [join(h, ".claude/skills"), join(h, ".codex/skills"), join(h, ".hermes/skills"), "skills"]) {
    if (existsSync(d)) roots.push(d);
  }
}

const SKIP = new Set([".git", "node_modules", "results", "__pycache__"]);
const MAX_DEPTH = 8;
const sha = (buf) => createHash("sha256").update(buf).digest("hex");

function filesUnder(dir) {
  const out = [];
  const walk = (d, depth) => {
    if (depth > MAX_DEPTH) return;
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (SKIP.has(e.name)) continue;
      const p = join(d, e.name);
      const st = statSync(p); // sembolik bağlantıyı izler; gerçek yol ayrıca kaydedilir
      if (st.isDirectory()) walk(p, depth + 1);
      else if (st.isFile()) out.push(p);
    }
  };
  walk(dir, 0);
  return out.sort();
}

function skillDirs(root) {
  const found = [];
  const walk = (d, depth) => {
    if (depth > MAX_DEPTH) return;
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    if (entries.some((e) => e.name === "SKILL.md")) {
      found.push(d);
      return; // iç içe skill aranmaz; skill klasörü bütün olarak özetlenir
    }
    for (const e of entries) {
      if (SKIP.has(e.name)) continue;
      const p = join(d, e.name);
      try {
        if (statSync(p).isDirectory()) walk(p, depth + 1);
      } catch {
        /* erişilemeyen klasör atlanır */
      }
    }
  };
  walk(root, 0);
  return found;
}

function frontmatterName(text) {
  const m = /^---\s*\n([\s\S]*?)\n---/.exec(text);
  if (!m) return null;
  const n = /^name:\s*["']?([^"'\n]+)["']?\s*$/m.exec(m[1]);
  return n ? n[1].trim() : null;
}

function frontmatterDescription(text) {
  const m = /^---\s*\n([\s\S]*?)\n---/.exec(text);
  if (!m) return "";
  const d = /^description:\s*([\s\S]*?)(?=\n[a-z_]+:|\s*$)/m.exec(m[1]);
  return d ? d[1].trim() : "";
}

for (const r of roots) {
  const root = resolve(r);
  if (!existsSync(root)) {
    process.stdout.write(JSON.stringify({ label, root, error: "not_found" }) + "\n");
    continue;
  }
  for (const dir of skillDirs(root)) {
    const files = filesUnder(dir).map((p) => {
      const buf = readFileSync(p);
      return { path: relative(dir, p), sha256: sha(buf), bytes: buf.length, mtime: statSync(p).mtime.toISOString() };
    });
    const skillMd = readFileSync(join(dir, "SKILL.md"), "utf8");
    const tree = sha(files.map((f) => `${f.sha256}  ${f.path}`).join("\n"));
    process.stdout.write(
      JSON.stringify({
        label,
        root,
        skill_dir: relative(root, dir) || ".",
        real_path: realpathSync(dir),
        name: frontmatterName(skillMd),
        description_sha256: sha(frontmatterDescription(skillMd)),
        skill_md_sha256: sha(Buffer.from(skillMd, "utf8")),
        skill_md_lines: skillMd.split("\n").length,
        file_count: files.length,
        tree_sha256: tree,
        mtime_max: files.reduce((a, f) => (f.mtime > a ? f.mtime : a), ""),
        files,
      }) + "\n",
    );
  }
}

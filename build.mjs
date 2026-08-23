#!/usr/bin/env node
// The explainer hub's entire build step. §22: "markdown source in the surfaces repo,
// single-file HTML per page, Cloudflare Pages. No CMS, no framework. A fifty-line build step
// renders it."
//
// Hand-rolled and dependency-free on purpose. A markdown library is a supply-chain surface and
// a version to chase for a job this small, and the subset an explainer actually uses —
// headings, paragraphs, lists, links, code, emphasis, quotes — fits in one readable file.
// §5's dependency budget is not the reason. The reason is that this must still build in five
// years with nobody maintaining it, because §22 says every explainer lives here FOREVER.
//
// It REFUSES to render a page with no "Last verified" line. §7 requires one on every
// explainer: the hub's whole value is research a reader can trust, and research with no date
// on it is an assertion. A missing line fails the build rather than publishing undated.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const SRC = "src";
const OUT = "dist";
const HUB = "monkstone.org";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Inline formatting. Code spans are lifted out FIRST and put back last, so nothing inside
// backticks is reinterpreted as markdown or double-escaped. The sentinel is deliberately
// unlikely to occur in prose; an earlier version used a bare number and would have corrupted
// any explainer containing a standalone digit.
const SENTINEL = (i) => `CODE${i}`;

function inline(s) {
  const code = [];
  const lifted = s.replace(/`([^`]+)`/g, (_, c) => SENTINEL(code.push(`<code>${esc(c)}</code>`) - 1));
  const html = esc(lifted)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  return html.replace(/CODE(\d+)/g, (_, i) => code[Number(i)]);
}

export function render(md) {
  const out = [];
  let list = null;
  // Consecutive prose lines are ONE paragraph. Markdown is hard-wrapped by every editor and by
  // `surface-explainer`, and emitting a <p> per source line produced a page of one-line
  // paragraphs — technically valid, unreadable, and wrong about where the author's thoughts end.
  let para = [];
  let quote = [];
  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${inline(para.join(" "))}</p>`);
      para = [];
    }
  };
  const flushQuote = () => {
    if (quote.length) {
      out.push(`<blockquote>${inline(quote.join(" "))}</blockquote>`);
      quote = [];
    }
  };
  const closeList = () => {
    if (list) {
      out.push(`</${list}>`);
      list = null;
    }
  };
  const flushAll = () => {
    flushPara();
    flushQuote();
    closeList();
  };

  for (const raw of md.split("\n")) {
    const line = raw.trimEnd();
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    const ul = /^[-*]\s+(.*)$/.exec(line);
    const ol = /^\d+\.\s+(.*)$/.exec(line);
    const q = /^>\s?(.*)$/.exec(line);
    if (h) {
      flushAll();
      out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
    } else if (ul) {
      flushPara();
      flushQuote();
      if (list !== "ul") {
        closeList();
        out.push("<ul>");
        list = "ul";
      }
      out.push(`<li>${inline(ul[1])}</li>`);
    } else if (ol) {
      flushPara();
      flushQuote();
      if (list !== "ol") {
        closeList();
        out.push("<ol>");
        list = "ol";
      }
      out.push(`<li>${inline(ol[1])}</li>`);
    } else if (q) {
      flushPara();
      closeList();
      quote.push(q[1]);
    } else if (!line.trim()) {
      flushAll();
    } else {
      flushQuote();
      closeList();
      para.push(line.trim());
    }
  }
  flushAll();
  return out.join("\n");
}

const page = (title, body, canonical) => `<!doctype html>
<html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<link rel="canonical" href="https://${HUB}${canonical}">
<style>
:root{color-scheme:light dark;--fg:#111;--bg:#fff;--mute:#666;--rule:#e5e5e5}
@media(prefers-color-scheme:dark){:root{--fg:#e8e8e8;--bg:#111;--mute:#999;--rule:#2a2a2a}}
body{max-width:42rem;margin:0 auto;padding:2.5rem 1.25rem 6rem;background:var(--bg);color:var(--fg);
font:1.05rem/1.65 ui-serif,Georgia,"Times New Roman",serif}
h1{font-size:1.9rem;line-height:1.2;margin:0 0 .5rem}h2{font-size:1.3rem;margin:2.5rem 0 .5rem}
a{color:inherit}
code{font:.9em ui-monospace,SFMono-Regular,Menlo,monospace;background:color-mix(in srgb,var(--fg) 8%,transparent);padding:.1em .35em;border-radius:3px}
blockquote{margin:1.5rem 0;padding-left:1rem;border-left:3px solid var(--rule);color:var(--mute)}
.meta{color:var(--mute);font-size:.9rem;border-bottom:1px solid var(--rule);padding-bottom:1rem;margin-bottom:2rem}
nav{margin-bottom:2rem;font-size:.9rem}
</style>
${body}
`;

export function buildAll(srcDir = SRC, outDir = OUT) {
  if (!existsSync(srcDir)) throw new Error(`no ${srcDir}/ directory`);
  mkdirSync(outDir, { recursive: true });
  const pages = [];

  for (const f of readdirSync(srcDir)
    .filter((x) => x.endsWith(".md"))
    .sort()) {
    const md = readFileSync(join(srcDir, f), "utf8");
    const slug = basename(f, ".md");
    // Falls back to the filename when an explainer has no H1 — a page with no title is worse
    // than a page titled after its own slug, and the slug is always meaningful here.
    const title = /^#\s+(.*)$/m.exec(md)?.[1] ?? slug;
    const verified = /^_?Last verified:?\s*(.+?)_?$/im.exec(md);
    if (!verified) {
      const err = new Error(
        `${f} has no "Last verified" line. §7 requires one on every explainer: research with ` +
          "no date on it is an assertion, and the hub's whole value is research a reader can trust.",
      );
      err.file = f;
      throw err;
    }
    mkdirSync(join(outDir, slug), { recursive: true });
    // The "Last verified" line is lifted into the meta block above the article, so it is
    // removed from the body — otherwise it renders twice, once as provenance and once as a
    // stray paragraph under the headline.
    const body = md.replace(/^_?Last verified:?.*$/im, "");
    writeFileSync(
      join(outDir, slug, "index.html"),
      page(
        title,
        `<nav><a href="/surfaces/">← all surfaces</a></nav>\n<div class="meta">Last verified ${esc(verified[1].trim())}</div>\n${render(body)}`,
        `/surfaces/${slug}/`,
      ),
    );
    pages.push({ slug, title, verified: verified[1].trim() });
  }

  writeFileSync(
    join(outDir, "index.html"),
    page(
      "Surfaces",
      `<h1>Surfaces</h1>
<p>Every opportunity this lab investigated, including the ones it killed. Most do not become products, and the research is published either way.</p>
<ul>${pages.map((p) => `<li><a href="/surfaces/${p.slug}/">${esc(p.title)}</a> <span class="meta">— ${esc(p.verified)}</span></li>`).join("\n")}</ul>`,
      "/surfaces/",
    ),
  );
  return pages;
}

/**
 * The site root. §22 puts every explainer at `<hub>/surfaces/`, and Cloudflare Pages serves a
 * project at the domain root — so the hub is built INTO a `surfaces/` subdirectory rather than
 * the spec being bent to match the host. The root page is what someone typing the bare domain
 * gets; a 404 there would be a worse answer than a short one.
 */
function rootPage() {
  return page(
    "Monkstone",
    `<h1>Monkstone</h1>
<p>A technology lab.</p>
<p><a href="/surfaces/">Surfaces</a> — every opportunity investigated, including the ones killed. The research is published either way.</p>`,
    "/",
  );
}

if (process.argv[1]?.endsWith("build.mjs")) {
  try {
    const hub = join(OUT, "surfaces");
    const pages = buildAll(SRC, hub);
    mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, "index.html"), rootPage());
    for (const p of pages) console.log(`  ${p.slug}.md → surfaces/${p.slug}/index.html`);
    console.log(`\n  ${pages.length} explainer(s) → ${OUT}/surfaces/ · root page → ${OUT}/index.html`);
  } catch (e) {
    console.error(`❌ ${e.message}`);
    process.exit(1);
  }
}

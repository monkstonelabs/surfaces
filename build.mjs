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

// ---------------------------------------------------------------------------
// Scrollytelling (P15.10, §22)
// ---------------------------------------------------------------------------
//
// §22: "Prose is commodity; a built visual explainer is not." A scrollytelling section pins one
// graphic and steps text past it, swapping the graphic as each step arrives — The Pudding's
// pattern.
//
// **NO LIBRARY, AND THAT IS THE §22 CONSTRAINT RATHER THAN A PREFERENCE.** The AC is "single-file
// HTML … with no CMS and no framework added", and the checklist names Scrollama and GSAP
// ScrollTrigger. Both were considered and neither is added:
//
//   Scrollama          is an `IntersectionObserver` wrapper. Its entire useful surface here —
//                      observe the steps, tell me which one is current — is the twenty lines
//                      inlined below, and a single-file output would have to inline the library
//                      anyway. Vendoring 3KB of someone else's minified code to avoid writing
//                      twenty lines is a supply-chain surface and a version to chase, against
//                      this file's own rule that it must still build in five years unmaintained.
//   GSAP ScrollTrigger is for pinning. `position: sticky` is native CSS, does exactly this job,
//                      and has been baseline for years.
//
// **IT DEGRADES TO PROSE WITH NO JAVASCRIPT.** The first figure is active by CSS alone and every
// step's text renders in order, so the page is readable — which matters more here than anywhere
// else in this repo, because §22 says an explainer lives at its URL forever and JavaScript is the
// part most likely to stop working first.
//
// SYNTAX, line-based on purpose so the parser stays a `for` loop:
//
//     :::scrolly
//     :::figure key
//     <svg …>            ← raw, see the refusal below
//     :::step key
//     Prose for this step, in markdown.
//     :::step other-key
//     More prose.
//     :::
//
const SCROLLY_OPEN = /^:::scrolly\s*$/;
const SCROLLY_DIRECTIVE = /^:::(figure|step)\s+([A-Za-z0-9_-]+)\s*$/;
const SCROLLY_CLOSE = /^:::\s*$/;

/**
 * Figure content is emitted RAW, because an SVG is the point and escaping it would print angle
 * brackets. That is a deliberate hole in this file's otherwise total escaping, so it is bounded:
 *
 * **A figure carrying a script, an inline event handler or a `javascript:` URL FAILS THE BUILD.**
 * Explainers are written by `surface-explainer` from ingested content (§4 — all of it untrusted),
 * committed, and served from the hub's own origin. A raw-HTML passthrough on that path is an
 * XSS on our own domain, and "we review explainers before committing them" is a process, not a
 * control. This is the control.
 */
const FIGURE_FORBIDDEN = /<\s*script|\son[a-z]+\s*=|javascript:/i;

export function renderScrolly(figures, steps, slug) {
  const figureHtml = figures
    .map(
      ([key, body], i) =>
        `<figure class="sf${i === 0 ? " on" : ""}" data-key="${esc(key)}">${body.join("\n")}</figure>`,
    )
    .join("\n");
  const stepHtml = steps
    .map(([key, body]) => `<div class="ss" data-figure="${esc(key)}">${render(body.join("\n"))}</div>`)
    .join("\n");
  return `<section class="scrolly" id="scrolly-${esc(slug)}">
<div class="scrolly-figs">${figureHtml}</div>
<div class="scrolly-steps">${stepHtml}</div>
</section>`;
}

/**
 * Pull every scrolly block out of the markdown, returning the source with each block replaced by
 * its rendered HTML and a sentinel that `render()` leaves alone.
 *
 * Done as a PRE-PASS rather than inside `render()` because `render()` is line-based and stateful,
 * and threading a second nesting level through it is where a hand-rolled parser stops being
 * readable — which is the one property this file is built around.
 */
export function extractScrolly(md, slug) {
  const lines = md.split("\n");
  const out = [];
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    if (!SCROLLY_OPEN.test(lines[i] ?? "")) {
      out.push(lines[i]);
      i += 1;
      continue;
    }
    i += 1;
    const figures = [];
    const steps = [];
    let current = null;
    let closed = false;

    while (i < lines.length) {
      const line = lines[i] ?? "";
      const d = SCROLLY_DIRECTIVE.exec(line);
      if (d) {
        current = [d[1], d[2], []];
        (d[1] === "figure" ? figures : steps).push([d[2], current[2]]);
        i += 1;
        continue;
      }
      if (SCROLLY_CLOSE.test(line)) {
        closed = true;
        i += 1;
        break;
      }
      if (current) current[2].push(line);
      i += 1;
    }

    // An unclosed block would silently swallow the rest of the explainer — every heading, every
    // paragraph — and publish a page that simply stops. Louder than that: fail the build.
    if (!closed) throw new Error(`${slug}: a :::scrolly block is never closed`);
    if (figures.length === 0 || steps.length === 0)
      throw new Error(`${slug}: a :::scrolly block needs at least one :::figure and one :::step`);

    const keys = new Set(figures.map(([k]) => k));
    for (const [k] of steps) {
      // A typo here is invisible at runtime — the step scrolls past and the figure never changes,
      // which reads as a design choice rather than as a bug.
      if (!keys.has(k)) throw new Error(`${slug}: :::step ${k} has no matching :::figure`);
    }
    for (const [k, body] of figures) {
      if (FIGURE_FORBIDDEN.test(body.join("\n")))
        throw new Error(
          `${slug}: figure "${k}" contains a script, an inline event handler or a javascript: URL. ` +
            "Figure bodies are emitted raw so an SVG renders, and explainers are built from ingested content (§4), " +
            "so this would be an XSS on the hub's own origin.",
        );
    }

    blocks.push(renderScrolly(figures, steps, `${slug}-${blocks.length}`));
    out.push(`SCROLLYBLOCK${blocks.length - 1}`);
  }

  return { md: out.join("\n"), blocks };
}

/** Put the rendered blocks back after `render()` has run over everything else. */
export function restoreScrolly(html, blocks) {
  return html.replace(
    /<p>SCROLLYBLOCK(\d+)<\/p>|SCROLLYBLOCK(\d+)/g,
    (_, a, b) => blocks[Number(a ?? b)] ?? "",
  );
}

/** Inlined into any page that contains a scrolly block, and into no other page. */
const SCROLLY_ASSETS = `<style>
.scrolly{max-width:none;margin:3rem 0}
.scrolly-figs{position:sticky;top:0;height:60vh;display:grid;place-items:center;margin-bottom:-60vh}
.sf{margin:0;opacity:0;transition:opacity .35s;grid-area:1/1;max-width:100%}
.sf.on{opacity:1}
.ss{min-height:80vh;display:flex;align-items:center}
.ss>*{background:var(--bg);padding:1rem 1.25rem;border:1px solid var(--rule);border-radius:6px;max-width:32rem;margin:0 auto}
@media(prefers-reduced-motion:reduce){.sf{transition:none}}
@media print{.scrolly-figs{position:static;height:auto;margin:0}.sf{opacity:1;grid-area:auto}.ss{min-height:0;display:block}}
</style>
<script>
// Twenty lines instead of a library. rootMargin puts the trigger line at the middle of the
// viewport, so a step becomes current when it reaches the centre rather than when it appears.
for (const s of document.querySelectorAll(".scrolly")) {
  const figs = s.querySelectorAll(".sf");
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const key = e.target.dataset.figure;
        for (const f of figs) f.classList.toggle("on", f.dataset.key === key);
      }
    },
    { rootMargin: "-50% 0px -50% 0px" },
  );
  for (const step of s.querySelectorAll(".ss")) io.observe(step);
}
</script>`;

const page = (title, body, canonical, assets = "") => `<!doctype html>
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
${assets}
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
    // P15.10: scrolly blocks come out first, so `render()` sees ordinary markdown and stays the
    // readable line-based loop it is. The assets are inlined ONLY on a page that has one — an
    // explainer of plain prose stays exactly the file it was.
    const { md: prose, blocks } = extractScrolly(body, slug);
    writeFileSync(
      join(outDir, slug, "index.html"),
      page(
        title,
        `<nav><a href="/surfaces/">← all surfaces</a></nav>\n<div class="meta">Last verified ${esc(verified[1].trim())}</div>\n${restoreScrolly(render(prose), blocks)}`,
        `/surfaces/${slug}/`,
        blocks.length ? SCROLLY_ASSETS : "",
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

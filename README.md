# `surfaces` — the explainer hub

**This directory is staged here and becomes `monkstonelabs/surfaces` on GitHub**, deployed to
`monkstone.org/surfaces/` by Cloudflare Pages. It lives in the `radar` repo until the org token
can push (see the checklist's P9.1).

## Why it exists

Most opportunities Radar investigates are killed. Every investigation produces real research
anyway — the occupancy check, the platform terms, the regulatory reading — and §22 publishes it
whether the product shipped or not.

> **A kill is not a waste if the research is published. It is inventory.**

There is deliberately **no target number of investigations and no expected kill rate here.** An
earlier draft claimed twenty a year and eighteen kills; neither was derived from anything. The
rate is measured by §27's weekly report and is currently unknown, because nothing has walked the
whole path yet.

Products get their own domains. The hub links out to them and outlives all of them.

## How it works

```
src/*.md      one markdown file per explainer, written by `surface-explainer`
build.mjs     the entire build step — no CMS, no framework, zero dependencies
dist/         single-file HTML per page, what Cloudflare Pages serves
```

```bash
node build.mjs      # src/*.md → dist/
```

**Zero dependencies, deliberately.** A markdown library is a supply-chain surface and a version
to chase for a job this small. The real reason is longevity: §22 says every explainer lives here
*forever*, and this has to still build in five years with nobody maintaining it. The subset an
explainer uses — headings, paragraphs, lists, links, code, emphasis, quotes — fits in one file
you can read in a minute. `tests/surfaces.test.ts` in the `radar` repo asserts the dependency
count stays at zero, because "no framework" is the kind of claim that decays one convenient
import at a time.

## The one rule the build enforces

**An explainer with no `Last verified` line does not publish.** §7 requires the line on every
one. The hub's whole value is research a reader can trust, and research with no date on it is an
assertion. The build fails rather than publishing undated — publishing is the irreversible half.

```markdown
# What changed

_Last verified: 2026-08-23_
```

## Cloudflare Pages

| Setting | Value |
|---|---|
| Build command | `node build.mjs` |
| Output directory | `dist` |
| Root directory | `/` |
| Production branch | `main` |

The site is served under `/surfaces/`, so the Pages project is attached to `monkstone.org` with
that path prefix. `radar.monkstone.dev` is unrelated infrastructure and stays where it is.

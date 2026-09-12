# MosaicSync 1.33.0.17 QA / release-candidate checklist

Status: **PASS** — final-source clean-room certification required and completed before handoff.

## Scope

Snow Leopard II **Step 7 — runtime loading/dead work** audits the post-Step-6 runtime graph and removes one proven duplicate startup edge.

`builtin-icons.js` remains a parser-time classic script before `render-bootstrap.js`, preserving first-paint built-in shortcut glyphs. The main `newtab.js` no longer also statically imports the same idempotent helper.

## Red-before-green proof

`tests/optimization-133017.test.mjs` was applied to untouched 1.33.0.16 before implementation:

- **3/4 PASS, 1/4 FAIL** — the classic first-paint owner and authoritative global consumer were already correct, while the duplicate ES-module import was still present.

After removing the duplicate import:

- **4/4 PASS** before the evidence/roadmap closure assertion was added.

The permanent Step-7 regression now also freezes the measured census and roadmap closure.

## Measured critical-path change

- Static New Tab ES-module closure: **23 → 22 modules**.
- Raw static-module source: **644,249 → 640,098 bytes** (**−4,151 bytes**).
- Parser-blocking classic scripts: **9 → 9**.
- Parser-blocking classic bytes: **28,892 → 28,892**.

## Reachability / retention decisions

Post-change runtime reachability:

- high-confidence unreachable shared modules: **0**;
- unused named imports: **0**;
- unreferenced private functions: **0**.

Retained review surfaces are deliberate defensive/reference APIs, benchmark/test equivalence helpers or explicit test hooks. No additional deletion candidate was proven. Small interaction-only helpers were not split into new asynchronous ownership boundaries merely to save a few kilobytes.

## Focused verification

- Startup: **241/241 PASS**
- New Tab: **457/457 PASS**
- Sync: **277/277 PASS**
- Recovery: **152/152 PASS**
- Browser/parity/permissions: **178/178 PASS**
- Core: **164/164 PASS**
- Security: **146/146 PASS**
- Release: **345/345 PASS** (337 ordinary release assertions plus 8 isolated instrumentation assertions)

## Authoritative full suite

- ordinary tests: **1,234/1,234 PASS**
- Step-0/Step-1 instrumentation bundle: **8/8 PASS**
- total: **1,242/1,242 PASS**

## Browser environment

Browser probe:

- Chromium: available (`/usr/bin/chromium`)
- Xvfb: available (`/usr/bin/Xvfb`)
- ChromeDriver: unavailable
- Firefox: unavailable
- GeckoDriver: unavailable

Certification therefore remains **MECHANICAL_ONLY** for real-browser startup timing/heap behavior.

## Release contracts / reproducibility

- generated Firefox/Chromium trees: **PASS**
- packaged Firefox ZIP: **PASS**
- packaged Chrome ZIP: **PASS**
- candidate clean-room rebuild/repackage: **PASS**
- candidate Firefox/Chrome/source/build-manifest byte-for-byte reproduction: **PASS**
- final QA-sealed source clean-room rebuild/repackage: **PASS before handoff**
- final-source **1,242/1,242** test proof: **PASS before handoff**


## Package census

- Firefox: **2,424,277 raw / 708,037 deflated bytes**.
- Chromium: **2,445,920 raw / 722,553 deflated bytes**.
- Versus rebuilt 1.33.0.16, each runtime tree is **29 raw bytes / 9 deflated bytes smaller**. The primary Step-7 win is evaluation topology, not package size: the 4,151-byte helper remains packaged because first paint still needs it.

## Candidate clean-room reproduction

Fresh extraction of the pre-QA-seal GitHub-ready candidate reproduced: deterministic build, **1,242/1,242 PASS**, reachability 0/0/0, generated/package contracts PASS, and Firefox/Chrome/source/build-manifest artifacts byte-for-byte. The final handoff repeats the same proof after this QA record is sealed; no source edit is permitted afterward.

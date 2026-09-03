# MosaicSync 1.30.18.39 QA / release-candidate checklist

## Scope

Narrow post-freeze UI and documentation correction only:

1. fit the complete shortcut editor on common wide-but-short laptop viewports;
2. move artwork explanations into an accessible question-mark information bubble;
3. preserve hover highlight/lift without fractional favicon resampling;
4. link the official Chrome Web Store listing from the README;
5. release identity, documentation and permanent regressions.

No Sync, Recovery, first-paint, permission, CSP, schema, browser-adapter, localization-catalog, privacy-boundary or user-data-format change is authorized.

## Negative proof against 1.30.18.38

The three new corrective regressions were applied to a clean extraction of authoritative 1.30.18.38 before production changes.

- corrective tests: **0/3 pass, 3/3 fail** as required;
- no height-aware shortcut-editor layout or information bubble existed;
- shortcut hover still scaled the complete tile by `1.045`;
- the README did not contain the official Chrome Web Store listing.

## Candidate gates

- focused 1.30.18.39 corrective regressions: **3/3 PASS**
- focused inherited shortcut-editor/hover preservation suite: **40/40 PASS**
- full regression suite: **971/971 PASS**
- runtime reachability: **PASS** — 0 unreachable shared modules, 0 unused named imports, 0 unreferenced private functions
- benchmark: **PASS**
- runtime size report: **PASS** — Firefox 2,185,779 raw / 643,976 deflated bytes; Chrome 2,207,423 raw / 658,492 deflated bytes
- generated Firefox/Chromium release contracts: **PASS**
- deterministic Firefox/Chrome/source packaging: **PASS**
- packaged release contracts: **PASS**
- exact clean-source extraction/rebuild/retest/repackage: **PASS**
- byte-for-byte Firefox/Chrome/source/build-manifest reproduction: **PASS**
- automated certification status: **MECHANICAL ONLY (NOT FULL CERTIFICATION)**
- real Firefox user smoke: **REQUIRED BEFORE PUBLICATION**

## Browser-automation environment limitation

The build environment exposes no supported Firefox/GeckoDriver/Chrome-for-Testing combination. The browser-smoke probe therefore reports no runnable browser/driver pair, and the full certifier must fail closed. Mechanical and clean-room results are recorded separately and are not described as FULL certification.

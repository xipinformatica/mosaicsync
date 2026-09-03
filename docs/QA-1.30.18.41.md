# MosaicSync 1.30.18.41 QA / release-candidate checklist

## Scope

Narrow correction of the residual Frequently Visited first-frame movement:

1. make hidden reservation, live and padding cards share one explicit row height;
2. keep title and hostname line boxes within that stable height;
3. preserve responsive configured capacity, disabled zero-space behavior and the existing decode-before-commit path;
4. add no measurement, timer, I/O or delayed first paint;
5. update release identity, publication text and permanent regressions.

No Sync, Recovery, permission, CSP, schema, browser-adapter, localization-catalog, privacy-boundary or user-data-format change is authorized.

## Negative proof against 1.30.18.40

The three new corrective regressions were applied before production changes.

- corrective tests: **2/3 pass, 1/3 fail** as required;
- the missing explicit shared row height failed while both preservation checks passed.

## Candidate gates

- focused 1.30.18.41 and historical FV continuity regressions: **12/12 PASS**
- full regression suite: **977/977 PASS**
- runtime reachability: **PASS** — 0 unreachable shared modules, 0 unused named imports, 0 unreferenced private functions
- benchmark: **PASS**
- runtime size report: **PASS** — Firefox 2,186,938 raw / 644,245 deflated bytes; Chrome 2,208,582 raw / 658,761 deflated bytes
- generated and packaged browser release contracts: **PASS**
- deterministic Firefox/Chrome/source packaging: **PASS**
- exact clean-source rebuild/retest/repackage and byte reproduction: **PASS**
- automated certification status: **MECHANICAL ONLY (NOT FULL CERTIFICATION)**
- real Firefox user smoke: **REQUIRED BEFORE PUBLICATION**

## Browser-automation environment limitation

The build environment exposes no supported Firefox/GeckoDriver/Chrome-for-Testing combination. The full certifier therefore cannot run the real-browser lane. Mechanical and clean-room results are recorded separately and are never described as FULL certification.

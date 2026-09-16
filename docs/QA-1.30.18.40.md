# MosaicSync 1.30.18.40 QA / release-candidate checklist

## Scope

Narrow correction of the published 1.30.18.39 shortcut-editor presentation:

1. make artwork help hover-only for pointer users, non-persistent and width-constrained;
2. retain an equivalent keyboard-focus help path;
3. place all four existing artwork actions in one desktop row;
4. remove unintended Light-mode backgrounds from labels and legends while preserving control surfaces;
5. update release identity, publication text and permanent regressions.

No Sync, Recovery, first-paint, permission, CSP, schema, browser-adapter, localization-catalog, privacy-boundary or user-data-format change is authorized.

## Negative proof against 1.30.18.39

The three new corrective regressions were applied to a clean extraction of the published 1.30.18.39 GitHub-ready source before production changes.

- corrective tests: **0/3 pass, 3/3 fail** as required;
- artwork help required native disclosure activation and retained its open state;
- the compact action group used two rows;
- Light-mode labels inherited the white input surface.

## Candidate gates

- focused 1.30.18.40 corrective regressions: **3/3 PASS**
- focused correction/identity/accessibility preservation set: **16/16 PASS**
- full regression suite: **974/974 PASS**
- runtime reachability: **PASS** — 0 unreachable shared modules, 0 unused named imports, 0 unreferenced private functions
- benchmark: **PASS**
- runtime size report: **PASS** — Firefox 2,186,766 raw / 644,203 deflated bytes; Chrome 2,208,410 raw / 658,719 deflated bytes
- generated and packaged browser release contracts: **PASS**
- deterministic Firefox/Chrome/source packaging: **PASS**
- exact clean-source rebuild/retest/repackage and byte reproduction: **PASS**
- automated certification status: **MECHANICAL ONLY (NOT FULL CERTIFICATION)**
- real Firefox user smoke: **REQUIRED BEFORE PUBLICATION**

## Browser-automation environment limitation

The build environment exposes no supported Firefox/GeckoDriver/Chrome-for-Testing combination. The full certifier therefore fails closed at the real-browser lane. Mechanical and clean-room results are recorded separately and are never described as FULL certification.

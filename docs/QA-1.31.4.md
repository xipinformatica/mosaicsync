# MosaicSync 1.31.4 QA / release-candidate checklist

## Scope

Build a narrow localization-responsive Settings correction from the authoritative packaged MosaicSync 1.31.3 source. Fix the separate Light/Dark wallpaper darkness rows so long localized labels cannot overflow their half-card or collide with the neighbouring control. Keep wording and behavior unchanged.

## Required invariants

- each Light/Dark wallpaper darkness label owns a full-width row above its slider + percentage;
- long unbreakable labels may wrap safely rather than widening the control;
- the same layout works for every one of the 33 shipped runtime locales;
- no translation text, setting semantics, wallpaper behavior, permission, Sync/Recovery logic, persisted schema, CSP or browser floor changes;
- the Developer Guide remains present and records the localization-responsive layout rule.

## Candidate gates

- authoritative 1.31.3 source base: **PASS** — SHA-256 `4c2a746e15294f54eaa357a4507caf8698e6a1f432d1aefae931f30751202ac6`
- focused 1.31.4 regression proven red on untouched 1.31.3: **PASS**
- focused 1.31.4 regressions after fix: **PASS — 2/2**
- all 33 runtime locale catalogs include `backgroundDarkness`: **PASS**
- full regression suite: **PASS — 1021/1021, 0 failed, 0 skipped**
- runtime reachability: **PASS — zero high-confidence unreachable shared modules, unused named imports or unreferenced private functions**
- performance benchmark: **PASS**
- package-size contract: **PASS — critical First Paint CSS unchanged; reviewed total runtime-CSS ceiling consciously rebased from 127,750 to 128,000 bytes for the ~200-byte secondary-CSS localization fix**
- deterministic three-ZIP packaging: **PASS**
- clean-source mechanical certification: **PASS — clean source ZIP rebuilt/retested at 1021/1021 and reproduced Firefox/Chrome/source ZIPs plus build manifest byte-for-byte**
- real Firefox + Chromium smoke: **UNAVAILABLE IN THIS ENVIRONMENT — Chromium/Xvfb present but no chromedriver; Firefox/geckodriver absent**

## Final scope verdict

**PASS — MECHANICAL_ONLY.** All supported non-browser release gates and deterministic clean-source reproduction passed. Real-browser smoke is not claimed because the required browser/driver pairs are unavailable in this environment.

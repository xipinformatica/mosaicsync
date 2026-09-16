# MosaicSync 1.31.3 QA / release-candidate checklist

## Scope

Build a narrow behavior correction from the authoritative packaged MosaicSync 1.31.2 source. Fix the new-device case where synchronized Frequently Visited intent is ON but the device-local optional Top Sites permission has not yet been requested. Use an existing setup gesture for an immediate permission request when the complete synchronized copy is already known; otherwise present a one-time localized permission step after the ON preference arrives. Also change fresh/default grid geometry to 11 columns × 4 rows without changing existing saved layouts or adjustable bounds.

## Required invariants

- Frequently Visited ON/OFF/count may synchronize; Top Sites permission and history-derived site candidates remain device-local;
- no optional permission prompt is attempted automatically without a user gesture;
- if a complete synchronized copy with FV ON is known during an explicit source-choice/setup click, `permissions.request()` begins synchronously in that click stack before awaited work;
- if FV ON becomes authoritative later, a one-time translated permission step is shown and the existing inline Grant-permission recovery remains available;
- declining/continuing does not silently turn synchronized FV intent OFF;
- all visible new-step wording resolves through strings already present in all 33 runtime locale catalogs;
- fresh/default profiles use 11 columns × 4 rows; existing persisted layout choices and 6–12 column / 2–8 row bounds remain unchanged;
- no permission-list, host-permission, CSP, persisted schema, Sync/Recovery wire-format, browser-floor or unrelated architecture change.

## Candidate gates

- authoritative 1.31.2 source base: **PASS** — built from the packaged GitHub-ready 1.31.2 release artifact
- focused 1.31.3 regressions: **5/5 PASS**
- existing Frequently Visited permission regressions: **PASS**
- locale coverage: **PASS** — all 33 runtime locales contain every string used by the new permission step
- full regression suite: **PASS — 1019/1019, 0 failed, 0 skipped**
- runtime reachability: **PASS — zero high-confidence unreachable shared modules, unused named imports or unreferenced private functions**
- performance benchmark: **PASS**
- package-size contract: **PASS**
- deterministic three-ZIP packaging: **PASS**
- clean-source mechanical certification: **PASS — clean source ZIP rebuilt/retested at 1019/1019 and reproduced Firefox/Chrome/source ZIPs plus build manifest byte-for-byte**
- real Firefox + Chromium smoke: **UNAVAILABLE IN THIS ENVIRONMENT — Chromium/Xvfb present but no chromedriver; Firefox/geckodriver absent**

## Final scope verdict

**PASS — MECHANICAL_ONLY.** All supported non-browser release gates and clean-room deterministic reproduction passed. Real-browser smoke is not claimed because the required browser/driver pairs are unavailable in this environment.

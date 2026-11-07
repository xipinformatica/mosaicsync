# MosaicSync 1.33.0.91 QA / release-candidate checklist

**Private candidate. Independent approval pending. Do not publish from this document alone.**

## Baseline and scope

- Source baseline: exact canonical 1.33.0.89 GitHub-ready archive, SHA-256 `7007d5f3dde894ca74c0ff8461b3ffbd5e9b1c4da53e978460f2c58cc441c6ca`.
- Only runtime corrective: Claude's independently reviewed `mosaicsync-1.33.0.89-tile-icon-attribution-v4.patch`, SHA-256 `7c625c275ad33b6ba8a1eb1497d401a9202f891d0a8177633d89d1afae35c113`.
- Runtime sources touched by patch: `src/shared/background/background-core.js`, `src/shared/newtab/newtab.js`. Source version metadata additionally changes in manifests, constants, and visible New Tab version.
- Existing tests edited in place: `tests/features-1260.test.mjs`, `tests/harness/background-runtime-scenario.mjs`. No new test files.
- No SVG code from rejected 1.33.0.90. No Stage 3B, Sync/Recovery, permission, schema, naming or listener-topology changes. `DEVELOPER-GUIDE.md` untouched.

## Must-pass checks before publication

- Independent source/runtime diff from .89: only v4 patch plus explicit version metadata/doc/test updates.
- Complete test inventory, full regression, build-manifest parity, release contract and dependency/reachability checks.
- Deterministic Chrome, Firefox and GitHub-ready archives, SHA-256 verification and clean-room reconstruction.
- Real Chrome (including older compatibility target) and Firefox >=140: first-party favicon, 403-protected site, slow page/worker suspension, normal click, right/middle-click, abandoned page then unrelated site, sibling subdomain, different port, same-host `www.` upgrade.
- Explicitly test intended trade-off: cross-host redirect to protected favicon may leave icon unchanged; do not incorrectly credit as feature parity with .89.
- Check that manually chosen icons, local image sync eligibility, user-provided names, Sync/Recovery and existing shortcut state do not change.
- No broad tabs, webNavigation or history permission; no telemetry, cross-domain tracking or external favicon services.
- Fresh Firefox 140+ and Chromium real-browser release gate at the exact candidate hash, including automatic naming redirect smoke; do not quietly disregard flaky CI.
- Owner approves independent reviewer verdict and performs publication; this workflow does not publish to GitHub or stores.

## Known residuals

- A single hostname/port can serve different favicon-bearing apps under different paths. Distinguishing a page reached by redirect from a typed URL under that same host cannot be proved from the existing tab events; bounded 2-minute marker is retained. This is an acknowledged narrow ambiguity.
- Waking the background for unrelated tab updates is an accepted existing cost; the withdrawn lazy-listener optimization must not be reintroduced.
- Rare favicon learning miss if user navigates before a sleeping worker handles a message remains unchanged from .89.

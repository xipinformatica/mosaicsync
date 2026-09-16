# MosaicSync 1.33.0.5 QA / release-candidate checklist

## Scope

Process-only corrective requested as the post-1.33.0.4 ".4.1" follow-up. Chromium manifests permit at most four numeric version components, so the valid unified release identity is **1.33.0.5**. Canonical 1.33.0.4 Wallpaper Gallery production behavior is intentionally unchanged.

## Process changes

- `tests/optimization-13304.test.mjs` is now explicitly selected by both focused `startup` and `newtab` test groups, so the canonical Step-3A lazy Wallpaper Gallery contract is exercised during focused certification rather than only the full/release suite.
- `tools/critical-path-census.mjs` now masks raw `<script>` and `<style>` contents before structural HTML counting via `tools/critical-path-html.mjs`. HTML-looking strings inside raw-text elements can no longer be miscounted as live DOM while source length/newline positions remain stable.

## Production behavior

- Canonical dynamic `newtab/wallpaper-gallery-shell.js` implementation is unchanged.
- No New Tab behavior change apart from the normal version label.
- No Sync, Recovery, persistence, permission, schema, profile-format, CSP or browser-floor change.
- Step 3 remains **IN PROGRESS**; this release does not begin Step 3B.

## Permanent coverage

- `tests/process-13305.test.mjs`
  - focused Startup and New Tab groups must include `optimization-13304.test.mjs`;
  - raw script/style text masking must remove HTML-looking fake elements while preserving real markup and source length;
  - the critical-path census must apply raw-text masking before structural parsing.
- The new process regression was demonstrated **red 3/3 on canonical 1.33.0.4** and green after implementation.

## Deterministic Step-3A census

Production structure remains the canonical 1.33.0.4 result:

- Initial live DOM: **631** elements.
- Secondary Settings/dialog live DOM: **523** elements.
- Eager ID bindings: **198**.
- Secondary eager bindings: **163**.
- Static New Tab module closure: **24 modules / 655,718 raw source bytes**.
- Deferred module closure: **41 modules / 1,099,841 raw source bytes**.

## Final verification

- Full release-authoritative suite: **1,179/1,179 PASS**.
- Startup group: **182/182 PASS** (now includes canonical Step-3A coverage).
- New Tab group: **413/413 PASS** (now includes canonical Step-3A coverage).
- Release group: **282/282 PASS**.
- Runtime reachability: no high-confidence unreachable shared modules, unused named imports or unreferenced private functions.
- Release contract: **PASS** for Firefox and Chromium generated trees.
- Package size: Firefox **2,411,733 raw / 704,607 deflated bytes**; Chromium **2,433,375 raw / 719,122 deflated bytes**. Raw bytes are unchanged from canonical 1.33.0.4; compressed payload changes by one byte per browser due to release identity.
- Browser probe: Chromium and Xvfb available; ChromeDriver absent; Firefox and GeckoDriver absent. Real-browser smoke/timing remains unavailable and is not claimed.
- Deterministic packaging / clean-room source reproduction: **PASS**. A fresh extraction of the GitHub-ready ZIP rebuilt, passed **1,179/1,179** tests, repackaged, and reproduced the Firefox ZIP, Chrome ZIP, source ZIP and `build-manifest.json` byte-for-byte. The final QA wording is included in the source ZIP and reverified in the final clean-room pass.

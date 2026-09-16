# MosaicSync 1.33.0.6 QA / release-candidate checklist

Snow Leopard II Step 3B. Built from authoritative 1.33.0.5. Scope is limited to lazy Bookmarks secondary UI plus the normal release identity/docs/tooling needed to certify it.

## Required behavior

- [x] `#bookmarksButton` remains in the initial primary launcher.
- [x] `#bookmarksDialog` and all Bookmarks child controls are absent from initial `newtab.html`.
- [x] `bookmarks-controller.js` is not statically imported by `newtab.js`.
- [x] `bookmarks-controller.js` and `bookmarks-shell.js` are dynamically loaded on first Bookmarks use.
- [x] Existing Bookmarks controller remains the dedicated UI owner after activation.
- [x] `core/bookmarks.js` remains lazy.
- [x] Secondary CSS still resolves before the Bookmarks dialog becomes visible.
- [x] Lazy shell uses safe DOM APIs only; no `innerHTML`, `outerHTML`, `insertAdjacentHTML` or remote markup.
- [x] Sync/Recovery/storage authority is unchanged.

## Frozen structural evidence

See `docs/SNOW-LEOPARD-II-STEP3B-1.33.0.6.json`.

- initial live DOM: 598 elements (490 secondary)
- eager ID bindings: 186 (151 secondary)
- static New Tab closure: 23 modules / 640,462 raw source bytes
- startup HTML: 49,564 bytes
- deferred roots include `newtab/bookmarks-controller.js` and `newtab/bookmarks-shell.js`

## Verification

- [x] Full test suite — 1,186/1,186 PASS
- [x] Startup group — 189/189 PASS
- [x] New Tab group — 420/420 PASS
- [x] Security group — 146/146 PASS
- [x] Release group — 289/289 PASS
- [x] Runtime reachability — no high-confidence unreachable shared modules, unused named imports or unreferenced private functions
- [x] Size baseline/release contract — PASS
- [x] Browser smoke probe — Chromium + Xvfb present, no ChromeDriver; Firefox/GeckoDriver absent; real-browser certification unavailable
- [x] Final clean-room extraction/rebuild/retest/repackage byte-identical — verified from packaged GitHub-ready source

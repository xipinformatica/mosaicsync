# MosaicSync 1.33.0.18 QA / release-candidate checklist

Status: **PASS** — final-source clean-room certification required before handoff.

## Scope

Snow Leopard II **Step 8 — final freeze/adversarial certification**. No additional performance optimization. Production changes are limited to final native-dialog `.open` re-checks in Bookmarks and Wallpaper Gallery after asynchronous setup.

## Red-before-green

Against untouched 1.33.0.17, direct spec-accurate native-dialog mocks reproduced both inherited races:

- Bookmarks rapid open: **FAIL** — two `showModal()` calls; second rejects with `InvalidStateError`.
- Wallpaper Gallery rapid open: **FAIL** — two `showModal()` calls; second rejects with `InvalidStateError`.

With 1.33.0.18:

- Bookmarks rapid open: **PASS** — one modal open, both attempts settle without error.
- Wallpaper Gallery rapid open: **PASS** — one modal open, both attempts settle without error.

The Step-7 built-in-icon runtime hardening test executes the real source twice and verifies the second evaluation preserves the identical immutable working API.

## Production-diff boundary

Compared with 1.33.0.17, runtime behavior changes are one guard in `bookmarks-controller.js` and one guard in `newtab.js`. `background-core.js`, `sync-pending-journal.js`, `model.js`, `storage.js` and `concurrency.js` are byte-identical.

## Final freeze measurements

- New Tab initial DOM: **598 elements / 49,565 raw HTML bytes** (Step-0: 642 / 52,905).
- Eager static module closure: **22 modules / 640,143 raw bytes** (Step-0: 24 / 653,457).
- Parser-blocking classic scripts: **9 / 28,892 raw bytes**.
- Reachability: **0 unreachable shared modules / 0 unused named imports / 0 unreferenced private functions**.
- Firefox runtime tree: **2,424,360 raw / 708,042 deflated bytes**.
- Chromium runtime tree: **2,446,003 raw / 722,559 deflated bytes**.
- Routine Sync-watch: **5 local reads / 2 local writes / 2 full Sync reads**.
- GC-due Sync-watch: **7 / 3 / 3**.
- Sync-on startup: **11 / 3 / 2**.

The quick synthetic benchmark suite completed successfully, but host-sensitive millisecond values are not used as a cross-release pass/fail claim. Real-browser timing/heap magnitude is also not claimed.

## Focused verification

- Startup: **245/245 PASS**
- New Tab: **461/461 PASS**
- Sync: **277/277 PASS**
- Recovery: **152/152 PASS**
- Browser/parity/permissions: **178/178 PASS**
- Core: **164/164 PASS**
- Security: **146/146 PASS**
- Release: **349/349 PASS** (341 ordinary release assertions plus 8 isolated instrumentation assertions)

## Authoritative full suite

- ordinary tests: **1,238/1,238 PASS**
- Step-0/Step-1 instrumentation: **8/8 PASS**
- total: **1,246/1,246 PASS**

## Browser environment

- Chromium: `/usr/bin/chromium`
- Xvfb: `/usr/bin/Xvfb`
- ChromeDriver: unavailable
- Firefox: unavailable
- GeckoDriver: unavailable

Certification remains **MECHANICAL_ONLY** for real-browser timing/heap behavior.

## Release contracts / candidate reproducibility

- generated Firefox/Chromium trees: **PASS**
- packaged Firefox ZIP: **PASS**
- packaged Chrome ZIP: **PASS**
- candidate clean-room rebuild: **PASS**
- candidate clean-room tests: **1,246/1,246 PASS**
- candidate reachability: **0/0/0**
- candidate Firefox/Chrome/source/build-manifest byte-for-byte reproduction: **PASS**

The final handoff repeats this proof after the QA/evidence/final-audit records are sealed; no file is edited after that final-source proof.

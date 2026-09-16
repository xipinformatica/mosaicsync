# MosaicSync 1.33.0.18 — Snow Leopard II final adversarial freeze audit

## Verdict

**GO — Snow Leopard II COMPLETE.**

1.33.0.18 is the freeze endpoint. Step 8 introduced no further performance optimization. It reproduced and closed the two inherited LOW native-dialog reentrancy races carried from the Step-7 audits and added the missing runtime execution regression for the built-in icon ownership contract.

## Final production diff from 1.33.0.17

Only four shared runtime files differ:

- `core/constants.js` — version only;
- `newtab/newtab.html` — Settings version label only;
- `newtab/bookmarks-controller.js` — one final `bookmarksDialog.open` re-check after async setup and before `showModal()`;
- `newtab/newtab.js` — one final `wallpaperGalleryDialog.open` re-check after lazy shell acquisition and before target/render/show.

The following correctness/authority owners are byte-identical to 1.33.0.17:

- `background/background-core.js`;
- `background/sync-pending-journal.js`;
- `core/model.js`;
- `core/storage.js`;
- `core/concurrency.js`.

## Red-before-green closure

Untouched 1.33.0.17, using spec-accurate native-dialog mocks:

- Bookmarks rapid same-session open: **FAIL** — two `showModal()` calls; second throws `InvalidStateError`.
- Wallpaper Gallery rapid same-session open: **FAIL** — two `showModal()` calls; second throws `InvalidStateError`.

1.33.0.18 candidate:

- Bookmarks: **PASS** — one modal open; both attempts settle without error.
- Wallpaper Gallery: **PASS** — one modal open; both attempts settle without error.

The Step-7 built-in icon ownership is now runtime-executed: a second evaluation preserves the identical working API and the installed global property is non-writable/non-configurable.

## Final deterministic Snow Leopard II comparison

| Deterministic surface | Step 0 | Final 1.33.0.18 | Delta |
|---|---:|---:|---:|
| Initial New Tab DOM elements | 642 | 598 | -44 |
| Initial New Tab HTML raw bytes | 52,905 | 49,565 | -3,340 |
| Initial dialogs | 6 | 4 | -2 |
| Eager static New Tab modules | 24 | 22 | -2 |
| Eager static module raw bytes | 653,457 | 640,143 | -13,314 |
| High-confidence unreachable shared modules | — | 0 | clean |
| Unused named imports | — | 0 | clean |
| Unreferenced private functions | — | 0 | clean |

Package size is deliberately not treated as the success metric. The final runtime includes correctness/test-era product code while startup work is measurably reduced.

## Storage/background freeze

Both Firefox- and Chromium-shaped deterministic scenarios remain at the Step-5 certified boundaries:

- routine Sync-watch: **5 local reads / 2 local writes / 2 full Sync reads**;
- GC-due Sync-watch: **7 / 3 / 3**;
- established Sync-on startup: **11 / 3 / 2**.

No Step-8 read removal occurred.

## Lifetime/memory freeze

Step-6 protections remain intact:

- Wallpaper Gallery generated payload clears on close;
- Recovery generated controls clear on close and per-open generations reject superseded async results;
- Bookmarks arrays/DOM reset and generation ownership rejects stale permission/tree results;
- folder generated controls clear on close;
- Custom Branding invalidates draft/upload ownership;
- locale/background/favicon/Recovery caches remain bounded;
- image worker pending requests clear and the worker idles out.

Real-browser heap/GC timing remains unclaimed because compatible browser/driver pairs are unavailable.

## Certification

Focused groups:

- Startup **245/245**
- New Tab **461/461**
- Sync **277/277**
- Recovery **152/152**
- Browser/parity/permissions **178/178**
- Core **164/164**
- Security **146/146**
- Release **349/349**

Authoritative repository:

- ordinary tests **1,238/1,238**;
- Snow Leopard instrumentation **8/8**;
- total **1,246/1,246 PASS**.

Candidate clean-room extraction rebuilt and retested to the same result, with clean reachability and generated/package contracts, and reproduced Firefox/Chrome/source/build-manifest artifacts byte-for-byte.

## Environment limitation

Available: Chromium + Xvfb. Unavailable: ChromeDriver, Firefox, GeckoDriver. Therefore no exact real-browser millisecond or heap-size claim is made.

## Freeze decision

**Snow Leopard II is complete and frozen at 1.33.0.18.** Further performance work requires new measured evidence and should begin as a new named journey.

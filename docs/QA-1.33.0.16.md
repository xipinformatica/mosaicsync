# MosaicSync 1.33.0.16 QA / release-candidate checklist

Status: **PASS** — final-source clean-room certification complete.

## Scope

Snow Leopard II **Step 6D** releases the folder popover's generated item controls/listener closures on close and closes Step 6 after reassessing the remaining app-owned lifetime surfaces.

Production behavior change is intentionally narrow: `closeFolder()` now calls `folderItems.replaceChildren()` before clearing active folder ownership. Folder data remains in normalized New Tab state and `openFolder()` still rebuilds synchronously before display.

## Red-before-green proof

`tests/optimization-133016.test.mjs` was run on untouched 1.33.0.15 before implementation:

- **0/4 PASS** — generated folder-item controls remained retained after close; Step-6D evidence/closure did not exist.

After the production change:

- **4/4 PASS**.

The fixture uses 40 generated item roots and 50 repeated close cycles. Retention moves **40 → 0** after every close, including idempotent already-hidden close.

## Correctness boundaries audited

- `openFolder()` rebuilds `folderItems` synchronously from current authoritative folder state before exposing the popover.
- Deferred local-artwork hydration renders only while the same folder is still active and `folderPopover.hidden === false`.
- Cross-Space drag calls `preserveCrossSpaceDragElement()` before `closeFolder()`, so clearing the popover does not destroy the active drag source.
- Folder state/model, Sync, Recovery, storage, permission, schema and network authority are unchanged.

Folder-specific adversarial lane: **65/65 PASS**.

## Focused verification

- Startup: **236/236 PASS**
- New Tab: **452/452 PASS**
- Sync: **277/277 PASS**
- Recovery: **152/152 PASS**
- Browser/parity/permissions: **178/178 PASS**
- Core: **164/164 PASS**
- Security: **146/146 PASS**
- Release: **340/340 PASS** (332 release/identity assertions plus the 8 instrumentation tests run separately to avoid wrapper contention)

## Authoritative full suite

Deterministic file batching with Node test concurrency forced to 1:

- ordinary tests: **1,229/1,229 PASS**
- Step-0/Step-1 instrumentation bundle: **8/8 PASS**
- total: **1,237/1,237 PASS**

No test was weakened to hide a behavioral failure. Historical Step-6A/6C tracker assertions were evolved only to permit Step 6's legitimate transition from IN PROGRESS to DONE while retaining their feature invariants.

## Step-6 lifetime closure audit

The remaining audited owners are either explicitly cleared, bounded, or intentionally New-Tab-lifetime:

- Wallpaper Gallery — generated grid cleared on close; reusable lazy shell/module retained intentionally.
- Recovery manager — generated list cleared; open-session generations reject superseded async UI results.
- Bookmarks — dynamic arrays/DOM reset; open-session generations reject superseded tree/permission results.
- Shortcut editor/favicon choices — dynamic choices cleared/cancelled; generation guards stale completions.
- Custom Branding — draft cleared and upload generation advanced on close.
- Locale catalogs — small bounded LRU.
- Background preload — bounded cache.
- Favicon caches — bounded and/or TTL-owned.
- Recovery decode cache — bounded recent-device cache.
- Image worker — pending requests clear and worker terminates after idle.
- Export object URL — explicitly revoked.
- Folder popover — generated item controls cleared on close in Step 6D.

This is a **mechanical ownership/convergence** conclusion, not a browser-heap byte claim.

## Reachability / package / browser environment

Reachability:

- high-confidence unreachable shared modules: **0**
- unused named imports: **0**
- unreferenced private functions: **0**

Package census:

- Firefox: **2,424,306 raw / 708,046 deflated bytes**
- Chromium: **2,445,949 raw / 722,562 deflated bytes**

Browser probe:

- Chromium: available
- Xvfb: available
- ChromeDriver: unavailable
- Firefox: unavailable
- GeckoDriver: unavailable

Therefore certification remains **MECHANICAL_ONLY**. Actual browser heap/RSS/GC convergence is not claimed.

## Release contracts

- generated Firefox/Chromium trees: **PASS**
- packaged Firefox ZIP: **PASS**
- packaged Chrome ZIP: **PASS**

## Candidate clean-room reproduction

Fresh extraction of the candidate GitHub-ready ZIP:

- deterministic rebuild: PASS
- **1,237/1,237 PASS**
- reachability: clean
- generated/package contracts: PASS
- repackage: PASS
- Firefox ZIP: byte-for-byte identical
- Chrome ZIP: byte-for-byte identical
- GitHub-ready source ZIP: byte-for-byte identical
- `build-manifest.json`: byte-for-byte identical

## Final-source proof

The QA-sealed GitHub-ready source was freshly extracted and repeated the complete deterministic proof: rebuild PASS, **1,237/1,237 tests PASS**, reachability clean, generated/package contracts PASS, and Firefox/Chrome/source/build-manifest artifacts reproduced byte-for-byte. The handoff source ZIP is produced from this final QA state and receives one last exact-byte clean-room verification before delivery.

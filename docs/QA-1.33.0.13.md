# MosaicSync 1.33.0.13 QA / release-candidate checklist

Status: PASS — MECHANICAL_ONLY

## Scope

- Snow Leopard II Step 6A lifetime/memory correction only.
- Release generated Wallpaper Gallery choice nodes on native dialog close.
- Preserve one lazy reusable shell and existing synchronous render-before-show behavior.
- No Sync, Recovery, permission, persisted-schema, network, browser-floor or privacy-boundary change.

## Red-before-green evidence

- Untouched 1.33.0.12: Step-6A regression **RED 4/4**.
  - closing the lazy Wallpaper Gallery retained all 90 dynamic fixture elements;
  - repeated close/reopen cycles converged to the same retained 90-element payload rather than shell-only state;
  - Step-6A evidence/tracker did not yet exist.
- 1.33.0.13 implementation: Step-6A regression **GREEN 4/4**.
- Repeated-cycle harness: **50 cycles**, one reused shell, **90 -> 0** dynamic fixture elements after every close.

## Focused verification

- Startup: **226/226 PASS**.
- New Tab: **442/442 PASS**.
- Sync: **277/277 PASS**.
- Recovery: **142/142 PASS**.
- Browser/parity/permissions: **178/178 PASS**.
- Core: **164/164 PASS**.
- Security: **146/146 PASS**.
- Release: **326/326 PASS**.
- Targeted lazy-UI/ownership audit (Step 3A Wallpaper Gallery, lazy Bookmarks, Step 6A and Custom Branding ownership): **20/20 PASS**.

## Authoritative full suite

Because the four Step-0 benchmark tests are child-process-heavy and can stall when mixed into the monolithic Node test process in this environment, the authoritative suite was executed contention-safely:

- ordinary tests in four deterministic `--test-concurrency=1` batches: **1,219/1,219 PASS**;
- four Step-0 benchmark tests individually: **4/4 PASS**;
- total: **1,223/1,223 PASS**.

The one-shot `certify:mechanical` wrapper was not used as the final pass/fail authority because its embedded monolithic `npm test` hit this known environment timeout while tests were still passing. Its mechanical components were run and verified individually instead.

## Structural / package verification

- Runtime reachability: **PASS**.
  - high-confidence unreachable shared modules: **0**;
  - unused named imports: **0**;
  - unreferenced private functions: **0**.
- Generated release contract: **PASS** for Firefox and Chromium trees.
- Packaged release contract: **PASS** for Firefox and Chromium ZIPs.
- Package-size census:
  - Firefox: **2,421,599 raw / 707,653 deflated payload bytes**;
  - Chromium: **2,443,242 raw / 722,170 deflated payload bytes**.

## Browser environment

Probe result:

- Chromium: available (`/usr/bin/chromium`);
- Xvfb: available (`/usr/bin/Xvfb`);
- ChromeDriver: unavailable;
- Firefox: unavailable;
- GeckoDriver: unavailable.

Therefore **no full real-browser certification and no real-browser heap-convergence claim is made** for 1.33.0.13. Step 6 remains in progress.

## Lifetime audit negative controls

The Step-6A inventory also confirmed existing convergence/bounds rather than rewriting them:

- Bookmarks close/reset already clears dynamic arrays/DOM;
- shortcut editor close cancels and clears favicon candidate state;
- Custom Branding close invalidates upload ownership and releases its draft;
- canonical-host, locale, background-preload, favicon-choice and Recovery decode caches are bounded/self-pruning;
- image-optimizer pending requests settle/clear and the worker idles out;
- local-asset verification state is pruned to live asset IDs.

No production change was made to these already-converging surfaces.

## Clean-room reproducibility — first sealed-candidate pass

The GitHub-ready candidate ZIP was extracted into a fresh directory and then:

1. rebuilt from source;
2. release contracts rechecked;
3. reachability rerun;
4. all **1,223/1,223 tests** rerun with the same contention-safe split;
5. Firefox/Chromium packages regenerated;
6. packaged release contracts rechecked;
7. Firefox ZIP, Chrome ZIP, source ZIP and `build-manifest.json` compared against the originating candidate.

Result: **PASS — all four artifacts byte-for-byte identical**.

## Final-source proof

**PASS.** After embedding this completed QA record, the final GitHub-ready source ZIP was extracted into a second fresh directory and the same clean-room sequence was repeated: deterministic rebuild, generated release contracts, reachability, **1,223/1,223 tests** with the contention-safe split, repackaging and packaged release contracts. The regenerated Firefox ZIP, Chrome ZIP, GitHub-ready source ZIP and `build-manifest.json` were byte-for-byte identical to the final originating artifacts.

# MosaicSync 1.33.0.14 QA / release-candidate checklist

Status: PASS — MECHANICAL_ONLY

## Scope

- Snow Leopard II Step 6B lifetime/memory correction only.
- Release generated Recovery-manager device/generation list nodes on dialog close.
- Prevent late asynchronous Recovery model/cleanup responses from rebuilding hidden controls after close.
- Preserve background-owned Recovery cleanup/revalidation, Sync, journals, permissions, schemas and wire formats.

## Red-before-green evidence

- Untouched 1.33.0.13: Step-6B regression **RED 5/5**.
  - no Recovery-list close-time release owner existed;
  - a model request completing after close still rendered hidden Recovery DOM;
  - a successful cleanup completion could still render hidden Recovery controls;
  - repeated cycles retained the fixture payload;
  - Step-6B evidence did not yet exist.
- 1.33.0.14 implementation: Step-6B regression **GREEN 5/5**.
- Deterministic fixture: **120 -> 0** retained generated nodes after close across **50 cycles**.
- Closed late-model and late-cleanup render calls: **0**.

## Focused verification

- Startup: **231/231 PASS**.
- New Tab: **447/447 PASS**.
- Sync: **277/277 PASS**.
- Recovery: **147/147 PASS**.
- Browser/parity/permissions: **178/178 PASS**.
- Core: **164/164 PASS**.
- Security: **146/146 PASS**.
- Release: **331/331 PASS**.

## Authoritative full suite

The monolithic Node runner remains unsuitable as the final authority in this environment because long child-process-heavy files can exceed the execution wrapper even while assertions remain green. The authoritative suite was therefore executed contention-safely:

- ordinary tests in completed deterministic `--test-concurrency=1` chunks: **1,224/1,224 PASS**;
- four Step-0 tests individually: **4/4 PASS**;
- total: **1,228/1,228 PASS**.

## Structural / package verification

- Runtime reachability: **PASS**.
  - high-confidence unreachable shared modules: **0**;
  - unused named imports: **0**;
  - unreferenced private functions: **0**.
- Generated release contract: **PASS** for Firefox and Chromium trees.
- Packaged release contract: **PASS** for Firefox and Chromium ZIPs.
- Package-size census:
  - Firefox: **2,421,889 raw / 707,702 deflated payload bytes**;
  - Chromium: **2,443,532 raw / 722,218 deflated payload bytes**.

## Browser environment

Probe result:

- Chromium: available (`/usr/bin/chromium`);
- Xvfb: available (`/usr/bin/Xvfb`);
- ChromeDriver: unavailable;
- Firefox: unavailable;
- GeckoDriver: unavailable.

Therefore **no full real-browser certification and no real-browser heap-convergence claim is made** for 1.33.0.14. Step 6 remains in progress.

## Lifetime audit boundary

Step 6B does not cancel Recovery operations on close. A submitted cleanup may safely finish in the background; only hidden UI reconstruction is suppressed. Recovery eligibility, cleanup planning, destructive revalidation and Sync/Recovery storage authority remain in the background service and are unchanged.

Other audited lifetime owners remain bounded or explicitly cleared: Wallpaper Gallery choices (Step 6A), Bookmarks arrays/DOM, shortcut favicon candidates, Custom Branding drafts, locale/background/favicon/Recovery caches, image-worker requests and local-asset verification state.

## Clean-room reproducibility — first sealed-candidate pass

The GitHub-ready candidate ZIP was extracted into a fresh directory and then:

1. rebuilt from source;
2. all **1,228/1,228 tests** rerun with the same contention-safe split;
3. runtime reachability rerun;
4. generated release contracts rechecked;
5. Firefox/Chromium packages regenerated;
6. packaged release contracts rechecked;
7. Firefox ZIP, Chrome ZIP, source ZIP and `build-manifest.json` compared against the originating candidate.

Result: **PASS — all four artifacts byte-for-byte identical**.

## Final-source proof

**PASS.** After embedding this completed QA record, the sealed GitHub-ready source ZIP was extracted into a second fresh directory and rebuilt. The same contention-safe suite completed **1,228/1,228 PASS**, reachability and generated/packaged release contracts passed, and Firefox ZIP, Chrome ZIP, GitHub-ready source ZIP and `build-manifest.json` reproduced byte-for-byte.

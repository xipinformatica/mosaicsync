# MosaicSync 1.33.0.15 QA / release-candidate checklist

Status: **PASS — MECHANICAL_ONLY**

## Scope

- Snow Leopard II Step 6C lifetime corrective only.
- Fix Recovery close→reopen async session ownership.
- Fix Bookmarks late tree/permission ownership after close→reopen.
- Preserve Sync and background Recovery destructive authority unchanged.

## Adversarial findings closed

- Recovery Copies ABA: old request → close → reopen → old response could populate the new session and suppress its fresh fetch. Independently reproduced by OpenAI and Claude.
- Bookmarks late-read ownership: an old bookmark-tree/permission completion could repopulate state after close/reopen. Reproduced red against untouched 1.33.0.14 before production correction.
- Permanent catalogue entries: R-017 and R-018 in `docs/REGRESSION-CATALOG.md`.

## Red-before-green evidence

- Untouched 1.33.0.14 core reproducer: **RED 2/2**.
  - Recovery reopened session failed to start a fresh request while the superseded load remained in flight.
  - Bookmarks adopted the superseded session's delayed tree after close/reopen.
- 1.33.0.15 core corrective: **GREEN 2/2**.
- Permanent Step-6C regression: **GREEN 5/5** in `tests/optimization-133015.test.mjs`.
  - Recovery fresh-request/session ownership;
  - superseded cleanup completes but refreshes the current session;
  - Bookmarks stale-tree rejection;
  - Bookmarks stale permission-completion rejection;
  - developer/roadmap contract.

## Focused verification

- Startup: **236/236 PASS**.
- New Tab: **452/452 PASS**.
- Sync: **277/277 PASS**.
- Recovery: **152/152 PASS**.
- Browser/parity/permissions: **178/178 PASS**.
- Core: **164/164 PASS**.
- Security: **146/146 PASS**.
- Release: **336/336 PASS**.

## Authoritative full suite

The monolithic Node runner remains unsuitable as the final authority in this environment because child-process-heavy Step-0 tests can stall the execution wrapper even while assertions remain green. The authoritative suite was therefore executed contention-safely:

- ordinary tests in completed deterministic chunks: **1,229/1,229 PASS**;
- four Step-0 tests individually: **4/4 PASS**;
- total: **1,233/1,233 PASS**.

## Structural / package verification

- Runtime reachability: **PASS**.
  - high-confidence unreachable shared modules: **0**;
  - unused named imports: **0**;
  - unreferenced private functions: **0**.
- Generated release contract: **PASS** for Firefox and Chromium trees.
- Packaged release contract: **PASS** for Firefox and Chromium ZIPs.
- Package-size census:
  - Firefox: **2,424,034 raw / 707,929 deflated payload bytes**;
  - Chromium: **2,445,677 raw / 722,446 deflated payload bytes**.

## Browser environment

Probe result:

- Chromium: available (`/usr/bin/chromium`);
- Xvfb: available (`/usr/bin/Xvfb`);
- ChromeDriver: unavailable;
- Firefox: unavailable;
- GeckoDriver: unavailable.

Therefore **no full real-browser certification and no real-browser heap-convergence claim is made** for 1.33.0.15. Step 6 remains in progress.

## Authority boundary

1.33.0.15 changes presentation/session ownership only. Recovery cleanup is not cancelled by dialog close and remains owned by the unchanged background cleanup planner/revalidation path. No Normal Sync, pending-journal, Recovery wire-format, storage schema, permission or destructive-authority change is introduced.

## Clean-room reproducibility — first sealed-candidate pass

The GitHub-ready candidate ZIP was extracted into a fresh directory and then:

1. rebuilt from source;
2. all **1,233/1,233 tests** rerun with the same contention-safe split;
3. runtime reachability rerun;
4. generated release contracts rechecked;
5. Firefox/Chromium packages regenerated;
6. packaged release contracts rechecked;
7. Firefox ZIP, Chrome ZIP, source ZIP and `build-manifest.json` compared against the originating candidate.

Result: **PASS — all four artifacts byte-for-byte identical**.

## Final-source proof

**PASS.** After embedding the completed QA record, the QA-sealed GitHub-ready source ZIP was extracted into a fresh directory and rebuilt. The same contention-safe suite completed **1,233/1,233 PASS**, reachability and generated/packaged release contracts passed, and Firefox ZIP, Chrome ZIP, GitHub-ready source ZIP and `build-manifest.json` reproduced byte-for-byte. The exact final source ZIP containing this PASS record is verified once more before handoff.

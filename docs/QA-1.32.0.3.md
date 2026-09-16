# MosaicSync 1.32.0.3 QA / release-candidate checklist

## Scope

Continue the **3rd Maintainability Journey — Ownership & Auditability** from certified MosaicSync 1.32.0.2. Step 5 chooses exactly one New Tab boundary: mechanically extract the Bookmarks dialog UI lifecycle without changing features, browser-Bookmarks behavior, first-paint/startup authority or Sync/Recovery.

## Ownership boundary

`src/shared/newtab/bookmarks-controller.js` owns only the Bookmarks dialog's mutable UI projections, folder/search rendering, bookmark-folder color preference/rendering, dialog permission/read lifecycle and bookmark-local event wiring.

`newtab.js` remains the owner of startup/first paint, global menu coordination, authoritative profile state, and the existing lazy `core/bookmarks.js` loader. `core/bookmarks.js` remains the browser-Bookmarks API adapter/helper and stays lazily imported.

## Required invariants

- no new feature, permission, host permission, CSP, persisted schema or Sync/Recovery wire-format change;
- no storage.local/storage.sync profile read/write moves into the controller;
- no network/image/timer/queue ownership moves into the controller;
- browser Bookmarks API remains lazy and device-local;
- bookmark-folder color preference hydration remains post-paint;
- secondary CSS must still be ready before the Bookmarks dialog becomes visible;
- no await or new effect is added to first paint;
- global pointer/Escape/menu coordination remains in the New Tab orchestrator;
- generated Firefox/Chrome behavior must remain equivalent.

## Regression proof

- New Step-5 ownership/behavior regressions: **10 / 10 passing**.
- The same regressions were run against untouched certified 1.32.0.2 and failed **10 / 10**, proving that they detect the new ownership boundary.
- Historical bookmark color/secondary-style regressions were migrated to follow the moved owner without weakening their assertions.
- Generated New Tab runtime smoke now opens/closes the Bookmarks dialog and checks its listeners on both Firefox- and Chrome-shaped runtimes.
- Full regression suite: **1051 / 1051 passing**.
- Startup targeted group: **168 / 168 passing**.
- New Tab targeted group: **323 / 323 passing**.
- Sync targeted group: **199 / 199 passing**.
- Browser/parity targeted group: **178 / 178 passing**.
- Release targeted group: **170 / 170 passing**.

## Startup/performance acceptance gate

The static New Tab module graph gains one module boundary while moving the same Bookmarks code out of `newtab.js`. `newtab.js` falls from 343,731 raw bytes / 7,557 lines to 329,881 raw bytes / 7,218 lines; the dedicated controller is 16,010 raw bytes / 427 lines. Total New Tab JS therefore grows only 2,160 raw bytes.

An alternating baseline/candidate Node runtime-harness comparison found no meaningful startup regression: paired candidate-minus-baseline import-duration medians were approximately **+0.8 ms** for the Firefox-shaped runtime and **+0.2 ms** for the Chrome-shaped runtime, with substantial process noise in both directions; `interactionReady - moduleStart` remained effectively unchanged. The existing startup suite and normal performance benchmark also pass.

Generated runtime size is 2,240,483 raw / 659,577 deflated bytes for Firefox and 2,262,125 raw / 674,093 deflated bytes for Chrome. Versus 1.32.0.2 this is **+2,160 raw / +1,189 deflated bytes per browser** (about **+0.18%** compressed), attributable to the explicit module/import boundary rather than new feature/runtime work. Runtime reachability is clean at the high-confidence level.

## Browser-smoke availability

Certification-environment probe:

- Chromium: `/usr/bin/chromium` available;
- Xvfb: available;
- ChromeDriver: unavailable;
- Firefox: unavailable;
- GeckoDriver: unavailable.

Therefore real Firefox/Chromium WebDriver smoke cannot be claimed. Certification level is **MECHANICAL_ONLY**.

## Certification status

The 1.32.0.3 working candidate passed its functional, targeted, reachability, benchmark, size and packaged-contract gates, but the interactive build session ended before an independently verified clean-source byte-for-byte reproduction was completed. It was therefore **not** a final-certified handoff. The candidate was subsequently superseded by 1.32.0.4 after the forensic audit found a pre-existing Sync-journal concurrency defect unrelated to the Bookmarks extraction.

## Scope verdict

**BOOKMARKS EXTRACTION PASS / RELEASE SUPERSEDED:** Step 5 itself remained a narrow, behavior-preserving ownership extraction with no demonstrated meaningful New Tab/startup performance regression, but 1.32.0.3 should not be cited as a final-certified release.

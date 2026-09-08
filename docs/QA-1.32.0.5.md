# MosaicSync 1.32.0.5 QA / release-candidate checklist

## Scope

Complete **3rd Maintainability Journey Step 6 — Contract Simplification / Proven Cleanup** from certified 1.32.0.4. No new feature or ownership extraction. Remove only redundant Bookmarks-controller contract/work proven safe after Step 5.

## Permanent Step-6 regressions

- `tests/contract-simplification-13205.test.mjs`
- Baseline proof: **4 / 4 fail on untouched 1.32.0.4**.
- Candidate proof: **4 / 4 pass after cleanup**.

## Intended production delta

- Remove `bookmarksController.hydratePostPaintPreferences()` from New Tab post-paint maintenance.
- Remove the redundant `hydratePostPaintPreferences()` controller method and public contract entry.
- Keep `open()` private to controller-owned `bind()` rather than exposing it to `newtab.js`.
- Remove the duplicate `renderBookmarkSidebar()` call from localized refresh; `renderBookmarkBrowser()` remains the single renderer and already rebuilds the sidebar.
- No change to Sync/Recovery, profile persistence, lazy browser Bookmarks loading, permissions, first paint, schemas or wire formats.

## Efficiency contract

- One fewer device-local `localStorage.getItem(...)` on every New Tab that does not open Bookmarks.
- One fewer sidebar DOM rebuild per Bookmarks localized refresh.
- No added browser/storage/network/timer/Promise/image-decode work.
- Runtime payload should not grow from the production cleanup itself.

## Final certification

- Full regression suite: **1062 / 1062 passing**.
- Startup group: **168 / 168 passing**.
- New Tab group: **327 / 327 passing**.
- Sync group: **206 / 206 passing**.
- Recovery group: **119 / 119 passing**.
- Browser/parity group: **178 / 178 passing**.
- Release group: **181 / 181 passing**.
- Runtime reachability: clean — zero unreachable shared modules, zero unused named imports, zero unreferenced private functions.
- Performance benchmark: pass; no adverse benchmark signal.
- Rebuilt 1.32.0.4 → 1.32.0.5 runtime delta from the production cleanup: **-230 raw bytes / -41 deflated bytes per browser**.
- Generated release contract: pass.
- Firefox packaged contract: pass.
- Chrome packaged contract: pass.
- Independent clean-source rebuild/retest/repackage: **1062 / 1062 passing** and byte-for-byte reproduction of Firefox ZIP, Chrome ZIP, GitHub-ready source ZIP and `build-manifest.json`.
- Browser probe: Chromium and Xvfb are available, but ChromeDriver is unavailable; Firefox and GeckoDriver are unavailable. Therefore certification is **MECHANICAL_ONLY** and no real-browser smoke is claimed.

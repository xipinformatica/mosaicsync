# MosaicSync 1.27.8.4 QA / performance + regression checklist

## Release identity

- [x] Firefox manifest version = `1.27.8.4`.
- [x] Chrome manifest version + `version_name` = `1.27.8.4`.
- [x] Shared `VERSION`, Settings version label, README, CHANGELOG, current-version tests, package-size baseline and build manifest = `1.27.8.4`.
- [x] No shortcut/state schema, Sync record schema, complete-profile snapshot schema or profile container version changed.

## CSS critical path

- [x] Blocking `newtab-critical.css` is ~33 KB.
- [x] Deferred `newtab-secondary.css` is ~85 KB and contains secondary/dialog/editor rules rather than duplicating the full critical sheet.
- [x] Critical + secondary CSS source bytes are less than the reviewed monolithic `newtab.css` source bytes.
- [x] Secondary CSS is loaded by packaged external `secondary-style-bootstrap.js` after two animation-frame callbacks.
- [x] No inline handler, remote stylesheet or CSP relaxation.
- [x] Firefox/Chrome critical and secondary sheets are byte-identical.

## Pre-module local-state overlap

- [x] `local-storage-bootstrap.js` runs before the New Tab ES module and starts the authoritative four-key local read.
- [x] Frozen keys match `LOCAL_STATE_KEY`, `LOCAL_META_KEY`, `LOCAL_ACTIVE_SPACE_KEY` and `LOCAL_ASSET_INDEX_KEY`.
- [x] `newtab.js` consumes the same early Promise/result rather than issuing an alternate authoritative read when available.
- [x] Normal state materialization, validation and concurrency semantics remain unchanged.

## Closed-folder artwork

- [x] First-frame authoritative hydration still loads only the first four visible child artworks per closed folder.
- [x] Hidden child records remain complete and retain content-addressed asset IDs.
- [x] Deferred hidden artwork hydrates in bounded batches and yields between batches.
- [x] Folder-open path hydrates missing folder pixels immediately when needed.
- [x] Async folder-open/deferred results are guarded by mutation generation so they cannot overwrite a newer structural edit.

## Appearance / separate Light-Dark wallpapers

- [x] Settings-open wallpaper and darkness changes mutate only `appearancePreviewLayer` / preview dim state.
- [x] Real root/page `--background-dim`, `--page-bg` and full-viewport wallpaper stay frozen while Settings is open.
- [x] Deferred authoritative page appearance commits after Settings closes.
- [x] Existing Firefox paint-isolation regressions remain passing for both Firefox and Chrome source trees.

## Frequently Visited Sync intent

- [x] `frequentlyVisitedEnabled` and `frequentlyVisitedCount` normalize as profile settings and are carried by synchronized settings records.
- [x] Both Spaces share the profile-level display intent/count.
- [x] Actual Top Sites/history-derived list, hidden-site domain list and browser permission remain device-local.
- [x] Receiving Show=ON without local `topSites` permission keeps the toggle ON and exposes the Grant permission UI.
- [x] `permissions.request()` remains user-gesture-only.
- [x] Legacy default OFF/5 migration does not race/publish a default over another device's meaningful legacy intent.
- [x] Updated explanatory strings are present in all 32 locale catalogs.

## Hover

- [x] Shortcut hover uses `scale(1.045)` plus subtle brightness.
- [x] Hover remains transform/filter-only and does not change tile/grid geometry or density.

## Local performance diagnostics

- [x] Approximate first launcher paint and Perceived Complete Paint stamps are recorded only in the current page context.
- [x] Long-task observation is bounded and explicitly disconnected.
- [x] No timing data is written to browser storage, runtime messaging, fetch/network or telemetry.

## Performance evidence

- [x] Build-host benchmark passed.
- [x] Validated-asset memo remains materially faster than repeated image hash validation in the 200-artwork stress fixture.
- [x] Compact baseline clone remains sub-millisecond-class on the build host (~0.39 ms in the final pre-package run).
- [x] Folder-heavy fixture remains 150 full artwork IDs -> 20 first-frame IDs for 5×30 closed-folder children.

## Regression / parity

- [x] Full pre-package source suite: 455/455 passing.
- [x] Existing distributed Firefox/Chrome Sync harness passes.
- [x] Existing security/import/image/SVG/concurrency/profile tests pass.
- [x] Firefox/Chrome New Tab performance/behavior code remains in parity except approved browser adapters/manifest overlays.
- [x] No new permissions, host permissions, telemetry, remote code, CSP relaxation or image-quality reduction.
- [x] GitHub-ready source ZIP extracted into a blank directory: 455/455 tests passing.
- [x] Clean-extracted source benchmark passed.
- [x] Firefox and Chrome packages rebuilt from the clean-extracted source are byte-for-byte identical to the release ZIPs.

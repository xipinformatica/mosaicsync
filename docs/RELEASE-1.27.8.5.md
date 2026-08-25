# MosaicSync 1.27.8.5 publication notes

## Release summary

1.27.8.5 is a narrow first-frame visual-integrity follow-up to 1.27.8.4. It fixes the brief Firefox Settings-button artifact caused by the delayed secondary stylesheet re-declaring a launcher-visible fixed/backdrop-filtered control, and it tightens the CSS split so launcher artwork selectors cannot drift across the critical/secondary boundary.

The release deliberately leaves the broader 1.27.8.4 performance architecture and product behavior unchanged.

## Mozilla concise changelog

Fixed a brief Firefox New Tab startup artifact caused by the deferred secondary stylesheet re-declaring launcher-visible Settings-button styles. Launcher tile and folder-mosaic artwork rules are now critical-only as well, and new regressions enforce the critical/secondary CSS ownership contract. No new permissions, Sync/profile changes, CSP relaxation, telemetry or feature changes.

## Notes to Reviewer

This is a CSS ownership/first-frame regression fix. `newtab-critical.css` permanently owns launcher-visible `.settings-button`, shortcut-tile and folder-mosaic artwork rules; `newtab-secondary.css` now contains only the corresponding secondary folder-popover artwork rules and no Settings-button declarations. The old monolithic `newtab.css` remains a non-loaded reviewed reference for legacy regression coverage, with tests proving neither `newtab.html` nor `secondary-style-bootstrap.js` can load it. No permission, storage/Sync schema, navigation, image-validation, CSP or remote-code behavior changed.

## GitHub Desktop

**Summary:** `Release MosaicSync 1.27.8.5`

**Description:** `Fix first-frame Firefox CSS ownership regressions by keeping Settings-button and launcher artwork rules out of deferred secondary CSS, with new reverse partition and runtime stylesheet-contract tests.`

## GitHub release

**Title:** `MosaicSync 1.27.8.5 — First-frame visual integrity fix`

**Body:**

MosaicSync 1.27.8.5 fixes the brief bright/rounded Settings-button artifact that could appear a couple of frames after opening a New Tab in Firefox. The delayed secondary stylesheet no longer re-declares launcher-visible Settings-button or main-grid artwork-layer rules. New regression coverage enforces that launcher CSS remains critical-only and fences the vestigial monolithic stylesheet out of the runtime loading path. All 1.27.8.4 Sync, Frequently Visited, wallpaper, folder-hydration and performance behavior remains unchanged.

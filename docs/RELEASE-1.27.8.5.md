> **INTERNAL CANDIDATE — not a public MosaicSync release.** Superseded by public 1.27.8.8.

# MosaicSync 1.27.8.5 publication notes

## Release summary

1.27.8.5 is a narrow first-frame visual-integrity follow-up to 1.27.8.4. It removes a delayed secondary-stylesheet ownership violation involving a launcher-visible Settings control and tightens the CSS split so launcher artwork selectors cannot drift across the critical/secondary boundary. Post-release real-hardware testing later showed the separate rounded startup artifact still reproduced, which is why 1.27.8.6 adds a narrower native-button appearance reset.

The release deliberately leaves the broader 1.27.8.4 performance architecture and product behavior unchanged.

## Mozilla concise changelog

Removed deferred secondary-sheet re-declarations of launcher-visible Settings-button styles as a first-frame CSS-ownership correction. Launcher tile and folder-mosaic artwork rules are now critical-only as well, and new regressions enforce the critical/secondary CSS ownership contract. No new permissions, Sync/profile changes, CSP relaxation, telemetry or feature changes.

## Notes to Reviewer

This is a CSS ownership/first-frame regression fix. `newtab-critical.css` permanently owns launcher-visible `.settings-button`, shortcut-tile and folder-mosaic artwork rules; `newtab-secondary.css` now contains only the corresponding secondary folder-popover artwork rules and no Settings-button declarations. The old monolithic `newtab.css` remains a non-loaded reviewed reference for legacy regression coverage, with tests proving neither `newtab.html` nor `secondary-style-bootstrap.js` can load it. No permission, storage/Sync schema, navigation, image-validation, CSP or remote-code behavior changed.

## GitHub Desktop

**Summary:** `Release MosaicSync 1.27.8.5`

**Description:** `Fix first-frame Firefox CSS ownership regressions by keeping Settings-button and launcher artwork rules out of deferred secondary CSS, with new reverse partition and runtime stylesheet-contract tests.`

## GitHub release

**Title:** `MosaicSync 1.27.8.5 — First-frame visual integrity fix`

**Body:**

MosaicSync 1.27.8.5 removes a CSS ownership violation investigated as a cause of the brief bright/rounded startup artifact in Firefox. Later real-hardware testing showed the artifact could still occur, so this release should not be treated as the complete visual fix. The delayed secondary stylesheet no longer re-declares launcher-visible Settings-button or main-grid artwork-layer rules. New regression coverage enforces that launcher CSS remains critical-only and fences the vestigial monolithic stylesheet out of the runtime loading path. All 1.27.8.4 Sync, Frequently Visited, wallpaper, folder-hydration and performance behavior remains unchanged.

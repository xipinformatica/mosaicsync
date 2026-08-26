# MosaicSync 1.27.8.6 publication notes

## Release summary

1.27.8.6 is a narrow Firefox first-frame native-control hardening follow-up to 1.27.8.5. The previous CSS-ownership cleanup was correct but did not eliminate the reported transient rounded "pill" on the user's Firefox hardware. Source review then found that the custom launcher Settings button remained a native `<button>` with the default `appearance: auto`, while a deferred stylesheet introduces generic button font/color rules after first paint.

This release explicitly suppresses native widget appearance in blocking critical CSS for the fully custom-styled Settings, Bookmarks and Space launcher buttons. The change is intentionally minimal so it can test/fix the native-control hypothesis without altering the delayed secondary-style architecture or any product/Sync behavior.

## Mozilla concise changelog

Hardened Firefox New Tab launcher controls against a transient native-button flash during startup. The custom Settings, Bookmarks and Space buttons now explicitly use `appearance: none` in first-frame critical CSS, with new cross-browser regression coverage. No permissions, Sync/profile changes, CSP relaxation, telemetry or feature changes.

## Notes to Reviewer

This release changes only launcher CSS reset behavior and tests. `.settings-button`, `.bookmarks-button` and `.space-button` are real custom-styled `<button>` elements and now declare `appearance: none` in `newtab-critical.css` before first paint. This prevents platform-native widget chrome from being exposed if Firefox recalculates button styles when the deferred secondary stylesheet is applied. The brand control is a `<span>` and is intentionally not included. No permission, storage/Sync schema, navigation, image-validation, CSP, remote-code or secondary-style-loader behavior changed.

## GitHub Desktop

**Summary:** `Release MosaicSync 1.27.8.6`

**Description:** `Suppress native launcher-button appearance before first paint to address the remaining Firefox startup pill, with focused Firefox/Chrome regression coverage and no Sync or architecture changes.`

## GitHub release

**Title:** `MosaicSync 1.27.8.6 — Firefox launcher native-control hardening`

**Body:**

MosaicSync 1.27.8.6 is a focused follow-up for the brief rounded startup artifact still reproducible in Firefox after 1.27.8.5. Custom launcher Settings, Bookmarks and Space buttons now explicitly suppress native browser widget appearance in the blocking critical stylesheet, so platform button chrome cannot become visible during later style recalculation. New tests enforce the reset and critical-only ownership in both Firefox and Chrome. All 1.27.8.5 Sync, Frequently Visited, wallpaper, folder-hydration, CSP and performance architecture remains unchanged.

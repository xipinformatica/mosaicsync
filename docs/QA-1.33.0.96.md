# MosaicSync 1.33.0.96 QA / release-candidate checklist

**Versioned corrective from published .95.** No GitHub or store writes from this local build.

## Scope

- Single CSS visibility-selector removal in `src/shared/newtab/newtab-critical.css`.
- Preserve keyboard-visible `+` through `:focus-visible` and hover through `:hover`.
- Maintain the regression test `tests/visual-plus-133067.test.mjs` (RED on original .95 / GREEN on the corrective).
- Version/README/development notes/changelog, release identity tests and generated build/size manifest refreshed for .96.
- No permission changes, telemetry, Sync/Recovery protocol changes, persisted data migrations or new network capabilities.

## Checks on exact .96

- [ ] `npm test` single-command including build/inventory.
- [ ] Firefox and Chrome release contracts and ZIP integrity.
- [ ] Generated build-manifest.json and package-size-baseline.json correspond to .96 runtime trees.
- [ ] 34 locale catalogs still match .95 (495 keys per language).
- [ ] Browser ZIP contents differ from published .95 only in version-bearing manifest, Settings UI version and corrected newtab-critical.css.
- [ ] Reproducible packaging and SHA-256 fingerprints recorded.
- [ ] Real extension browser check of mouse backdrop/Cancel/X/Escape and keyboard Tab/Enter/Cancel, when supported.
- [ ] Signed-in real multi-device Sync remains UNVERIFIED; do not claim PASS without independent real-device evidence.

## Verification note

The last .95 PLUS-FOCUS private candidate passed 1,746/1,746 unit/regression tests and a focused Chromium native-dialog fixture. This is prior evidence, not an automatic PASS for the exact .96 packages; update the items above with the new build's results.

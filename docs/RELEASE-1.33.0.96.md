# MosaicSync 1.33.0.96 publication notes

## GitHub release title

`MosaicSync 1.33.0.96`

## Firefox Add-ons — What's new

Fixed a small issue where the + Add Shortcut button could remain visible after closing the shortcut editor without saving. Keyboard access and normal hover behavior are preserved. No changes to your shortcuts or Sync.

## Chrome Web Store — What's new

Fixed a small issue where the + Add Shortcut button could remain visible after closing the shortcut editor without saving. Keyboard access and normal hover behavior are preserved. No changes to your shortcuts or Sync.

## GitHub release — changes since 1.33.0.95

- Removes a single CSS visibility selector from `src/shared/newtab/newtab-critical.css` so a pointer-initiated dismissal of the shortcut editor does not leave the empty-slot `+` visible just because the dialog restored focus to the triggering button.
- Retains hover visibility and `:focus-visible` keyboard discoverability, without blurring focused elements or changing dialog JavaScript.
- Carries forward the existing regression check `tests/visual-plus-133067.test.mjs`, which is RED against the old behavior and GREEN with the change.
- Otherwise keeps the published 1.33.0.95 functionality and all its language improvements unchanged. No background, Sync/Recovery, persisted-data, permission or telemetry changes.

## Source provenance

- Published 1.33.0.95 source baseline (before focus fix): SHA-256 `227dec13d7dc6c7452fde1d4f7662673dff170268072f3bc5d12411dc87d222d`.
- Corrected unpublished 1.33.0.95 PLUS-FOCUS source: SHA-256 `dd0352dbbdf7a690304138f54baaf98c24cfd9984165896be927940f05ec2632`.
- The 1.33.0.96 source is the corrected baseline with version, public release documentation, release identity tests and regenerated runtime outputs updated.

## Publication checks

- Exact .96 artifacts require clean build, full `npm test`, package contract validation and deterministic ZIP hashes.
- Real loaded-extension browser upgrade checks are recommended before store submission. The prior Chromium focus reproduction used a native-dialog fixture rather than the full installed extension.
- Signed-in multi-device Sync is still UNVERIFIED and is not claimed as passed.
- No GitHub/store modifications are carried out by this build process.

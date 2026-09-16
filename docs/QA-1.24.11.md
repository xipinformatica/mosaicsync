# MosaicSync 1.24.11 QA contract

1.24.11 is an engineering-hardening release. User-visible behavior is expected to remain compatible with 1.24.10.

## Frozen runtime behavior

- Sync conflict semantics and storage.sync representation.
- Content-addressed local asset schema.
- `.mosaicsync` profile format v2 and v1 import compatibility.
- Favicon resolver/fallback behavior from 1.24.7b onward.
- 1.24.10 synchronous first-frame preview behavior.
- Permissions, Spaces, onboarding, themes, layouts and wallpapers.

## Automated checks

Run `npm test`. The suite covers model/Sync invariants, browser parity, localization completeness, favicon fallback, asset/profile round-trips, storage migration/corruption resilience, cache bounds, accessible dialog naming, module resolution, first-frame startup ordering and generated-file hashes.

Run `npm run bench` to compare the 200-shortcut worst-case fixture with prior optimization builds. The benchmark is diagnostic only; no threshold is used to hide a correctness regression.

## Manual smoke test before release

Firefox and Chrome should each be checked for: opening repeated New Tabs, Personal/Work switching, Add/Edit Shortcut, favicon learning on a simple site and an app subdomain, folder drag/reorder, Settings/Bookmarks dialogs, profile export/import, language switching, browser restart and Sync status stability.

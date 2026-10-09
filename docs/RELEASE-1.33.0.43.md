# MosaicSync 1.33.0.43 publication notes

This is a narrow reliability follow-up to the corrected 1.33.0.42 source. Do not claim versions .41/.42 were publicly released unless explicitly confirmed. If store history is behind, include cumulative end-user changes in the store description.

## Firefox Add-ons / Chrome Web Store changelog

If MosaicSync cannot save a folder name, wallpaper, theme, or Space setting, it now tells you what happened and that your changes may not be saved. Also includes the previous release's safer backup importing and new-shortcut URL protection. No new permissions.

## Mozilla Notes to Reviewer

The release preserves all B-1/B-2/B-3 corrections from the reviewed 1.33.0.42 corrective (bookmarks with credential-bearing HTTP(S) URLs remain visible/searchable in the browser-owned Bookmarks interface, while shortcut authoring rejects them; the Frequently Visited error equals the localized English catalog entry; Welcome discards stale staged profiles and returns to source selection with no partial writes). Its test file and profile/credential compatibility policy remain unchanged.

New Tab's direct `persistWorkspaceSetting()` and `setMultipleSpacesEnabled()` transactional writes bypass the `saveState()` error-presentation catch, and now rethrow `presentLocalPersistenceError()` on failure (same quota/non-quota localized keys, without changing storage transaction or retry semantics). The immediate and timer-based wallpaper save callbacks now surface the already-presented errors rather than logging only. All four folder-title exit call sites show the save error instead of console-only reporting. The theme-selection async handler catches rejected `saveSettingsState()` and gives the same feedback. The local unsaved draft and durable baseline are deliberately not cleared on these failures.

No new permissions, host access, CSP, network dependencies, Sync/Recovery format/schema, browser floor, or telemetry. Previously poisoned remote Sync peers are still not auto-healed and legacy stored shortcuts containing URL credentials remain navigable to avoid silent data loss. Real-browser smoke testing is a separate gate.

## GitHub release title

`MosaicSync 1.33.0.43`

## GitHub description

- Better feedback when a folder title, theme, wallpaper or Space setting cannot be saved.
- Retains the previous update's backup-import safety and new-shortcut protection without hiding existing browser bookmarks.
- No new permissions or Sync/Recovery format changes.

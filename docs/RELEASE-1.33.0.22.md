# MosaicSync 1.33.0.22 publication notes

## AMO changelog

Narrow New Tab UI-context corrective. The synchronous first-frame bootstrap now applies the same folder-mosaic geometry as authoritative New Tab settings, eliminating the brief mini-favicon size correction on non-default tile sizes. Editing a shortcut inside an open folder now keeps that folder open underneath the native Shortcut Editor; Save/Cancel/X/Escape/backdrop interactions preserve the folder context, while existing authoritative rendering still closes it naturally if a delete or move dissolves the folder. Hover behavior, Sync/Recovery, schemas, permissions and privacy boundaries are unchanged.

## Notes to Reviewer

1.33.0.22 changes only New Tab presentation/context behavior over 1.33.0.21. `render-bootstrap.js` now derives the folder mosaic/item CSS variables from the already-validated saved tile size using the same formulas as `applySettings()`, with no additional I/O or module dependency. The folder child Edit handler no longer calls `closeFolder()` before `openShortcutEditor()`, and the document outside-folder pointer handler is suspended while `shortcutDialog.open` so modal interaction cannot destroy the underlying folder context. The existing `render()` path remains authoritative and closes the folder if it no longer exists as a folder. Permanent coverage is in `tests/corrective-133022.test.mjs`.

## GitHub release title

`MosaicSync 1.33.0.22`

## GitHub release description

MosaicSync 1.33.0.22 is a narrow New Tab UI corrective. Folder mini-favicons now use the final tile-size-derived geometry from the synchronous first frame instead of briefly painting at reference size, and editing a child shortcut preserves the open folder behind the native editor. Pointer interactions inside the editor no longer count as outside-folder clicks; if a save/delete/move leaves the folder intact it is rerendered in place, while a dissolved folder closes naturally. No Sync/Recovery format, persisted schema, permission, browser-floor or privacy-boundary change.

## GitHub Desktop

**Summary:** Release MosaicSync 1.33.0.22 — folder first-frame and edit-context corrective

**Description:** Match folder geometry on the synchronous first frame and preserve open-folder context while editing child shortcuts, with permanent regressions and no Sync/Recovery changes.

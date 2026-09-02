# MosaicSync 1.30.18 publication notes

## Mozilla Developer Hub changelog

Fixes a disabled-Spaces first-paint inconsistency and avoids unnecessary grid/background work when the visible launcher is unchanged. Adds focused regression coverage. No Sync/state schema, permission, telemetry or backend change.

## Notes to Reviewer

1.30.18 is a narrow state-consistency/performance patch. Session render snapshots force Personal when Multiple Spaces is disabled; external state changes skip full grid reconstruction only after a conservative exact Manual-grid equivalence check; inactive-Space wallpaper preloading is skipped while Spaces are off. Sync/state schemas and permissions are unchanged.

## GitHub release title

`MosaicSync 1.30.18`

## GitHub release description

MosaicSync 1.30.18 tightens disabled-Spaces startup behavior and removes avoidable New Tab work. It prevents a Work-space session snapshot from being used while Multiple Spaces is off, skips provably unnecessary Manual-grid rebuilds after unrelated external state updates, and avoids inactive-Space wallpaper preloads until Spaces are enabled.

## GitHub Desktop

**Summary:** `Release MosaicSync 1.30.18`

**Description:** `Tighten disabled-Spaces startup state and remove avoidable New Tab rendering/background work.`

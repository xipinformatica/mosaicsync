# MosaicSync 1.33.0.32 publication notes

## AMO / Chrome Web Store changelog

Improves the one-time folder tip so it shows the complete flow: drag one shortcut onto another, choose “Create folder”, and see how both shortcuts appear together inside the new folder. The demonstration is only visual and never changes your real shortcuts.

## Mozilla Notes to Reviewer

1.33.0.32 is a narrow visual refinement over 1.33.0.31. The existing lazy-loaded folder-discovery hint remains presentation-only, device-local and suppressed in Recently opened order.

For motion-enabled users, the inert overlay now completes the real conceptual flow: after the existing shortcut ghost reaches its neighbour, the overlay renders a non-interactive visual copy of MosaicSync’s two-choice drop popover using the existing localized `moveHere`/`switchPositions` and `createFolder`/`putTogether` strings. The “Create folder” row is visually emphasized, then a fake folder tile appears at the target and a fake folder panel opens containing visual copies of both shortcuts. No real popover is opened and no real folder is created.

All fake elements are non-focusable overlay nodes with no `data-id`; the real launcher grid is not moved, hidden or mutated. The module still has no imports or access to profile mutation, browser storage, runtime messaging, Sync or Recovery APIs. Reduced-motion users keep the static callout/arrow/ring path and do not mount the staged fake popover/folder sequence.

No new permission, CSP, profile schema, Sync/Recovery wire format, browser floor, telemetry, network request or privacy-boundary change is introduced. Permanent coverage is in `tests/feature-133032.test.mjs` in addition to the existing 1.33.0.31 lifecycle tests.

## GitHub release title

`MosaicSync 1.33.0.32`

## GitHub release description

MosaicSync 1.33.0.32 makes the one-time folder tutorial more complete and easier to understand.

- The visual demonstration now shows the choice menu that appears after dropping one shortcut onto another.
- It then demonstrates choosing “Create folder”, shows the resulting folder tile, and opens a visual folder containing both shortcuts.
- The tutorial remains presentation-only: it never moves, removes or changes your real shortcuts.
- Reduced-motion preferences, one-time device-local behavior and Recently opened suppression are unchanged.

No Sync, Recovery, permission, CSP or profile-schema changes.

# MosaicSync 1.33.0.26 publication notes

## AMO changelog

Bookmark drag-to-shortcut is now available from MosaicSync's Bookmarks window. Drag an HTTP(S) bookmark onto an empty Manual tile to create a shortcut at that exact position, onto an existing folder to add it there, or onto an occupied shortcut to create a folder without overwriting anything. An empty launcher also accepts a bookmark on its Add control. Merely viewing/searching Bookmarks still copies nothing into MosaicSync; the original browser bookmark is never moved or deleted, and learned favicon artwork stays device-local under the existing policy. No new permission, persisted schema, Sync/Recovery format or browser-floor change.

## Mozilla Notes to Reviewer

1.33.0.26 adds an explicit same-document drag bridge from the lazily loaded Bookmarks UI into the existing New Tab shortcut model. `bookmarks-controller.js` emits a bounded bookmark drag handoff; `newtab.js` validates HTTP(S), keeps the native drag source connected while closing the modal, and commits only on a valid launcher drop. Empty Manual slots preserve the chosen position, folder drops append a normal shortcut, and occupied-shortcut drops create a folder instead of replacing data. Cancelled/unhandled drops do not mutate state, and a document-level drop guard prevents the dragged URL from navigating the extension page. Automatic favicon recovery uses the existing device-local path. No permission, schema, Sync/Recovery wire-format or browser-floor change.

## GitHub release title

`MosaicSync 1.33.0.26`

## GitHub release description

MosaicSync 1.33.0.26 adds drag-to-shortcut conversion from the built-in browser Bookmarks reader. Start dragging an HTTP(S) bookmark and the Bookmarks modal releases the launcher; drop on an empty Manual tile for exact placement, on a folder to add it there, or on an occupied shortcut to create a folder without overwriting the existing item. Browser bookmarks remain browser-owned until an explicit drop, and learned favicon pixels remain device-local. The release adds permanent adversarial coverage for modal/source lifetime, placement, folder/occupied routing, URL/privacy boundaries and cancellation safety. No new permission or Sync/Recovery/schema change.

## GitHub Desktop

**Summary:** Release MosaicSync 1.33.0.26 — drag bookmarks into the launcher

**Description:** Add explicit browser-bookmark drag-to-shortcut conversion with exact Manual placement, folder/occupied-tile routing, copy semantics and device-local favicon handling.

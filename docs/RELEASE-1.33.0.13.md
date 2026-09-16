# MosaicSync 1.33.0.13 publication notes

## Mozilla changelog

Begins Snow Leopard II Step 6 lifetime/memory work. The lazy Wallpaper Gallery now releases its generated wallpaper-choice payload when the dialog closes while keeping one reusable shell for later use. A deterministic 30-choice lifecycle fixture moves from 90 retained dynamic elements after close to 0 across 50 repeated cycles. Reopening rebuilds the grid synchronously before display. No permission, Sync/Recovery, schema, network or browser-floor change.

## Mozilla Notes to Reviewer

1.33.0.13 changes only the lifetime of the Wallpaper Gallery's generated choice grid. `wallpaper-gallery-shell.js` clears the grid on the native dialog `close` event. The shell/module remain lazy and memoized, and `openWallpaperGallery()` still rebuilds the choices synchronously before `showModal()`. Settings ownership-generation revalidation, background persistence and image-preload behavior are unchanged. No new permission, storage key, telemetry or network path is introduced.

## Chrome Web Store release notes

Reduces closed-dialog memory retention by releasing Wallpaper Gallery choice nodes after close while keeping the reusable lazy shell. No permission or data-format changes.

## GitHub release title

`MosaicSync 1.33.0.13`

## GitHub release description

MosaicSync 1.33.0.13 begins **Snow Leopard II Step 6 — lifetime and memory** with Step 6A.

The Wallpaper Gallery introduced as a lazy Step-3 surface correctly avoided startup DOM cost, but after first use its last generated choice grid remained attached even while the dialog was closed. Step 6A keeps the one reusable lazy shell while releasing that interaction-only payload on the native `close` event.

A deterministic 30-choice fixture demonstrates **90 retained dynamic elements after close → 0**. A 50-cycle open/close stress returns to the same shell-only state on every close and confirms that gallery shells do not multiply. Reopen still renders the gallery synchronously before `showModal()`, preserving current selection state and Settings ownership semantics.

Bookmarks close/reset, detected-favicon cleanup, Custom Branding draft release, bounded long-lived caches and image-worker idle shutdown were audited as negative controls and left unchanged. Step 6 remains in progress; broader memory/lifetime work continues before moving to Step 7.

No permission, persisted-schema, profile-format, Normal Sync/Recovery wire-format, CSP, network, privacy-boundary or browser-floor change.

## GitHub Desktop

**Summary:** Release MosaicSync 1.33.0.13 — release closed Wallpaper Gallery payload

**Description:** Begin Snow Leopard II Step 6 by clearing the lazy Wallpaper Gallery's generated choice grid on dialog close while retaining one reusable shell. Repeated lifecycle stress returns to shell-only retention with no Sync/Recovery or permission changes.

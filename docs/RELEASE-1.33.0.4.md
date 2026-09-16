# MosaicSync 1.33.0.4 publication notes

## Mozilla changelog

Begins Snow Leopard II Step 3 with a narrow lazy-UI pilot: the Wallpaper Gallery shell is no longer parsed into the initial live New Tab DOM or eagerly bound during module setup. It is constructed only on first use and preserves Settings-session ownership across the new asynchronous boundary. No permission or data-format changes.

## Notes to Reviewer

1.33.0.4 changes only New Tab presentation ownership for the Settings-owned Wallpaper Gallery. The dialog shell moves from static `newtab.html` into a dynamically imported local module. Its open path revalidates the owning Settings lifecycle generation after asynchronous preparation, and dynamically-created close controls bind when mounted. Normal Sync/Recovery, persisted schemas and permissions are unchanged.

## Chrome Web Store release notes

Reduces New Tab startup work by deferring the Wallpaper Gallery dialog shell until it is actually opened. No feature, permission, Sync/Recovery or data-format changes.

## GitHub release title

`MosaicSync 1.33.0.4`

## GitHub release description

MosaicSync 1.33.0.4 begins **Snow Leopard II Step 3 — DOM/CSS/lazy secondary UI** with a deliberately narrow pilot.

The Settings-owned Wallpaper Gallery previously contributed 11 live DOM elements and two eager ID lookups to every New Tab even when never opened. Its shell now lives in a dynamically imported local module and is constructed on first use.

The extraction preserves the Settings ownership contract: the opener captures the Settings lifecycle generation before awaiting styles/module construction and will not show stale child UI if Settings closed or reopened during that work. Because the close button is created lazily, its close and backdrop handlers are installed at mount time rather than relying on the startup-only document scan.

Deterministic structural census:

- initial live DOM: 642 → 631 elements;
- secondary live DOM: 534 → 523;
- eager ID bindings: 200 → 198;
- secondary eager bindings: 165 → 163.

This release validates the lazy-UI pattern; Step 3 remains in progress and larger Settings surfaces are intentionally deferred to later, independently auditable slices.

No new permissions, telemetry, remote code, persisted-state schema, profile format, Normal Sync/Recovery wire format, CSP or browser-floor changes.

## GitHub Desktop

**Summary:** Release MosaicSync 1.33.0.4 — begin lazy secondary-UI extraction

**Description:** Move the Wallpaper Gallery shell and bindings off the New Tab startup path while preserving Settings ownership across lazy loading.

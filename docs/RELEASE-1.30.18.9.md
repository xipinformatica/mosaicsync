# MosaicSync 1.30.18.9 publication notes

## Mozilla Developer Hub changelog

Begins Step 2.1 of the maintainability program by reducing duplicated startup-cache ownership without changing features: full shared session startup snapshots are now published only from authoritative startup/persistence boundaries, device-local Frequently Visited refreshes patch only their own field, and every runtime page-local render-manifest write is gated against current shared structural state. Browser-derived Frequently Visited sites no longer persist in localStorage, the obsolete v2 manifest bridge is removed, and classic bootstrap schema/key values are generated from canonical constants. No normal Sync/Recovery/profile schema, permission, CSP, telemetry or backend change.

## Notes to Reviewer

MosaicSync 1.30.18.9 is the first Step-2 maintainability/consolidation release. It deliberately does not rewrite the shortcut grid, artwork system, theme/wallpaper paths, normal Sync or Recovery. Instead it removes the first duplicated startup ownership boundaries that were isolated and tested during 1.30.18.6–1.30.18.8.

Complete `storage.session` render snapshots are now published only from authoritative startup/persistence boundaries. Routine New Tab presentation refreshes no longer republish a full Space/grid snapshot from whichever tab happens to be open. Device-local Frequently Visited refreshes update only `firstPaint.frequent` in the current shared session projection, so a stale presentation context cannot downgrade newer Space/grid/artwork startup state. Persisting the active-Space pointer similarly refreshes the session projection from the persisted compact profile rather than treating an arbitrary tab's current view as shared startup authority.

The page-owned persistent localStorage render manifest remains a synchronous shortcut-grid accelerator, but every runtime publication path is now gated against the current shared session structural projection immediately before commit. This includes normal manifest refresh, delayed preview generation and the artwork-change fallback path. If an older open tab no longer matches shared startup truth, its disposable persistent-manifest write is withheld rather than overwriting a newer first-frame cache.

Frequently Visited browser-derived site candidates are no longer serialized into that persistent localStorage manifest. The manifest retains only the synchronized enable/count projection; site candidates belong to the device-local session/live layer. This removes the cold-browser-restart path where a persistent manifest could briefly resurrect stale browsing-history-derived cards after session permission state had disappeared.

The disposable render-manifest schema advances to v4 and the old v2 compatibility bridge is removed. Classic synchronous bootstrap scripts cannot import ESM constants directly, so the deterministic build now emits a tiny `bootstrap-config.js` from the canonical core constants and both browser New Tab pages load it before the classic startup scripts. This removes duplicated manifest/session key and manifest-version literals that previously allowed a stale schema check to survive a version bump.

The Top Sites permission add/remove regression is also upgraded from a source-regex wiring assertion to the existing background-runtime harness: it fires the production mocked permission events and verifies the session suppression tombstone transitions true→false while the synchronized Show preference remains unchanged.

No manifest permissions were added or removed. No synchronized/state/profile/recovery schema changed. Work shortcut-grid safety, favicon/artwork ownership, theme/appearance/wallpaper accelerators, CSP, safe navigation, privacy boundaries, telemetry/analytics policy and backend-free architecture remain unchanged.

## Chrome Web Store release notes

Begins the startup-maintainability consolidation while preserving existing behavior and speed. Shared session startup state now has clearer authoritative ownership, browser-derived Frequently Visited sites no longer persist across cold restarts in the local first-frame manifest, stale tabs cannot overwrite a newer persistent startup projection, and classic bootstrap version/key values are generated from one canonical source. No feature, Sync, Recovery, permission or privacy change.

## GitHub release title

`MosaicSync 1.30.18.9`

## GitHub release description

MosaicSync 1.30.18.9 begins Step 2 of the maintainability transition by removing duplicated startup-cache ownership rather than adding another protection layer. Full shared session snapshots are limited to authoritative startup/persistence boundaries, Frequently Visited owns only its device-local session field, persistent first-frame writes are freshness-gated against shared session state, browser-history-derived FV sites are removed from persistent localStorage, and obsolete/bootstrap schema duplication is reduced. Existing product features, Sync/Recovery schemas, permissions, privacy and security boundaries remain unchanged.

## GitHub Desktop

**Summary:** `Release MosaicSync 1.30.18.9`

**Description:** `Begin Step 2 by consolidating first-paint cache ownership and removing stale persistent FV data.`

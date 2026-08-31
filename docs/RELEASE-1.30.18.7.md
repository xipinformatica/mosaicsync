# MosaicSync 1.30.18.7 publication notes

## Mozilla Developer Hub changelog

Hardens the first-paint maintainability foundation before cache consolidation: restores current-schema warm boot-grid reuse, makes disabled Frequently Visited state explicitly suppress stale fast-cache cards, clears only the device-local session card snapshot when Top Sites permission is removed, and prevents the static English Frequently Visited heading from appearing before localization. Also skips unchanged session-cache rewrites and keeps near-full Sync pressure visible alongside recovery/artwork limitations. No feature, normal Sync/Recovery/profile schema, permission, CSP, telemetry or backend change.

## Notes to Reviewer

1.30.18.7 is a zero-feature Step-1.1 hardening release following the first-paint maintainability foundation introduced in 1.30.18.6.

A schema bump in 1.30.18.6 left one warm-start reuse condition hardcoded to render-manifest version 2. Current manifests are version 3, so the already-correct boot-painted shortcut grid could not be adopted on the session-warm path and MosaicSync performed an unnecessary full render. The condition now uses the canonical current schema version and has an explicit cross-browser regression asserting the reuse outcome. This is a performance/maintainability correction; authoritative grid safety checks are unchanged.

The shared first-paint contract now derives Frequently Visited enable/count truth from normalized synchronized Settings. If Show is OFF, the projection is explicitly disabled with an empty site list even if a stale device-local candidate snapshot is supplied. If Show is ON but no fresh device-local candidates exist, the projection remains null/no-op rather than inventing browsing-history data. When the optional Top Sites permission is removed, the background worker clears only the device-local `storage.session` site projection; it does not alter the synchronized preference, request permission without a user gesture, or modify browser history.

The static fallback Frequently Visited heading/subtitle remains in the HTML for resilient markup but is hidden by critical CSS until the normal locale pass has run, preventing a first-frame English flash in non-English interfaces while reserving the same layout space.

Session render-state/meta writes are fingerprinted so identical snapshots are not rewritten. Sync quota presentation also composes near-full pressure with recovery/artwork degradation instead of allowing the latter to mask the more important storage-pressure warning. New synthetic tests prove byte-conserving bucket accounting, including legacy and current recovery namespaces.

No manifest permissions were added or removed. No synchronized/state/profile/recovery schema changed. CSP, safe navigation, privacy boundaries, telemetry/analytics policy and backend-free architecture are unchanged.

## GitHub release title

`MosaicSync 1.30.18.7`

## GitHub release description

MosaicSync 1.30.18.7 hardens the Step-1 first-paint foundation before Step 2 begins removing duplicated startup paths. It restores current-schema warm grid reuse, makes Frequently Visited disable/permission changes safer across fast startup contexts, prevents a non-English first-frame heading flash, eliminates unchanged session-cache rewrites and improves combined Sync-storage pressure messaging. Existing features, Sync/Recovery schemas, permissions, privacy and security boundaries remain unchanged.

## GitHub Desktop

**Summary:** `Release MosaicSync 1.30.18.7`

**Description:** `Harden first-paint freshness, restore warm-grid reuse, and reduce redundant startup work.`

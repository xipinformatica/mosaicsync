# MosaicSync 1.30.18.10 publication notes

## Mozilla Developer Hub changelog

Continues Step 2.2 of the maintainability program by enforcing deterministic shared-session ownership under concurrency: structural startup snapshots now publish inside the same cross-context persistence lock as authoritative local state, active-Space persistence uses that same ordered boundary, and browser-derived Frequently Visited candidates move to their own session-only key so FV/permission updates cannot overwrite Space/grid/artwork state. Cold-start live FV acquisition also starts without the previous generic 250 ms delay when no warm candidates exist. No normal Sync/Recovery/profile schema, permission, CSP, telemetry or backend change.

## Notes to Reviewer

MosaicSync 1.30.18.10 is a zero-feature Step-2.2 ownership refinement. It addresses concurrency findings from the 1.30.18.9 audit without broadening the refactor into shortcut/grid rendering, artwork ownership, appearance/wallpaper, normal Sync or Recovery.

Structural `storage.session` render-state publication now occurs inside the same cross-context Web Lock callback as the authoritative `storage.local` state transaction. Previously the local transaction could complete, release its lock, and only then publish its session accelerator, allowing an older transaction to theoretically land stale structural first-paint state after a newer local transaction had already won. The structural session write is now part of the ordered persistence boundary itself. Startup warming also acquires the same lock and derives its publication from the state currently persisted in `storage.local` rather than trusting an older caller snapshot.

`writeActiveSpace()` now uses the same persistence lock. It writes the device-local pointer, reads that persisted pointer/state/meta while still holding the lock, and publishes the structural session projection from those persisted values. Concurrent active-Space operations therefore settle with the local pointer and both session active-Space fields agreeing.

Frequently Visited site candidates are now physically isolated from structural startup state in a new disposable `storage.session` key. FV refreshes write only that key. Top Sites permission removal writes the existing suppression tombstone plus an empty FV projection, but never replaces `SESSION_RENDER_STATE_KEY`. `readSessionRenderCache()` validates the structural snapshot first and then composes the separately sanitized FV projection using the synchronized enable/count settings; an OFF setting or active permission tombstone remains authoritative. The new key is device-local/session-only and never enters profile state, Sync, Recovery or export.

The dedicated FV key is included in the deterministic build-generated bootstrap configuration and the existing batched early `storage.session.get`, so there is no additional early storage round-trip. On a complete cold browser start there are intentionally no persistent FV site candidates; when authoritative startup finds no warm FV sites, the live Top Sites refresh now starts immediately instead of waiting the generic 250 ms post-paint delay. Warm sessions retain the delayed refresh to avoid redundant work.

New Firefox/Chrome tests deliberately interleave the previously unsafe operations: an older structural transaction is paused after its local commit while it still holds the persistence lock; a newer transaction attempts to overtake it; concurrent active-Space writes are similarly paused; and FV/permission operations are paused across a newer structural publication. The tests assert that newer structural state always survives and that FV writes never contain the structural session key.

No manifest permissions were added or removed. No synchronized/state/profile/recovery schema changed. Persistent render-manifest v4, Work shortcut-grid safety, favicon/artwork first-paint behavior, theme/appearance/wallpaper accelerators, CSP, safe navigation, localization, privacy boundaries, telemetry/analytics policy and backend-free architecture remain unchanged.

## Chrome Web Store release notes

Continues the startup-maintainability consolidation by making shared session ownership deterministic across multiple extension contexts. Structural startup state now publishes inside the same ordered persistence transaction, active-Space state uses that same boundary, and Frequently Visited owns a separate device-local session key so its updates cannot overwrite Space/grid/artwork startup state. Cold-start FV data is also requested sooner without persisting browsing-history candidates. No feature, Sync, Recovery, permission or privacy change.

## GitHub release title

`MosaicSync 1.30.18.10`

## GitHub release description

MosaicSync 1.30.18.10 advances Step 2.2 by turning startup-cache ownership into an enforced concurrency rule. Structural session publication is ordered with authoritative local persistence, active-Space publication uses the same persisted boundary, and Frequently Visited candidates physically own a separate session-only key. New adversarial interleaving tests cover the exact races found in the 1.30.18.9 audit, while cold-start live FV acquisition begins sooner without restoring persistent browsing-history data. Existing features, Sync/Recovery schemas, permissions, privacy and security boundaries remain unchanged.

## GitHub Desktop

**Summary:** `Release MosaicSync 1.30.18.10`

**Description:** `Enforce Step 2.2 session ownership under concurrency and physically isolate Frequently Visited.`

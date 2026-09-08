# MosaicSync 1.32.0.7 publication notes

## Mozilla changelog

Fixes one residual first-Sync concurrency window found by independent adversarial audit. A genuine user edit made by an already-open New Tab can no longer miss durable pending-Sync protection merely because that page has not yet received the asynchronous Sync-metadata update. No feature, permission, persisted-schema, Sync/Recovery wire-format or browser-floor change.

## Mozilla Notes to Reviewer

MosaicSync 1.32.0.7 is a narrow Normal Sync reliability correction built from 1.32.0.6. It does not add features or continue structural refactoring.

The 1.32.0.6 bootstrap correction established durable Sync authority and then re-read local state to sweep edits made before initialization. Independent adversarial review found a smaller window after that re-read: durable `syncInitialized` could already be true while another already-open New Tab still held stale cached meta because `storage.onChanged` is asynchronous. That page could save a genuine user mutation while passing `recordSyncMutation: false`; the edit stayed safe in `storage.local`, but the already-running bootstrap did not include it and no cumulative pending journal represented it.

1.32.0.7 fixes the authority mismatch at its source rather than adding another inherently racy final reread. New Tab persistence now treats `recordSyncMutation` as semantic eligibility for genuine user mutations. The existing shared persistence transaction re-reads durable `LOCAL_META_KEY` under the same write lock and decides whether Sync durability is actually active. When authority is initialized, the user mutation and its pending journal are committed atomically; when Sync is disabled/uninitialized, no journal is created. Cache-only/device-local writes remain excluded, and dedicated cross-Space transaction intent remains separate.

Three permanent corrective tests include a deterministic Firefox/Chromium regression that injects the user edit after the 1.32.0.6 post-initialization bootstrap reread and verifies, in both Firefox- and Chromium-shaped generated runtimes, that the edit remains authoritative locally, the old bootstrap does not pretend to publish it, and the newer pending journal survives for normal reconciliation.

The two runtime cases were proven red on untouched 1.32.0.6 and green after correction.

There is no feature, UI string, permission, host-permission, CSP, persisted state/profile schema, Sync/Recovery wire-format, telemetry, remote-code or browser-floor change.

## Chrome Web Store release notes

Sync reliability correction: preserves durable retry protection for a user edit made during the narrow first-Sync metadata handoff between browser contexts. No feature or permission changes.

## GitHub release title

`MosaicSync 1.32.0.7`

## GitHub release description

MosaicSync 1.32.0.7 is the final narrow **Normal Sync first-initialization durability correction** from the Journey-3 freeze process.

Independent adversarial audit found a residual timing window where durable Sync authority was already initialized but an already-open New Tab had not yet received that metadata change. A genuine user edit could therefore be saved locally without being included in the running bootstrap or represented by a durable pending journal.

1.32.0.7 separates mutation intent from cached authority: New Tab marks genuine user changes as Sync-eligible, while the existing locked persistence boundary re-reads durable Sync metadata and alone decides whether pending-journal protection is active. This closes the race without another bootstrap reread and without changing device-local/cache-only or cross-Space transaction behavior.

No feature, permission, persisted schema, Sync/Recovery wire format, first-paint path or browser-floor change.

## GitHub Desktop

**Summary:** `Release MosaicSync 1.32.0.7`

**Description:** `Fix the final first-Sync stale-meta race so genuine user edits always receive durable pending-Sync protection when durable Sync authority is active.`

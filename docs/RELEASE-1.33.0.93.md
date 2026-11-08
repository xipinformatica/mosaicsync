# MosaicSync 1.33.0.93 publication notes

## GitHub release title

`MosaicSync 1.33.0.93`

## Firefox Add-ons — What's new

**More reliable Clear Sync**

Clear Sync copy now works even when browser Sync storage is full. If clearing is interrupted or fails, MosaicSync protects changes you haven't synced and asks which layout to use instead of automatically replacing them.

## Chrome Web Store — What's new

**More reliable Clear Sync**

Clear Sync copy now works even when browser Sync storage is full. If clearing is interrupted or fails, MosaicSync protects changes you haven't synced and asks which layout to use instead of automatically replacing them.

## GitHub release — changes since 1.33.0.92

- Clear Sync can now reserve room for its reset markers even when Firefox or Chrome Sync storage is nearly full. The planner bases existing usage on the browser's `storage.sync.getBytesInUse(null)` and accounts for browser-specific serialization of the added reset markers.
- Prevents an incomplete local reset from silently adopting an old cloud layout and overwriting unsynced local shortcuts or pending journals after alarms, reconcile, a storage event, worker restart or interruption. The device uses its existing explicit-choice state until its own reset markers have been verified durable; afterwards, normal post-reset waiting behavior is unchanged.
- **B1 — accepted behavior difference:** If this computer's *own* Clear Sync did not complete, it waits for an explicit layout choice; it does **not** automatically follow a later reset initiated on another computer. “Use Sync copy” merges this computer's local edits with the synchronized copy; “Use this computer” publishes the local layout. This protects unsynced local work.
- Keeps the existing sentinel-before-empty invariant, reset epoch/marker format and verification, compact staging, `reclaimRecovery: false` reset exclusion, normal Sync and Recovery rules, privacy and optional-permission policy.
- No new permissions, data formats, network services, or telemetry. No unrelated changes or housekeeping.

## Scope and publication status

Private 1.33.0.93 candidate derived from the independently audited canonical 1.33.0.92 GitHub-ready source (`ccaac4a5aacaf2565f10fa62eaf04d5d8419f440556444533e435af44878020f`) plus the **exact** v3 Clear Sync quota/R1 patch (`a5acce6d8c24a8066ba839055c3827d04f21a031d8e36b0284ee1725e2ad855b`), version identity pins and these release documents only.

**Do not publish until independent audit of the exact .93 artifacts and the six-job exact-commit GitHub release gate pass.** Real signed-in multi-device Sync is not passed and must not be represented as tested. Only the owner publishes to GitHub and browser stores.

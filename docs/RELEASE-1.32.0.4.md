# MosaicSync 1.32.0.4 publication notes

## Mozilla changelog

Completes the held Journey-3 Step-5 Bookmarks ownership extraction and fixes a pre-existing durable Normal Sync concurrency race found by the subsequent forensic audit. Pending-journal acknowledgement/authority cleanup is now serialized with the existing local persistence Web Lock, and Sync-disable/reset-style cleanup removes both durable journal classes in one fail-closed local-storage operation. No feature, permission, persisted-schema, journal-schema or Sync/Recovery wire-format change.

## Mozilla Notes to Reviewer

MosaicSync 1.32.0.4 is built from the 1.32.0.3 candidate, which itself carried the already-audited Step-5 Bookmarks UI ownership extraction from certified 1.32.0.2. Version 1.32.0.3 was not published/final-certified and is superseded by this release.

The corrective production change closes a pre-existing race in durable pending Normal Sync authority. A stale completed retry could previously read local-mutation journal A, wait while another New Tab atomically saved newer local state plus journal B, then resume and remove the journal key, accidentally deleting B. Authority-transition cleanup could also clear one journal class before failing on the other, or allow a fresh cross-Space journal to be created between enumeration and removal.

The correction reuses MosaicSync's existing cross-context local persistence Web Lock. Conditional local-journal acknowledgement now holds that lock from read/identity-check through removal. Sync-disable/reset-style cleanup enumerates validated cross-Space entries and removes those entries plus the cumulative local-mutation journal in one `storage.local.remove([...keys])` operation while the same lock is held. Authority-changing callers keep the durable metadata commit inside that same serialized transition using `writeLocalMeta(..., { persistenceLockHeld: true })`, which skips a second request for the already-held, non-reentrant Web Lock. If the metadata commit itself fails after cleanup, MosaicSync restores the exact removed journal snapshot before releasing the lock; that compensating storage write exists only on the failure path.

`core/storage.js` continues to commit authoritative local state and initial outbound pending intent atomically. For Sync-relevant writes it now includes `LOCAL_META_KEY` in the transaction's already-existing `storage.local.get(...)` read and rechecks durable `syncEnabled`/`syncInitialized` state before creating a local-mutation or cross-Space journal. A stale New Tab can therefore still save the user's local edit after a disable/reset transition, but it cannot recreate outbound Sync authority. This adds no extra browser-storage operation.

Seven permanent deterministic race/fault regressions were proven red 7/7 on the vulnerable 1.32.0.3 candidate and green after the correction. Existing 1.31.5 fail-closed journal protections, Sync/Recovery tests and the ten Step-5 Bookmarks ownership regressions remain in place.

The retained Step-5 ownership change moves only the Bookmarks dialog UI lifecycle to `src/shared/newtab/bookmarks-controller.js`. The browser Bookmarks API remains lazy-loaded; first-paint/startup ownership, post-paint folder-color hydration and authoritative profile persistence remain unchanged.

There is no new feature, UI string, permission, host permission, CSP change, persisted state/profile schema, durable-journal schema, Sync/Recovery wire format, telemetry, remote code or browser-floor change.

## Chrome Web Store release notes

Reliability and maintainability update: fixes a rare pending-Sync concurrency race and gives the Bookmarks dialog UI a dedicated internal controller. Features, permissions, stored formats and Sync/Recovery wire formats are unchanged.

## GitHub release title

`MosaicSync 1.32.0.4`

## GitHub release description

MosaicSync 1.32.0.4 completes the held Step 5 of the **3rd Maintainability Journey — Ownership & Auditability** and closes a pre-existing MEDIUM durable Sync concurrency race found during the forensic checkpoint before Step 6.

Pending-journal acknowledgement and authority-transition cleanup now share MosaicSync's existing cross-context local persistence lock; both durable journal classes are cleared in one fail-closed storage operation, and stale queued New Tab writers recheck durable Sync authority inside their existing persistence transaction before creating outbound retry intent. The correction adds no browser-storage operation and preserves atomic authoritative-state + pending-intent writes.

The release also includes the already-audited Bookmarks dialog controller extraction from the superseded 1.32.0.3 candidate. Seven new deterministic concurrency regressions were proven red on the vulnerable candidate and green after correction; the ten Step-5 Bookmarks ownership regressions remain green.

No feature, permission, persisted schema, journal schema, Sync/Recovery wire format or browser-floor change.

## GitHub Desktop

**Summary:** `Release MosaicSync 1.32.0.4`

**Description:** `Fix durable pending-Sync concurrency races and complete Journey-3 Step 5 without changing features, schemas or browser permissions.`

# MosaicSync 1.33.0.12 publication notes

## Mozilla changelog

Completes Snow Leopard II Step 5 with a narrow storage-local optimization. During healthy reconciliation, MosaicSync now reuses the exact Sync-continuity snapshot already read by the same serialized background queue turn instead of immediately reading that local key again.

Routine Sync-watch alarms use one fewer local read, and established Sync-on startup uses two fewer local reads. Full Sync reads, continuity writes, pending journals, catastrophic-loss handling, Recovery and destructive cleanup freshness checks are unchanged. Step 5 is now complete; Step 6 lifetime/memory analysis is next.

## Mozilla Notes to Reviewer

1.33.0.12 changes only reuse of `LOCAL_SYNC_CONTINUITY_KEY` inside one serialized background queue turn. That key has no production writer outside the shared background orchestrator. `markSyncContinuityHealthy()` still performs its defensive read when no current queue-owned continuity snapshot is supplied and still persists every planned healthy transition. No full `storage.sync` read or destructive-cleanup freshness read is removed. No new permission, storage key, telemetry, network path or schema is introduced.

## Chrome Web Store release notes

Reduces repeated local-storage reads during healthy Sync reconciliation and browser startup while preserving all Sync, Recovery and cleanup freshness checks. Snow Leopard II Step 5 is complete. No permission or data-format changes.

## GitHub release title

`MosaicSync 1.33.0.12`

## GitHub release description

MosaicSync 1.33.0.12 completes **Snow Leopard II Step 5 — storage/background frugality** with Step 5C.

The shared background worker serializes stateful Sync/Recovery work through one promise queue, and `LOCAL_SYNC_CONTINUITY_KEY` is owned only by that orchestrator. Before this release, a healthy reconciliation could read that durable continuity record during catastrophic-loss protection and then read the same key again later in the very same queue turn before marking continuity healthy.

Step 5C carries the exact already-read continuity snapshot forward instead. Startup can also carry the snapshot returned by its immediately preceding recovery-deferral check into the same queued reconciliation.

Deterministic generated-runtime evidence is identical across Firefox and Chromium:

- routine five-minute alarm: **6 → 5 local reads**, with local writes **2 → 2** and full Sync reads **2 → 2**;
- GC-due alarm: **8 → 7 local reads**, with the fresh pre-GC metadata read retained, local writes **3 → 3**, and full Sync reads **3 → 3**;
- established Sync-on startup: **13 → 11 local reads**, with local writes **3 → 3** and full Sync reads **2 → 2**.

The permanent optimization gate was proven **0/4 on untouched 1.33.0.11 → 4/4 green** after implementation. Final Step-5C coverage adds a single-writer ownership guard and is **5/5 green**.

No continuity heartbeat is throttled. No full Sync read, pending-journal read, local-state semantic check, reset-intent handling, Recovery-generation logic or destructive cleanup revalidation is removed.

After reassessing the remaining periodic work, Step 5 closes here. The remaining reads belong to current metadata authority, catastrophic-loss continuity, durable journals, local semantic-state comparison, diagnostics or deliberately separate Sync freshness boundaries. **Step 6 — lifetime and memory** is next.

No permission, persisted-schema, profile-format, Normal Sync/Recovery wire-format, CSP, privacy boundary or browser-floor change.

## GitHub Desktop

**Summary:** Release MosaicSync 1.33.0.12 — reuse queue-owned Sync continuity and close Step 5

**Description:** Complete Snow Leopard II Step 5 by reusing the durable Sync-continuity snapshot already read in the same serialized background reconciliation. Routine alarms and Sync-on startup use fewer local reads while Sync, Recovery, journals and destructive-cleanup freshness remain unchanged.

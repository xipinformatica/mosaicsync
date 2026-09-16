# MosaicSync 1.33.0.11 publication notes

## Mozilla changelog

Continues Snow Leopard II Step 5 with a narrow background-storage optimization. Routine five-minute Sync-watch alarms no longer perform a second local metadata read solely to discover that 24-hour device-snapshot cleanup is not due.

When cleanup can be due, MosaicSync still re-reads current metadata immediately before the existing garbage-collection path. Catastrophic Sync-loss detection, durable pending journals, Recovery/device-snapshot freshness checks, permissions and data formats are unchanged.

## Mozilla Notes to Reviewer

1.33.0.11 changes only the final maintenance gate in the initialized Sync-watch alarm. The alarm-entry metadata may prove only that device-snapshot GC is not due. If GC can be due, the extension still calls `readLocalMeta()` immediately before `maybeGarbageCollectStaleDeviceSnapshots()`, whose own fresh Sync read and pre-delete revalidation are unchanged. No new permission, storage key, telemetry, network path or schema is introduced.

## Chrome Web Store release notes

Reduces one unnecessary local metadata read on routine Sync-watch alarms while preserving the fresh metadata and Sync checks used whenever device-snapshot cleanup may run. No permission or data-format changes.

## GitHub release title

`MosaicSync 1.33.0.11`

## GitHub release description

MosaicSync 1.33.0.11 continues **Snow Leopard II Step 5 — storage/background frugality** with Step 5B.

The five-minute Sync-watch alarm historically performed a second `storage.local` metadata read before calling device-snapshot maintenance, even though that maintenance is scheduled only once every 24 hours. Step 5B uses the metadata already read at alarm entry only as a negative gate: when `lastDeviceSnapshotGcAt` proves cleanup is not due, the maintenance-only second read is skipped.

The optimization deliberately stops there. If cleanup can be due, MosaicSync still obtains fresh local metadata immediately before `maybeGarbageCollectStaleDeviceSnapshots()`. That routine retains its fresh full Sync namespace read and its additional pre-delete Sync revalidation whenever stale/orphan candidates exist. Catastrophic-loss detection, pending durable journals, normal reconciliation and Recovery authority are unchanged.

Deterministic generated-runtime evidence is identical across Firefox and Chromium:

- routine alarm: **7 → 6 local reads**;
- routine full Sync reads: **2 → 2**;
- GC-due control: **8 local reads / 3 full Sync reads** before and after.

The permanent Step-5B regression was proven **2/4 red on untouched 1.33.0.10 → 4/4 green** after implementation. The candidate then passed an adversarial audit of timing, metadata ownership, Sync/Recovery ordering and browser parity before release certification.

No permission, persisted-schema, profile-format, Normal Sync/Recovery wire-format, CSP, privacy boundary or browser-floor change.

Step 5 remains in progress; another optimization will be accepted only if measurement proves a separate safe target.

## GitHub Desktop

**Summary:** Release MosaicSync 1.33.0.11 — reduce routine Sync-watch metadata I/O

**Description:** Continue Snow Leopard II Step 5 by skipping one maintenance-only local metadata read when 24-hour device-snapshot GC is provably not due. GC-due, Sync, Recovery and destructive-cleanup freshness paths remain unchanged.

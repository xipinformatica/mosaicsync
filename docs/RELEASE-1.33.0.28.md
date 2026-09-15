# MosaicSync 1.33.0.28 publication notes

## AMO changelog

Recovery retirement safety corrective. Routine pre-publication capacity planning now uses the same independently verified-generation classifier as emergency quota reclaim and superseded-generation pruning. A torn/fallback-assisted Recovery generation can remain readable, but it can no longer authorize retirement of the independently valid predecessor it depends on. The 1.33.0.27 bounded quota retry, two-generation retention policy, remote-device cleanup authority, permissions, schemas and Sync/Recovery formats are unchanged.

## Mozilla Notes to Reviewer

1.33.0.28 changes one pure Recovery lifecycle planner. `planDeviceSnapshotPublicationCapacity()` now consumes `verifiedProfileDeviceSnapshotDescriptors()` instead of hand-filtering `profileComplete` snapshots. This excludes `usedPreviousGeneration === true` generations from destructive retirement authority while preserving their ordinary readability elsewhere. No Recovery format, storage key, permission, schema, retry policy or cross-device cleanup change is introduced. Permanent regression coverage is in `tests/corrective-133028.test.mjs`.

## GitHub release title

`MosaicSync 1.33.0.28`

## GitHub release description

MosaicSync 1.33.0.28 is a narrow Recovery safety corrective over 1.33.0.27. Routine capacity planning now shares the same independently verified-generation classifier as the emergency quota and retention paths, so a torn/fallback-assisted generation can never authorize deletion of the predecessor it depends on. Readable fallback-assisted Recovery remains valid for non-destructive coverage decisions. The 1.33.0.27 emergency retry and existing retention, Sync, Recovery and privacy contracts remain unchanged.

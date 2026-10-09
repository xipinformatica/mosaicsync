# MosaicSync 1.33.0.44 publication notes

This release closes the narrowly scoped Journey 4 local import and save-feedback backlog. Do not claim prior unpublished builds were distributed publicly; cumulative notes may be necessary for store submissions.

## Firefox Add-ons / Chrome Web Store changelog

If device storage is full, MosaicSync now explains why a profile backup could not be imported and asks you to free some space before trying again. Frequently Visited settings also show clear, translated warnings when saving fails. No new permissions.

## Mozilla Notes to Reviewer

The update is restricted to error presentation at existing storage write boundaries. `settingsFrequentlyVisited` and `settingsFrequentlyVisitedCount` catch handlers use `presentLocalPersistenceError()` to turn typed `STORAGE_LOCAL_QUOTA_EXCEEDED` / `STORAGE_LOCAL_WRITE_FAILED` errors into the already translated `localStorageFullUnsaved` / `localSaveFailedUnsaved` messages. New Tab's profile import distinguishes storage quota exhaustion from malformed/oversize files and stale profiles. Welcome's initial profile staging, deferred commit after source resolution, and local source choice handle quota with a dedicated localized `profileImportStorageFull` message, including raw `QuotaExceededError` thrown by provisional local branding writes. This does not adjust the order of write/rollback, existing Sync journal commits, or preference persistence.

A new catalog entry exists for all 33 supported languages. Red-before-green behavioral tests cover these handlers and preserve non-quota, stale-baseline, and publish-failure error precedence. No new permissions, optional hosts, CSP changes, storage schema, Sync protocol, Recovery protocol, tracking or telemetry. Previously poisoned remote Sync peers remain outside this journey's scope; legacy stored credential URLs are still readable to avoid data loss. A real-browser installation smoke test is a separate gate.

## GitHub release title

`MosaicSync 1.33.0.44`

## GitHub description

- Clear storage-full advice when a profile backup cannot be imported, including on first setup.
- Better translated save-failure messages for Frequently Visited settings.
- Journey 4 reliability improvements completed; no new permissions or Sync/Recovery format changes.

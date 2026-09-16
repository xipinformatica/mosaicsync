# MosaicSync 1.31.5 publication notes

## Mozilla changelog

Hardens browser-native Sync recovery at a rare local-storage failure boundary. Durable pending cross-Space and local-mutation journals now fail closed if the browser cannot read them, and Sync disable/reset-style cleanup stops if those journals cannot be cleared. This prevents unknown or uncleared retry state from being mistaken for “no pending work.” No feature, permission, persisted-schema or Sync wire-format change.

## Mozilla Notes to Reviewer

MosaicSync 1.31.5 is a narrow reliability correction over 1.31.4. MosaicSync already persists two small `storage.local` journals so interrupted outbound Sync work can be replayed safely: one for cross-Space transactions and one cumulative local-mutation journal.

Previously, a failed `storage.local.get()` inside those readers was logged but converted to an empty list / `null`. That made “the browser could not read durable retry authority” indistinguishable from “there is no pending work.” In addition, the shared cleanup helper used `Promise.allSettled()` while the local-journal clear helper swallowed storage failures, so Sync-disable/reset-style authority transitions could continue even if durable retry state was not actually cleared.

1.31.5 changes only that failure behavior: journal-read failures propagate, local-journal clear failures propagate, and the combined cleanup waits with `Promise.all()` so the caller stops before changing authority. Normal successful journal reads, schemas, destination-first cross-Space publication, retry behavior and Recovery are unchanged.

Three permanent generated Firefox/Chromium fault-injection regressions cover unreadable cross-Space journal state, unreadable local-mutation state, and failed cleanup followed by a successful retry.

There is no feature, UI string, permission, host-permission, CSP, persisted profile/state schema, Sync/Recovery wire-format, telemetry, remote-code or browser-floor change.

## Chrome Web Store release notes

Improves Sync reliability during rare browser local-storage failures. Pending Sync retry journals now fail closed instead of being treated as absent, and Sync disable/reset cleanup waits for verified journal removal. No features or permissions change.

## GitHub release title

`MosaicSync 1.31.5`

## GitHub release description

MosaicSync 1.31.5 hardens the durable outbound Sync journals used to recover interrupted local and cross-Space publications. If browser `storage.local` cannot be read, MosaicSync now stops rather than treating the unknown journal as empty; authority-changing cleanup likewise stops if durable retry state cannot be cleared. Three permanent Firefox/Chromium fault-injection regressions cover the failure and successful-retry paths. No feature, permission, persisted-schema, Sync/Recovery wire-format or browser-floor change.

## GitHub Desktop

**Summary:** `Release MosaicSync 1.31.5`

**Description:** `Fail closed when durable pending Sync journals cannot be read or cleared.`

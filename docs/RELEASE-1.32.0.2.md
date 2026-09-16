# MosaicSync 1.32.0.2 publication notes

## Mozilla changelog

Continues MosaicSync's 3rd Maintainability Journey with a behavior-preserving durable Sync ownership cleanup. Pending cross-Space/local-mutation journal storage mechanics now have a dedicated shared module, while atomic journal creation, Sync retry/publication, reconciliation and Recovery remain in their existing owners. No feature, permission, persisted-schema, journal-schema or Sync/Recovery wire-format change.

## Mozilla Notes to Reviewer

MosaicSync 1.32.0.2 is a zero-new-features maintainability release built from the certified 1.32.0.1 source.

The production change is one mechanical ownership extraction. Existing durable pending Normal Sync journal helpers move from `src/shared/background/background-core.js` to `src/shared/background/sync-pending-journal.js`: cross-Space journal schema/version handling, validation/enumeration, background-side write/advance/clear, cumulative local-mutation journal read/clear, combined authority-transition cleanup, and durable cross-Space journal-key construction.

The important crash-safety boundary does **not** move. `src/shared/core/storage.js` still creates the initial cross-Space intent and cumulative local-mutation journal atomically in the same `storage.local.set(...)` operation as authoritative local state. `background-core.js` still decides when pending work is retried, preserves destination-first cross-Space publication, performs `storage.sync` writes, reconciles state, publishes complete profile generations and schedules alarms.

The moved code retains the 1.31.5 fail-closed semantics: storage read/remove failures propagate instead of being interpreted as empty/cleared durable authority. Existing storage I/O calls move with the functions; no additional storage read/write, Sync write, network work, serialization, timer, queue, Promise layer, startup dependency or New Tab/first-paint await is introduced.

Nine permanent Step-3 ownership/behavior regressions were added and were proven to fail 9/9 on untouched 1.32.0.1 before passing after the extraction. Existing 1.31.5 fault-injection and historical cross-Space/local-journal regressions remain in place.

There is no feature, UI string, permission, host-permission, CSP, persisted state/profile schema, durable-journal schema, Sync/Recovery wire-format, telemetry, remote-code or browser-floor change.

## Chrome Web Store release notes

Internal maintainability improvement only: durable pending Sync journal storage mechanics now have a dedicated shared owner. Sync behavior, features, permissions and stored/synchronized formats are unchanged.

## GitHub release title

`MosaicSync 1.32.0.2`

## GitHub release description

MosaicSync 1.32.0.2 completes Step 3 of the **3rd Maintainability Journey — Ownership & Auditability**. It mechanically extracts the safe background-side durable pending Sync journal storage mechanics into `sync-pending-journal.js`, while deliberately preserving atomic initial journal creation in `core/storage.js` and retry/publication orchestration in `background-core.js`. Nine permanent Step-3 regressions were proven red on untouched 1.32.0.1 and green after extraction. No feature, permission, persisted schema, journal schema, Sync/Recovery wire format or browser-floor change.

## GitHub Desktop

**Summary:** `Release MosaicSync 1.32.0.2`

**Description:** `3rd Maintainability Journey Step 3: extract durable pending Sync journal storage ownership without changing atomic writes or Sync behavior.`

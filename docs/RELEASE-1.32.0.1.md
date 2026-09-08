# MosaicSync 1.32.0.1 publication notes

## Mozilla changelog

Starts MosaicSync's 3rd Maintainability Journey with a behavior-preserving Sync ownership cleanup. Remote Sync observation/applied-state policy now has a dedicated shared module, while storage, publication, reconciliation, Recovery and scheduling remain in the existing background orchestrator. No feature, permission, persisted-schema or Sync/Recovery wire-format change.

## Mozilla Notes to Reviewer

MosaicSync 1.32.0.1 is a zero-new-features maintainability release built from the certified 1.31.5 source.

The only production ownership change is mechanical: seven existing synchronous helpers move from `src/shared/background/background-core.js` to `src/shared/background/sync-remote-observation.js`. They interpret dataset revisions, determine whether a remote core is usable for observation/status policy, update observed receipt/provenance metadata, mark Personal/Work/device revisions as applied, and select the newest Personal/Work origin descriptor used by Sync status.

The new module has no browser API, `storage.local`/`storage.sync` access, Sync publication, reconciliation, Recovery, durable-journal handling, alarms, timers, queues, async/await or added Promise layer. `background-core.js` still decides when all effects happen. Function bodies and call ordering are preserved; historical source-shape tests were adjusted only to follow the new file boundary.

Eight permanent ownership/behavior tests were added and were proven to fail 8/8 on untouched 1.31.5 before passing after the extraction. Existing Sync/Recovery regressions continue to protect provenance and reconciliation behavior.

There is no feature, UI string, permission, host-permission, CSP, persisted state/profile schema, Sync/Recovery wire-format, telemetry, remote-code or browser-floor change.

## Chrome Web Store release notes

Internal maintainability improvement only: remote Sync observation/applied-state bookkeeping now has a dedicated shared module. Sync behavior, features, permissions and stored/synchronized formats are unchanged.

## GitHub release title

`MosaicSync 1.32.0.1`

## GitHub release description

MosaicSync 1.32.0.1 begins the **3rd Maintainability Journey — Ownership & Auditability**. It mechanically extracts remote Sync observation/applied-state policy from the large background orchestrator into one dedicated browser-neutral module, reducing the amount of core code an auditor must understand at once without changing behavior or adding runtime work. Eight permanent boundary/behavior regressions were proven red on untouched 1.31.5 and green after extraction. No feature, permission, persisted schema, Sync/Recovery wire format or browser-floor change.

## GitHub Desktop

**Summary:** `Release MosaicSync 1.32.0.1`

**Description:** `Start the 3rd Maintainability Journey by extracting remote Sync observation/applied-state policy without behavior or performance changes.`

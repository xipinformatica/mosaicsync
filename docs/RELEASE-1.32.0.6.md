# MosaicSync 1.32.0.6 publication notes

## Mozilla changelog

Fixes two pre-existing Normal Sync bootstrap concurrency races found by the Journey-3 freeze audit. Restore/await-remote bootstrap now rebases against concurrent local edits instead of overwriting them, and bootstrap completion acknowledges only the durable pending-journal generation it actually superseded. No feature, permission, persisted-schema, Sync/Recovery wire-format or browser-floor change.

## Mozilla Notes to Reviewer

MosaicSync 1.32.0.6 is a narrow Sync reliability correction built from certified 1.32.0.5. It does not add features or continue maintainability extraction.

The Step-7 freeze audit reproduced two older bootstrap races in both Firefox- and Chromium-shaped generated runtimes and also confirmed that they predated Journey 3. First, `bootstrapRemote()` captured a local baseline, performed asynchronous Sync reads, and later persisted its merged state without passing that baseline to the existing local persistence/rebase contract. A New Tab edit that committed first could therefore be overwritten by the stale bootstrap write. 1.32.0.6 passes the captured `fullLocalState` as `baseState` and continues the bootstrap using the actual rebased state returned by the storage layer.

Second, `bootstrapLocal()` and `bootstrapRemote()` ended with an unconditional cumulative pending-journal clear. A newer New Tab journal created after the bootstrap snapshot could therefore be deleted even though that newer mutation was not represented by the completed bootstrap publication. 1.32.0.6 captures only the entry-time journal generation and acknowledges it by `journalId`; a replacement generation survives. Existing fail-closed read/clear semantics and the shared persistence-lock protection remain unchanged.

The repeat audit of the candidate also closed two narrower windows in the same defect family before release: a journal read is acknowledged only when its `after` Sync signature matches the bootstrap state captured at entry, preventing the state-read/journal-read gap from adopting a newer generation; and first-Sync await-remote performs one compact local-state signature recheck immediately after initialized durable authority becomes active, sweeping in an edit that may have committed after the bootstrap state write while journaling was still intentionally disabled. Edits after that handoff have ordinary durable journal protection.

Thirteen permanent regressions were proven red 13/13 on untouched 1.32.0.5 and green after the correction. They cover authoritative local bootstrap, explicit Restore, automatic await-remote delivery, generation-specific journal preservation, and Firefox/Chromium generated-runtime parity.

There is no feature, UI string, permission, host-permission, CSP, persisted state/profile schema, Sync/Recovery wire-format, telemetry, remote-code or browser-floor change.

## Chrome Web Store release notes

Sync reliability correction: preserves concurrent local edits during Restore/first Sync delivery and prevents bootstrap completion from deleting newer durable retry work. No feature or permission changes.

## GitHub release title

`MosaicSync 1.32.0.6`

## GitHub release description

MosaicSync 1.32.0.6 is a narrow **Normal Sync bootstrap concurrency correction** discovered by the Journey-3 freeze audit.

It fixes two pre-existing races: Restore/await-remote bootstrap now uses MosaicSync's existing baseline-aware local persistence contract so a newer concurrent New Tab edit cannot be overwritten, and bootstrap completion now acknowledges only the pending Sync journal generation it actually superseded instead of clearing whichever generation exists later.

Thirteen permanent regressions were proven red on untouched 1.32.0.5 and green after the correction across Firefox- and Chromium-shaped generated runtimes. No feature, permission, persisted schema, Sync/Recovery wire format or browser-floor change.

## GitHub Desktop

**Summary:** `Release MosaicSync 1.32.0.6`

**Description:** `Fix pre-existing Sync bootstrap races so concurrent local edits and newer durable pending journals cannot be lost during Restore or first Sync delivery.`

# MosaicSync 1.30.18.24 publication notes

## Mozilla Developer Hub changelog

Completes the Recovery maintainability refactor by isolating continuity state transitions behind a browser-neutral boundary. Behavior, permissions, timing, and data formats are unchanged.

## Notes to Reviewer

This zero-feature release moves continuity/tombstone normalization and deterministic Recovery transition planning into `recovery-continuity.js`. The module receives time explicitly and contains no browser storage, alarms, publication, verification, mutation replay, normal Sync, or reset side effects.

`background-core.js` still double-checks empty Sync, persists continuity before publication, schedules alarms, publishes and verifies Recovery data, then replays pending work in the established order. Keys, schemas, state names, timing constants, permissions, CSP, and user-facing behavior are unchanged. Generated Firefox and Chromium interruption tests cover transient zero, partial delivery, worker restart grace, retry exhaustion, intentional reset, and pending-journal quarantine.

## Chrome Web Store release notes

Completes an internal Recovery maintainability refactor with unchanged behavior, permissions, timing, and synchronized data formats.

## GitHub release title

`MosaicSync 1.30.18.24`

## GitHub release description

MosaicSync 1.30.18.24 completes the planned Step-4 implementation while preserving 1.30.18.23 behavior.

Continuity/tombstone normalization and deterministic quarantine, startup-warmup, attempt/restart-grace, retry/failure, healthy/recovered, and intentional-reset transition planning now live in `recovery-continuity.js`. Browser reads/writes, clocks, alarms, Recovery publication and verification, pending replay, reset effects, diagnostics, and normal Sync remain in the shared orchestrator.

Direct equivalence and generated-runtime interruption coverage pins transient-zero defense, partial delivery, MV3 restart grace, retry exhaustion, intentional reset, pending-journal quarantine ordering, and Firefox/Chromium parity. No feature, permission, schema, persisted key/payload, timing, privacy, or normal Sync change is included. Step 4 is ready for its post-release audit before freeze.

## GitHub Desktop commit

**Summary:** `Release MosaicSync 1.30.18.24`

**Description:** Complete Step 4 by isolating pure Recovery continuity transitions while preserving all browser effects, persisted contracts, timing, and interruption behavior.

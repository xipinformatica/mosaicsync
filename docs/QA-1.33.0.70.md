# MosaicSync 1.33.0.70 QA / release-candidate checklist

**PRIVATE ENGINEERING CANDIDATE — not independently audited and not approved for publication.**

## Stage 2F scope

A user-initiated Sync reset previously left only a temporary reset-intent marker. After a new authoritative Personal+Work layout was published, that marker was deleted. A device offline for the complete interval could see only a coherent new layout when returning and reintroduce pre-reset shortcuts. The behavior was independently reproduced in .63/.69.

The corrected .70 stores an additional **persistent reset-epoch.v1** Sync key in the SAME browser storage.sync batch as the transient reset intent. Its value survives authoritative replacement. An initialized device with an older local epoch becomes uninitialized in safe await-remote mode before journal replay, local-state publication or catastrophic-loss recovery. Its local layout remains intact until it chooses or receives a replacement. Two user rejoin choices remain protected by the .69 previous-epoch journal cleanup. New epoch recognition is recorded in local Sync continuity after successful bootstrap; the device does not loop back to waiting on the same epoch.

## Protective details

- Storage quota planning reserves capacity for both reset signals and preserves the original live-core safety rule until the reset-intent is durable. A failed capacity plan aborts before remote mutation.
- The durable marker is retained during the final reset namespace cleanup; successful authoritative publication retires only the temporary reset-intent.
- The normal Sync watchdog reuses its pre-existing targeted liveness probe rather than adding another healthy-case Sync storage read.
- Local edits, ordinary journal retry, cross-Space transaction replay, direct reconciliation and both bootstrap routes check for missed reset authority before publishing.
- A complete sync read rechecks the marker because it can arrive after the initial targeted probe.
- No new permissions, URLs, telemetry, UI features or backup format modifications. The new Sync metadata key adds small ongoing quota overhead.

## Evidence and remaining uncertainty

- Stage 2F behavioral scenarios (both Chrome and Firefox): offline for both reset+replacement, offline with a pending pre-reset mutation, and marker delivered between targeted and full reads. All six tests **fail on unchanged .69 browser builds** for the two original scenarios (four tests), and **pass in .70**. Additional race-probe tests pass in .70.
- The unchanged historical browser-sync/regression, reset capacity and liveness tests are retained, with deliberately updated expectations for the second persistent key.
- The full test inventory is 231 files; run as six non-overlapping bounded Node test batches because the monolithic runner times out in this execution environment. Record the final total and log location in the private handoff.
- This is still **NOT** proof of signed-in Firefox/Chrome delivery order or true multi-device Sync safety. If the browser has not yet delivered the durable marker, no offline client can infer a reset solely from absent events. Test delayed/out-of-order delivery explicitly.
- **Mixed-version limitation:** .63–.69 clients ignore the new marker; an old offline installation can still republish pre-reset data. Upgrade all participating devices to .70 before claiming protection. Claude must independently audit this protocol extension before GitHub push or browser publication.

## Mandatory remaining gates

1. Independent Claude adversarial Stage 2F review, red-before-green and quota/failure/race analysis.
2. Six GitHub release-browser checks on the exact accepted source ZIP (not yet committed).
3. Real signed-in Chrome two-device reset/rejoin tests, then Firefox, including Personal+Work and intentionally offline devices.
4. Review Chrome/Firefox cumulative store changelogs relative to the last confirmed published store release **1.33.0.63**.
5. No publication without explicit user authorization.

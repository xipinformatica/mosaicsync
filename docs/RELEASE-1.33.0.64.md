# MosaicSync 1.33.0.64 publication notes

**PRIVATE CANDIDATE — DO NOT UPLOAD TO STORES OR GITHUB MAIN.** Independent real-browser, mixed-version, two-account and six-job release gate still pending.

## Store changelog (Firefox / Chrome)

- Improved Sync consistency when two devices edit the same Space before receiving each other's changes.
- Corrected Sync fingerprints after merging and reordering shortcuts.
- Protected deletions against stale edits even when a browser misses a Sync change notification.
- Shows a waiting state while incomplete remote data is still arriving, rather than reporting ready.

No new browser permissions or telemetry. The update introduces repair-witness Sync metadata and a device-local deletion-evidence journal; compatibility and quota behavior require independent review.

## Firefox AMO Notes to Reviewer

MosaicSync 1.33.0.64 is a private Stage 2D Sync protocol candidate based on 1.33.0.63. The dataset fingerprint is computed from the actual post-write ledger. For a torn Personal or Work ledger, automatic reconciliation does not merge immutable Recovery snapshots or trust elapsed time as evidence of completeness. A device may attest to a live ledger only after verifying its own local changes and deletion tombstones are represented. Distinct participating devices must agree on the full live record/tombstone digest before a designated leader repairs the dataset marker. Device-local deletion evidence survives service-worker restarts and protects against missed change notifications. Sync remains waiting if peers have not delivered consistent evidence. No additional permissions or telemetry are introduced.

**Status:** Not yet independently accepted. No real signed-in two-device browser test. No Firefox real fault injection. No GitHub release gate for this candidate. Do not publish.

## GitHub release title

`MosaicSync 1.33.0.64`

## GitHub release comments

Stage 2D private Sync stabilization candidate: post-write fingerprint correctness, cooperative torn-ledger repair and durable deletion evidence. Test against concurrent/offline Personal and Work changes, partial delivery, stale deletes, mixed-version clients, quota limits and real Chrome/Firefox Sync before publication.

## Publication gate

Independent real-browser acceptance, full test suite, reproducible packages, mixed-version compatibility, real two-signed-in-device Sync verification and six GitHub checks on the final .64 commit. HOLD pending evidence.

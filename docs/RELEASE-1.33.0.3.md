# MosaicSync 1.33.0.3 publication notes

## Mozilla changelog

Completes Snow Leopard II Step 2 by removing duplicate state normalization on already-validated internal paths. Authoritative compact storage events now reuse an exact detached baseline clone, while persistence/Sync/rebase carry normalized-state proof into Settings-clock stamping. Raw/persisted trust boundaries remain defensive. No permission or data-format changes.

## Notes to Reviewer

1.33.0.3 is a performance-only Snow Leopard II corrective. It does not change Sync/Recovery schemas or conflict semantics. The new fast paths are reachable only after the same operation has already obtained authoritative compact `storage.local` bytes or returned state from `normalizeState()`; public/raw callers retain defensive normalization.

## GitHub release title

`MosaicSync 1.33.0.3`

## GitHub release description

MosaicSync 1.33.0.3 completes **Snow Leopard II Step 2 — State computation and serialization**.

Two duplicate-defensive costs were measured and removed without weakening trust boundaries:

- New Tab `storage.local` state events now clone the exact persisted compact payload into the optimistic-write baseline instead of rebuilding that same baseline through full normalization and local-asset projection.
- Persistence, background Sync mutation handling and optimistic rebase now pass already-normalized state into a trusted Settings-clock stamping path instead of validating the same state tree again.

The public defensive Settings-clock API remains unchanged for raw callers, and persistence still validates live intended state plus persisted/base authority before using the fast path.

Permanent Step-2 regressions cover baseline identity/detachment, trusted stamping equivalence, New Tab event adoption, background Sync and optimistic rebase ownership, and benchmark controls.

No new permissions, telemetry, remote code, persisted schema, profile format, Normal Sync/Recovery wire format, CSP or browser-floor changes.

Full suite: **1,170/1,170 PASS**. Step-2 evidence is frozen in `docs/SNOW-LEOPARD-II-STEP2-1.33.0.3.json`.

## GitHub Desktop

**Summary:** Release MosaicSync 1.33.0.3 — remove duplicate trusted-state normalization

**Description:** Reuse exact persisted compact baselines and carry normalized-state proof through Settings-clock stamping without weakening raw/persisted validation.

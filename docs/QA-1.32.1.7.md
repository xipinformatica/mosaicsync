# MosaicSync 1.32.1.7 QA / release-candidate checklist

## Scope

Narrow logical mutation-clock correctness corrective over 1.32.1.6. No Normal Sync/Recovery wire-format, persisted-state schema, profile-format, permission, CSP or browser-floor changes.

## Corrective invariant

- Mutation clocks used in deterministic local/Sync ordering are non-negative JavaScript safe integers.
- Non-safe persisted/imported clocks cannot survive state/workspace/item/Settings normalization as ordering authority.
- Non-safe Sync record clocks cannot outrank legitimate safe records or re-enter authoritative local state during reconstruction.
- Tombstone/namespace-move comparison applies the same safe clock interpretation.
- `nextMutationTime()` never silently returns the same value as a valid observed maximum; the theoretical safe-integer ceiling fails closed.

## Permanent regressions

`tests/corrective-13217.test.mjs` covers persisted-state normalization, mutation advancement/exhaustion, deterministic Sync record ordering (including tombstone/move semantics), and Sync reconstruction. The four regressions were red 4/4 on untouched 1.32.1.6 before the production correction.

## Final automated verification

Full/focused tests, benchmark, size baseline, reachability, mechanical certification and clean-room artifact reproduction are recorded after the publication tree is frozen.

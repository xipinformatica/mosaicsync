# MosaicSync 1.32.1.6 QA / release-candidate checklist

## Scope

Narrow New Tab concurrency corrective over 1.32.1.5. No Normal Sync/Recovery algorithm, persisted-state schema, profile-format, permission, CSP or browser-floor changes.

## Corrective invariant

- Space-switch and drag-preview hydration results remain local until their owning operation is still current and `stateMutationGeneration` still matches the state from which hydration started.
- If authoritative state changes during hydration or destination-background preload, the stale result is discarded and hydration retries from current state.
- If a Space operation is superseded/ended, its pending result cannot commit.
- Live `state` and `writeBaseline` remain causally paired so the next local save cannot erase a concurrent authoritative change.

## Permanent regressions

`tests/corrective-13216.test.mjs` reproduces the scheduler race for normal Space switching and drag preview. The normal-switch case injects a newer authoritative shortcut during delayed hydration, then performs the next local save and proves the concurrent shortcut survives with the newer baseline. The new regressions were red 3/3 on untouched 1.32.1.5 before the production correction.

## Final automated verification

Full/focused tests, benchmark, size baseline, reachability, mechanical certification and clean-room artifact reproduction are recorded after the publication tree is frozen.

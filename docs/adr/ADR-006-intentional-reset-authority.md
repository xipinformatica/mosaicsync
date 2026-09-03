# ADR-006 — Intentional reset is authoritative and must not resurrect stale local state

**Status:** Accepted / frozen

## Decision

A valid intentional reset is authoritative over a device's old local profile. Reset handling clears/quarantines pending recovery mutation state and enters the established await-remote path so pre-reset local state cannot be merged back into the first replacement profile.

## Why

A device that was offline during a reset can still possess a perfectly valid old local profile. Treating that old profile as recovery authority would undo the user's explicit reset and resurrect deleted data.

## Do not casually change

Do not make catastrophic Recovery or pending-journal replay run ahead of reset-intent observation. Do not merge the pre-reset local profile into the first verified post-reset replacement.

## Evidence

- `tests/corrective-13014.test.mjs`
- `tests/recovery-continuity-1301824.test.mjs`
- `tests/recovery-stress-13014.test.mjs`

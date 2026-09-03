# ADR-004 — Recovery is a safety layer, not a second Sync algorithm

**Status:** Accepted / frozen

## Decision

Normal Sync owns ordinary record convergence and conflict resolution. Recovery owns complete-profile safety generations and catastrophic-loss recovery. Recovery does not decide normal Sync merge outcomes.

Recovery responsibilities remain split between representation/format, mechanical generation storage, lifecycle/retention, pure continuity-state decisions and effectful orchestration in the shared background core.

## Why

Mixing Recovery with normal convergence would create two competing synchronization algorithms. The Step-4 split makes each failure domain reviewable without moving browser observations, alarms, publication, verification or pending-journal sequencing into pure policy modules.

## Do not casually change

Do not use Recovery generations as a shortcut for normal Sync merge logic. Do not move browser/storage effects into `recovery-continuity.js` merely to reduce core line count.

## Evidence

- `tests/recovery-generation-format-1301820.test.mjs`
- `tests/recovery-generation-store-1301821.test.mjs`
- `tests/recovery-generation-lifecycle-1301823.test.mjs`
- `tests/recovery-continuity-1301824.test.mjs`
- `tests/recovery-stress-13014.test.mjs`
- `docs/STEP-5.6-FINAL-FORENSIC-AUDIT.md`

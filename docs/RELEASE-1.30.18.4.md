# MosaicSync 1.30.18.4 publication notes

## Mozilla Developer Hub changelog

Fixes brief first-paint flashes of default Space names and fallback shortcut letters when customized names or already-known favicons are available. Also hardens complete-profile recovery rotation against clock skew, near-quota two-generation replacement and abandoned incomplete recovery fragments, while adding real cloned-profile concurrency coverage and removing one redundant full Sync read. Existing Sync/profile schemas, permissions, CSP, telemetry and backend behavior are unchanged.

## Notes to Reviewer

1.30.18.4 is a focused correctness/maintenance follow-up to 1.30.18.3. The New Tab still uses its existing fast first-paint cache, but static default Space labels are no longer painted before customized names are known, and a shortcut known to have artwork no longer paints a fallback letter merely because its tiny preview is temporarily unavailable. No new user-facing strings or permissions are introduced.

The complete-profile recovery layer keeps the immutable generation design introduced in 1.30.18.3. Retention now orders same-device generations by logical profile recency before wall-clock publication time, protects and re-verifies the generation just committed, and can safely retire only the oldest verified fallback before staging a replacement when retaining two old generations would otherwise exceed Sync quota. Root-less chunk groups left by a hard interruption are reclaimed only after a local observation grace period. Legacy fixed-root `a/b` snapshots remain readable, and ordinary Sync record identity/conflict semantics are unchanged.

The test harness now supports two independent simulated browser/Sync views sharing one copied persistent MosaicSync device identity, covering the cloned-profile case end-to-end on Firefox and Chrome. State/meta/Sync/device-snapshot/profile-snapshot payload schema versions remain unchanged. No CSP relaxation, telemetry, backend, remote code or permission change is included.

## GitHub release title

`MosaicSync 1.30.18.4`

## GitHub release description

MosaicSync 1.30.18.4 makes the first visible New Tab frame truthful for customized Space names and already-known favicons, and hardens the 1.30.18.3 recovery-generation system against clock skew, quota-bound rotation and abandoned incomplete fragments. It also adds real same-identity cloned-profile concurrency coverage while preserving existing Sync semantics and legacy recovery compatibility.

## GitHub Desktop

**Summary:** `Release MosaicSync 1.30.18.4`

**Description:** `Fix first-paint flashes and harden recovery-generation maintenance.`

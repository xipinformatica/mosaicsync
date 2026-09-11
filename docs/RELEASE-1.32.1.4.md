# MosaicSync 1.32.1.4 publication notes

## Mozilla changelog

Fixes a Sync-reachable normalization edge case where two shortcuts independently targeting the same grid position could require a second normalization pass and visibly reorder after a later save/reload. Position-collision repair is now canonical in one pass, and profile export/import remains stable after repair. Also prevents a stale no-op workspace rebase from creating bookkeeping-only signature changes in an untouched Space. Adds permanent two-device merge, fixed-point, no-op rebase and profile round-trip regressions. No new permissions, profile-format version, Sync/Recovery wire-format, CSP or browser-floor changes.

## Mozilla Notes to Reviewer

1.32.1.4 is a narrow model/concurrency corrective. It makes bounded top-level collision repair a one-pass fixed point, including ordinary two-device Sync collisions, and makes exact no-op stale workspace rebases preserve the latest workspace unchanged. No permission, schema, profile-format or Sync/Recovery wire-format changes.

## Chrome Web Store release notes

Fixes a grid-order normalization edge case after concurrent same-slot edits. Repaired layouts are now canonical after one pass and profile round trips remain stable. No permission or data-format changes.

## GitHub release title

`MosaicSync 1.32.1.4`

## GitHub release description

MosaicSync 1.32.1.4 is a narrow normalization-correctness corrective over 1.32.1.3.

An independent unknown-unknowns/state-machine audit found that when two valid top-level records shared the same grid position, the bounded repair path could assign unique positions while returning the array in its pre-repair order. A later normalization, restart or export would then reorder the grid even though the user had made no new change.

The audit also proved this is reachable through ordinary two-device Sync: two devices can concurrently move different shortcuts into the same slot, record-level merge correctly preserves both edits, and the normalizer must canonicalize the resulting position collision.

The capacity-bounded repair now searches forward from the original valid position, wraps only when necessary, and returns records sorted by their final assigned positions. `normalizeState()` therefore reaches a fixed point after one pass, and collision-shaped profile export→import→export remains canonical.

During the immediate post-fix chaos audit, a second adjacent edge was found: an exact no-op stale workspace rebase could reconstruct an untouched Space and materialize bookkeeping-only timestamp changes. The rebase now preserves the normalized latest workspace directly when the caller has no workspace delta.

Permanent regressions include the exact two-record reproduction, a real record-level two-device merge collision, profile round-trip checksum stability under a fixed export timestamp, an exact no-op stale-rebase assertion, and 2,500 seeded collision-heavy normalization property cases.

No feature, permission, persisted-state schema, profile-format, Sync/Recovery wire-format, CSP or browser-floor changes.

## GitHub Desktop

**Summary:** `Release MosaicSync 1.32.1.4 — canonicalize Sync position collisions`

**Description:** `Fix one-pass normalization of colliding top-level grid positions, including ordinary two-device same-slot Sync merges, and add fixed-point/profile round-trip property regressions.`

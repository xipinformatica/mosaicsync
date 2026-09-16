# MosaicSync 1.30.17 publication notes

## Mozilla Developer Hub changelog

Prevents older MosaicSync clients from reverting newer unrelated Settings during mixed-version Sync. Legacy-only compatibility and current fine-grained Settings conflicts remain deterministic. No permission, UI, telemetry or backend change.

## Notes to Reviewer

1.30.17 is a narrow Sync-compatibility correction. When one Settings record has an explicit per-control clock and the other is legacy/no-clock, the explicit modern value wins that control; old whole-record timestamps can no longer overwrite unrelated modern intent. Raw legacy snapshot/shared-ledger regressions cover Firefox and Chrome. Sync/state schemas are unchanged.

## GitHub release title

`MosaicSync 1.30.17`

## GitHub release description

MosaicSync 1.30.17 closes a mixed-version Settings Sync edge case where a still-running pre-1.30.15 client could re-stamp stale Settings during an unrelated edit and revert newer fine-grained preferences. Modern explicit clocks now outrank legacy whole-record timestamps per logical control, while legacy-only compatibility and modern-vs-modern conflict semantics remain intact.

## GitHub Desktop

**Summary:** `Release MosaicSync 1.30.17`

**Description:** `Prevent legacy whole-record Settings writes from reverting modern fine-clock preferences.`

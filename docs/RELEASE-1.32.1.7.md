# MosaicSync 1.32.1.7 publication notes

## Mozilla changelog

Fixes a logical-clock correctness edge where malformed/imported timestamps outside JavaScript's safe-integer range could stop advancing and distort deterministic conflict ordering. Mutation clocks are now constrained to non-negative safe integers, unsafe Sync clocks cannot dominate valid records, and numeric exhaustion fails closed. No permission, profile-format, persisted-schema, Sync/Recovery wire-format, CSP or browser-floor changes.

## Mozilla Notes to Reviewer

1.32.1.7 is a narrow model correctness corrective. It changes only validation/interpretation of logical mutation timestamps used by local state and deterministic Sync record ordering. Valid timestamps remain ordinary JSON numbers; Normal Sync/Recovery data structures and algorithms are otherwise unchanged. No new permissions, remote code, telemetry, schemas or browser-floor changes.

## Chrome Web Store release notes

Hardens logical timestamp handling so malformed non-safe numeric clocks cannot distort later changes or synchronized conflict ordering. No permission or data-format changes.

## GitHub release title

`MosaicSync 1.32.1.7`

## GitHub release description

MosaicSync 1.32.1.7 is a narrow logical-clock correctness corrective over 1.32.1.6.

The 1.32.1.5 unknown-unknowns audit found that MosaicSync accepted any finite JavaScript number for mutation clocks. Numbers beyond JavaScript's safe-integer range cannot provide a strict logical +1 sequence (`1e20 + 1 === 1e20`), so a malformed imported/persisted timestamp could remain unchanged across a later user edit and distort deterministic record ordering.

The model now defines one explicit logical-clock domain: non-negative JavaScript safe integers. State/workspace/item/Settings normalization rejects non-safe clocks, Sync conflict comparison/reconstruction applies the same rule to remote records, and tombstone/namespace-move comparison no longer lets an unsafe numeric clock permanently dominate a legitimate move. `nextMutationTime()` fails closed with `RangeError` at the theoretical safe-integer ceiling instead of silently pretending to advance.

A permanent corrective regression was proven red 4/4 on untouched 1.32.1.6 and green after correction. It covers persisted state normalization, logical-clock advancement/exhaustion, malformed Sync conflict ordering and Sync reconstruction.

No feature, permission, persisted-schema, profile-format, Normal Sync/Recovery wire-format, CSP or browser-floor changes.

## GitHub Desktop

**Summary:** `Release MosaicSync 1.32.1.7 — enforce safe logical mutation clocks`

**Description:** `Reject non-safe logical timestamps at model trust boundaries, keep malformed Sync clocks out of deterministic ordering/reconstruction, and fail closed at numeric clock exhaustion.`

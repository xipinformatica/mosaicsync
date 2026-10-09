# MosaicSync 1.33.0.39 publication notes

## AMO / Chrome Web Store changelog

Protects profile import from deliberately extreme internal timestamps that could otherwise make later edits impossible. Normal profile imports and synchronization behavior remain unchanged.

## Mozilla Notes to Reviewer

1.33.0.39 is a narrow import trust-boundary corrective over 1.33.0.38.

MosaicSync uses non-negative JavaScript safe-integer logical clocks for deterministic local/Sync ordering. The clock engine itself already rejects non-safe values and fails closed at theoretical exhaustion. However, the whole-profile importer previously computed its fresh replacement stamp from clocks contained in the untrusted imported file itself. A checksum-valid profile containing a safe integer immediately below `Number.MAX_SAFE_INTEGER` could therefore stamp the imported profile at the ceiling. The import would succeed, but the next ordinary edit could no longer advance the logical clock.

The model now owns one `stampImportedProfileState()` trust boundary used by both normal New Tab profile import and Welcome/setup import.

Imported logical clocks are treated as ordering hints only when they are within a deliberately generous bounded future-skew window relative to wall time. Implausibly distant imported clocks are ignored when choosing the authoritative replacement stamp. This changes only clock authority; imported profile content still passes through the existing normalization/profile validation path.

The stamp also observes the current authoritative local profile across both Spaces, including workspace clocks, fine-grained Settings clocks and existing cross-Space namespace generations. Therefore a deliberate whole-profile import remains newer than the profile it replaces even if that current profile is legitimately ahead of wall time.

For shortcut namespace ordering, an imported `spaceMoveAt` is rebased to the fresh import stamp only when the imported shortcut or current same-ID shortcut already has a non-zero namespace-generation marker. Shortcuts that have never crossed Spaces remain at zero, so the corrective does not add that optional Sync field gratuitously.

The logical clock engine, Sync merge rules, Recovery, profile format, persisted schema and browser permissions are otherwise unchanged.

Permanent behavioral protection is in `tests/trust-boundary-133039.test.mjs`. Against untouched 1.33.0.38 the final focused file is 2/7 PASS and 5/7 FAIL, reproducing the near-ceiling edit freeze and the missing current-profile/Settings/namespace authority. Deliberate breaks independently prove the tests catch re-trusting hostile imported clocks, omitting current clocks, omitting fine-grained Settings clocks, and failing to rebase existing namespace generations.

Final certification: Startup 292/292; New Tab 592/592; Sync 357/357; Recovery 225/225; Security 247/247; Browser/parity 307/307; Core 244/244; Release 509/509. Complete unique suite: 1406/1406 PASS across 199 test files.

## GitHub release title

`MosaicSync 1.33.0.39`

## GitHub release description

MosaicSync 1.33.0.39 hardens profile import against deliberately extreme internal logical timestamps.

- Imported clocks can no longer push the authoritative profile to JavaScript's safe-integer ceiling and make later edits impossible.
- Reasonable clock skew in legitimate exported profiles remains supported.
- An explicit import now also observes the current profile's record, Settings and cross-Space ordering clocks so the replacement reliably outranks what it replaces.
- New Tab and Welcome/setup use the same model-owned import clock policy.

No new features, permissions, Sync/Recovery format changes, profile-schema changes or privacy changes are included.

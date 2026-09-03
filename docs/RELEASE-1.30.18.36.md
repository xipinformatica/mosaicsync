# MosaicSync 1.30.18.36 publication notes

## Mozilla Developer Hub changelog

Combines Maintenance Infrastructure M4 and M5 with focused test commands and deterministic property/fuzz coverage around the frozen MosaicSync runtime. Product behavior, permissions and data formats are unchanged.

## Notes to Reviewer

MosaicSync 1.30.18.36 begins from the validated 1.30.18.35 runtime and does not reopen the frozen 1.30.18.32 application architecture.

M4 adds a small dependency-free test-group runner. `npm test` remains the authoritative complete regression suite, while convenience commands (`test:startup`, `test:newtab`, `test:sync`, `test:recovery`, `test:security`, `test:browser`, `test:core`, and `test:release`) provide faster local feedback. Group membership is deterministic and every permanent `.test.mjs` file must belong to at least one group.

M5 adds a bounded deterministic property/fuzz layer using a fixed seeded generator rather than an external fuzzing dependency. The permanent campaign exercises 2,640 generated cases across four high-value trust boundaries: arbitrary JSON-like state normalization/prototype-pollution resistance, malformed and checksum-valid mutated profile imports, Recovery continuity/tombstone normalization, and HTTP(S)-only shortcut navigation validation. Every failure reports its seed and case number for exact reproduction.

No production testing hooks, randomized UI/browser behavior, unbounded fuzz campaign, or production refactor is introduced. The only extension-runtime edits are unified release identity. Startup, New Tab, Settings, Frequently Visited, favicon/artwork, storage, normal Sync, Recovery, permissions, CSP, schemas, locales and browser adapters are unchanged.

## Chrome Web Store release notes

Maintenance test infrastructure only: adds focused test commands and bounded deterministic property/fuzz coverage around the frozen runtime. No feature, permission or synchronized-data-format change.

## GitHub release title

`MosaicSync 1.30.18.36`

## GitHub release description

MosaicSync 1.30.18.36 combines Maintenance Infrastructure M4 and M5 without changing application behavior.

The regression suite now has simple cross-platform subsystem commands for fast local feedback while `npm test` remains authoritative. A small dependency-free seeded property/fuzz layer adds reproducible hostile-input coverage around state normalization, profile imports, Recovery continuity and HTTP(S)-only navigation safety.

The extension runtime remains frozen apart from release identity.

## GitHub Desktop commit

**Summary:** `Release MosaicSync 1.30.18.36`

**Description:** Combine M4/M5 with focused regression commands and bounded deterministic property fuzzing; no product behavior change.

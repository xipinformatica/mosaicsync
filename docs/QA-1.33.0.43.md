# MosaicSync 1.33.0.43 QA / release-candidate checklist

## Scope

- Preserve all 1.33.0.42 B-1/B-2/B-3 production corrections, historical tests, and the 1.33.0.41 real two-device skew-clock regressions.
- Four save-feedback areas: direct multi-Space / Space-name writes, immediate and debounced wallpaper persistence, folder rename exits, and async theme-choice persistence.
- For storage quota or write failures, display the already localized friendly message, not raw platform diagnostics; do not claim the durable baseline has advanced. Keep the user's still-live edit pending.
- No normal Sync/Recovery or persisted-data format changes.

## Regression proof

- `tests/trust-boundary-133043.test.mjs`: five behavioral tests fail on the corrected 1.33.0.42 baseline; all six pass on 1.33.0.43. The sixth verifies inherited B-1/B-2/B-3 boundaries.
- All existing 1.33.0.41/.42 tests remain present without deletion.

## Certification

- Run the complete Node regression suite, runtime reachability, release contracts, package-size baseline, independent clean-room rebuild, and byte-for-byte SHA-256 comparison. Real-browser installation/smoke must be reported separately, not inferred from Node tests.

## Deferred

- Multi-device recovery from pre-existing impossible Sync clocks needs a distributed protocol design and independent review.
- Legacy URL credentials are not silently scrubbed and cosmetic translation-formality consistency may be improved separately.

# MosaicSync 1.33.0.66 publication notes

**PRIVATE CANDIDATE — DO NOT PUBLISH UNTIL INDEPENDENT REVIEW, GITHUB GATE AND REAL-DEVICE SYNC ACCEPTANCE.** Built on the independently accepted .65 source ZIP SHA-256 `169adbbb9f5d9734f6b123fec2a7f62a61b9816a99dfe3a0a52c0044a6d7f775`.

## Store changelog (Firefox / Chrome)

- Visually centers the **+** in the onboarding tile displayed when a Space has no shortcuts. The correction applies equally to empty Personal and Work Spaces.
- Preserves the ordinary **+** button in populated grids.
- Includes the accepted .65 localized Sync waiting-state UI and earlier .64 Sync safety corrections.

No new permissions, network destinations, storage formats, Sync wire fields, telemetry, translations or Recovery changes in .66.

## Firefox AMO Notes to Reviewer

MosaicSync 1.33.0.66 makes a one-property CSS-only visual adjustment in `src/shared/newtab/newtab-critical.css`: the empty-Space `.empty-ghost-tile span` moves from `translateY(-1px)` to `translateY(-2.5px)`. The same HTML/CSS component is used in both Personal and Work. Normal `.add-slot` remains unchanged. All other production changes versus .65 are release identity metadata; inherited .64/.65 Sync safety and localization code is byte-identical. No new permissions or data collection.

The empty onboarding tile is reachable in a new/disposable profile with no shortcuts in either Space. Confirm its + appears centered in both Spaces and the populated-grid + remains unchanged. The inherited .64 Sync repair protocol still requires real signed-in two-device acceptance.

## GitHub release title

`MosaicSync 1.33.0.66`

## GitHub release comments

Private visual polish: optically center the empty-Space + glyph with a measured 1.5 CSS-pixel upward adjustment. Personal and Work share the same onboarding component. No changes to Sync, data integrity, permissions, or translations compared with the independently accepted .65.

## Publication gate

Independent visual review, full automated tests, deterministic source/browser packages, six GitHub release checks, and real signed-in two-device Sync verification. Keep private until all gates are satisfied.

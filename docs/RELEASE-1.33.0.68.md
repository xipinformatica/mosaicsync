# MosaicSync 1.33.0.68 publication notes

**PRIVATE CANDIDATE — DO NOT PUBLISH until independent audit and release gates.**

## Public changelog (cumulative from published 1.33.0.63)

- Improves Sync convergence for simultaneous and offline edits in Personal and Work, while preserving deletions against stale changes.
- Corrects dataset fingerprints and allows healthy Spaces to keep syncing when the other Space is waiting for safe recovery.
- Makes waiting status accurate in Settings and translates its explanations across all 34 supported languages.
- Replaces font-dependent + glyphs with consistently centered CSS-drawn add icons, including empty Spaces and populated grids.
- **New in 1.33.0.68:** restores visibility of the + icons in Windows High Contrast / forced-colours mode using system-colour-compatible borders.
- No new permissions, telemetry, tracking, external assets or network destinations. Existing settings and backups remain compatible.

## Firefox AMO reviewer notes

Version 1.33.0.68 builds on the .63 published baseline with Sync data-integrity and status improvements introduced in .64–.65, and visual improvements introduced in .66–.68. This candidate changes only CSS plus icon painting and version/docs/tests versus .67: the two bars are now borders rather than background fills, so they remain visible in forced-colours mode. Their geometry, accessible labels, keyboard/click/hover/focus/drag behavior are unchanged. Sync/Recovery/deletion protection and permissions are unchanged from .67. No new network requests, remote services or telemetry. Test in Windows High Contrast or Chromium forced-colours emulation, in empty Personal/Work and the ordinary grid add slot. Real signed-in multi-device Sync remains an outstanding release gate.

## Chrome Web Store reviewer notes

The only functional difference from 1.33.0.67 is a CSS accessibility correction for plus-shaped add controls in forced-colours / Windows High Contrast. The bars now use system-recolourable borders instead of background fills. No permission changes or additional remote endpoints. The published 1.33.0.63 to 1.33.0.68 update also contains the Sync reconciliation and localized waiting-status improvements described above.

## GitHub release title

`MosaicSync 1.33.0.68`

## Release gates

Independent accessibility re-audit, full regression suite, reproducible packaging, six GitHub jobs on this exact candidate, and real signed-in two-device Sync convergence. The historical-device waiting limitation remains documented.

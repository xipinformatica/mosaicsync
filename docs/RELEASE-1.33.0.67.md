# MosaicSync 1.33.0.67 publication notes

**PRIVATE / DO NOT PUBLISH until independent review, six GitHub jobs, and real signed-in two-device Sync acceptance.** Based on audited 1.33.0.66.

## Store changelog

- Uses crisp, font-independent plus symbols in the empty-Space onboarding tile and ordinary shortcut grid.
- Centers both symbols consistently across fonts, while preserving hover, focus, click and drag interactions.
- Carries forward 1.33.0.65 Sync waiting UI and 1.33.0.64 Sync safeguards without changing their behavior.

## Firefox AMO reviewer notes

The add-button plus is now drawn by two centered CSS pseudo-elements rather than the platform's font glyph. The onboarding button retains its `aria-label` and decorative `aria-hidden` span. The ordinary add button retains its localized `aria-label`; the span is decorative. No scripts are added, no external assets or requests are made, and permissions and Sync/Recovery/storage code are unchanged from .66. Inspect empty Personal/Work and hover an empty position in a populated Space to see both shapes. This version remains private pending independent audit and real signed-in Sync verification.

## GitHub release title

`MosaicSync 1.33.0.67`

## Release gates

Independent visual audit, 1592+ automated tests, deterministic packages, six GitHub checks and real signed-in two-device Sync convergence. No store publication until all gates pass.

# MosaicSync 1.33.0.21 QA / release-candidate checklist

## Scope

1.33.0.21 is deliberately limited to four areas over authoritative 1.33.0.20:

1. known-artwork first-frame/session handoff and render-manifest preview publication;
2. fresh-install Light/Dark built-in wallpaper defaults;
3. Add/Edit Shortcut no-color swatch alignment;
4. Developer Guide normalization from release ledger to evergreen architecture manual.

Normal Sync, Recovery, journals, wire formats, schemas, permissions, browser floors and privacy boundaries are out of scope and must remain unchanged.

## Red-before-green regression

Before the production edits, `tests/corrective-133021.test.mjs` demonstrated the intended failures: deferred known artwork inserted a fallback letter; artwork hydration did not opt into a preview-aware single manifest writer; the no-color swatch still used a font glyph; fresh defaults were disabled/empty; and the Developer Guide began with version-history headings. Existing render-snapshot `imageDeferred` projection and genuine iconless fallback behavior were already correct.

After the production edits the dedicated gate must pass in full.

## Required behavioral checks

- `imageDeferred === true` with no image/preview/builtin icon inserts no fallback letter.
- genuinely iconless authoritative shortcut still renders its fallback letter.
- authoritative missing/corrupt local-asset reference does not remain blank indefinitely.
- top-level and folder-child render snapshots preserve `imageDeferred` for omitted known artwork.
- artwork-aware `saveState()` uses the preview-aware manifest refresh instead of the ordinary refresh (one writer).
- both native favicon and remote/site-artwork hydration opt into the artwork-aware save path.
- no-color swatch contains no text glyph and uses centered CSS pseudo-element strokes; selected border remains normal.
- fresh defaults are `themeWallpapersEnabled: true`, `lightBackgroundPreset: "solarDrift"`, `darkBackgroundPreset: "blueglow"`.
- Developer Guide starts with `# MosaicSync Developer Guide`, contains no release-number section headings, and preserves the important current invariants extracted from the historical blocks.

## Certification

- full repository regression suite green;
- all focused groups green;
- runtime reachability green;
- performance/size reviewed for accidental startup regression;
- browser smoke capability probed honestly;
- deterministic Firefox/Chrome/source packaging;
- clean-room source rebuild/retest/repackage reproduces byte-for-byte.

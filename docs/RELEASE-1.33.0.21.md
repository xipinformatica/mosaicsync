# MosaicSync 1.33.0.21 publication notes

## AMO changelog

Focused New Tab polish and fresh-install defaults over the frozen 1.33.0.20 correctness baseline. Known deferred shortcut artwork no longer flashes a fallback letter while authoritative favicon pixels are loading; device-local favicon/site-artwork changes refresh the preview-aware first-frame manifest without racing the ordinary manifest writer. Fresh installs default to Solar Drift on Light and Blueglow on Dark. The Add/Edit Shortcut no-color swatch now uses a CSS-drawn centered cross. The Developer Guide has been normalized into an evergreen current-architecture manual. No Sync/Recovery format, persisted schema, permission, browser-floor or privacy-boundary change.

## Notes to Reviewer

1.33.0.21 does not change Normal Sync or Recovery behavior. `appendImageOrFallback()` now treats the existing session-render `imageDeferred` flag as “known artwork pixels intentionally omitted”: it keeps a usable preview when available and otherwise avoids inserting a temporary fallback letter. Genuine authoritative iconless/missing-asset states still render the normal letter fallback.

`saveState()` has an `artworkChanged` option used by `hydrateDeviceFavicons()` and `hydrateRemoteImageSources()`. Those local-cache artwork writes choose the existing `refreshRenderManifestAfterArtworkChange()` path instead of the ordinary first-paint manifest refresh, avoiding duplicate/racing manifest publications while generating/reusing the tiny preview. Fresh-install defaults enable `solarDrift` for Light and `blueglow` for Dark. Existing persisted settings remain authoritative. The no-color swatch change is CSS/markup only.

## GitHub release title

`MosaicSync 1.33.0.21`

## GitHub release description

MosaicSync 1.33.0.21 is a focused New Tab polish/defaults/documentation release. It removes the remaining known-artwork fallback-letter flash during session-to-authoritative startup handoff, makes device-local favicon/site-artwork saves publish the preview-aware first-frame manifest through one writer, defaults fresh installs to Solar Drift (Light) and Blueglow (Dark), and centers the no-color shortcut swatch X with CSS strokes. The Developer Guide is now an evergreen architecture/workflow manual instead of a duplicate release ledger. Sync, Recovery, permissions, schemas and privacy boundaries are unchanged.

## GitHub Desktop

**Summary:** Release MosaicSync 1.33.0.21 — New Tab first-frame polish and fresh-install defaults

**Description:** Remove known-favicon letter flash, use preview-aware artwork manifest saves, default fresh installs to Solar Drift/Blueglow by appearance, center the no-color X, and normalize the Developer Guide without changing Sync/Recovery contracts.

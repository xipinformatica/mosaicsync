# MosaicSync 1.30.18.39 publication notes

## Mozilla changelog

Improves the Add/Edit Shortcut experience on short laptop screens and keeps favicons crisp during tile hover. The editor now uses a height-aware compact layout with consistent image controls and an accessible information bubble for image-sync details. No permissions, Sync/Recovery behavior or data formats changed.

## Mozilla Notes to Reviewer

MosaicSync 1.30.18.39 is a narrow UI corrective release based on two reproduced user-facing defects.

On wide-but-short laptop viewports, the shortcut editor previously selected its layout by width alone, leaving Save/Cancel below the routine visible area. A `max-height: 760px` desktop media query now compacts only this dialog: image actions form a two-column grid, image style and shortcut color share one row, and the two persistent artwork explanations live in a native `<details>` information bubble accessible by hover, keyboard focus and click. Generic dialog overflow remains available for exceptionally small windows and long translations.

The shortcut hover previously scaled the complete tile to `1.045`, fractionally resampling the 53px favicon. Hover now preserves the same background, outline, shadow, brightness and restrained one-pixel lift without scaling artwork.

Three new regressions were first run against untouched 1.30.18.38 and failed 3/3. No permissions, CSP, Sync, Recovery, state/schema, browser-adapter or user-data-format change is included.

## Chrome Web Store release notes

Improves the shortcut editor on short laptop screens and keeps favicons crisp during tile hover. Image-sync help is now available from an accessible information bubble. No new permissions or data-format changes.

## GitHub release title

`MosaicSync 1.30.18.39`

## GitHub release description

MosaicSync 1.30.18.39 is a focused post-freeze UI corrective release.

The Add/Edit Shortcut dialog now fits common short laptop viewports without routine scrolling, with consistent image-action buttons and compact artwork help. Tile hover keeps its polished highlight and lift without fractionally scaling favicon pixels. The README also links the official Chrome Web Store listing.

The new regressions failed 3/3 on untouched 1.30.18.38. Sync, Recovery, permissions, CSP, schemas, browser adapters and user-data formats remain unchanged.

## GitHub Desktop

**Summary:** `Release MosaicSync 1.30.18.39`

**Description:** `Fix short-laptop shortcut-editor fit and hover favicon sharpness; add the official Chrome Web Store README link.`

# MosaicSync 1.30.18.40 publication notes

## Mozilla changelog

Corrects the Add/Edit Shortcut presentation introduced in 1.30.18.39. Image-sync help now opens on hover, closes automatically and stays within the dialog. All four image actions share one compact desktop row, and Light-mode field labels no longer show unintended white strips. No permissions, Sync/Recovery behavior or data formats changed.

## Mozilla Notes to Reviewer

MosaicSync 1.30.18.40 is a narrow UI follow-up to the published 1.30.18.39 release.

The image-sync help used native `<details>`, whose closed content could not be exposed reliably by CSS hover and whose click-open state survived reuse of the dialog. It is now a non-toggle help button with an adjacent tooltip shown only by pointer hover or keyboard `:focus-visible`. The tooltip has no persistent open state, ignores pointer events, and is sized relative to the complete artwork row so it remains inside the dialog.

The four existing artwork actions now occupy one responsive desktop grid row. A Light-theme selector that accidentally grouped labels and legends with inputs has also been split, leaving only actual inputs/selects with white control surfaces.

Three new regressions failed 3/3 on untouched 1.30.18.39. No permissions, CSP, Sync, Recovery, schema, browser-adapter or user-data-format change is included.

## Chrome Web Store release notes

Fixes shortcut-editor artwork help, keeps all four image actions on one desktop row, and removes unintended white strips behind Light-mode field labels. No new permissions or data-format changes.

## GitHub release title

`MosaicSync 1.30.18.40`

## GitHub release description

MosaicSync 1.30.18.40 is a focused follow-up to the published 1.30.18.39 UI correction.

Artwork help now appears on hover, closes automatically, cannot remain stuck after reopening the editor, and fits within the dialog. The four image actions share one compact desktop row, while Light-mode field labels once again sit directly on the dialog surface without white strips.

Sync, Recovery, permissions, CSP, schemas, browser adapters and user-data formats remain unchanged.

## GitHub Desktop

**Summary:** `Release MosaicSync 1.30.18.40`

**Description:** `Fix shortcut-editor help behavior, compact image actions and Light-mode label surfaces.`

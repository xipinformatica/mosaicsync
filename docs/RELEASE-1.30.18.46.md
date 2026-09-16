# MosaicSync 1.30.18.46 publication notes

## Mozilla changelog

Completes the shortcut editor’s live **Image style** preview correction. Selecting **Image — fill tile** now updates the editor preview immediately on normal desktop, short laptop and narrow layouts; switching back to **Icon — fit inside tile** immediately restores the responsive contained size. The 1.30.18.45 folder-spacing correction is unchanged. No permissions, CSP, Sync/Recovery, localization, state/profile schema or user-data-format changes.

## Mozilla Notes to Reviewer

MosaicSync 1.30.18.46 is a one-bug corrective release on top of certified 1.30.18.45.

The 1.30.18.45 editor already listened for `shortcutImageStyle` changes and immediately called `updateImagePreview()`, which toggles the preview container’s `cover` class without persisting state. 1.30.18.45 added a stronger cover selector inside the short-laptop breakpoint, but real Firefox testing demonstrated that the normal desktop `@media (min-width: 621px)` rule `#shortcutDialog .image-preview img { width:54px; height:54px; }` could still outrank the base `.image-preview.cover img` rule. The internal mode therefore changed immediately while the artwork remained visibly contained until Save rendered the actual tile.

1.30.18.46 adds one universal `#shortcutDialog .image-preview.cover > img` rule after all responsive dialog image-size rules. Its selector specificity and source order make cover mode authoritative for direct preview images at every viewport size: width/height become 100% with `object-fit: cover`. When the user switches back to fit-inside, the `cover` class is removed and the existing desktop/laptop/narrow responsive contain dimensions apply immediately again. No editor state is written until the existing Save action.

Permanent corrective coverage was first run against untouched 1.30.18.45: the new universal-cascade contract failed as required while the existing live event/class contract already passed. The 1.30.18.46 candidate passes both and the complete project suite remains green.

The 1.30.18.45 folder-popover spacing change is deliberately untouched. No permissions, host permissions, CSP, Sync/Recovery behavior, localization catalog, state/profile schema, browser adapter, telemetry, remote code or user-data-format changes.

## Chrome Web Store release notes

Fixes the shortcut editor so Fit inside / Fill tile image-style changes are visibly previewed immediately on every layout, including normal desktop. No new permissions.

## GitHub release title

`MosaicSync 1.30.18.46`

## GitHub release description

MosaicSync 1.30.18.46 is a one-bug New Tab editor corrective release.

The shortcut editor now previews **Image — fill tile** immediately on normal desktop as well as short laptop and narrow layouts. A universal dialog-specific cover rule now outranks all responsive contain-size rules, while switching back to **Icon — fit inside tile** immediately restores the normal responsive contained size. No Save/Apply is required to see the preview change.

The 1.30.18.45 folder-spacing correction is unchanged. No Sync, Recovery, permissions, CSP, localization, state/profile schema or user-data-format changes.

## GitHub Desktop

**Summary:** `Release MosaicSync 1.30.18.46`

**Description:** `Make Image style preview reliably live on every editor layout.`

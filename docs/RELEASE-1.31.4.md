# MosaicSync 1.31.4 publication notes

## Mozilla changelog

Fixes a localized Settings layout issue in the separate Light/Dark wallpaper controls. Long translations for Background darkness, including German compound words, can no longer overlap the neighbouring control: the translated label now uses a full-width row above its slider and percentage. No wording, permission, Sync/Recovery, persisted-data or feature changes.

## Mozilla Notes to Reviewer

MosaicSync 1.31.4 is a narrow presentation-only correction over 1.31.3. In the separate Light/Dark wallpaper Settings card, `.theme-wallpaper-dim-row` previously placed the translated Background darkness label, range input and percentage in one horizontal grid row. Long localized labels could therefore force one half-card wider and overlap the adjacent half.

1.31.4 changes only that responsive layout: the label spans a dedicated full-width row, the slider and percentage occupy the second row, and the label is allowed to wrap safely. The existing localized `backgroundDarkness` text is reused unchanged across all 33 runtime locales.

There is no feature, setting-semantic, permission, host-permission, CSP, Sync/Recovery, persisted schema, telemetry, remote-code or browser-floor change.

## Chrome Web Store release notes

Fixes long translated Background darkness labels in the separate Light/Dark wallpaper Settings card so they no longer overlap neighbouring controls. Behavior and wording are unchanged.

## GitHub release title

`MosaicSync 1.31.4`

## GitHub release description

MosaicSync 1.31.4 fixes a localization-responsive Settings defect in the separate Light/Dark wallpaper controls. Long Background darkness translations now use a full-width label row above the slider and percentage, preventing overlap in languages such as German and remaining safe across all 33 shipped runtime locales. No Sync, Recovery, permission, persisted-schema or feature changes.

## GitHub Desktop

**Summary:** `Release MosaicSync 1.31.4`

**Description:** `Prevent long localized wallpaper-darkness labels from overlapping the separate Light/Dark controls.`

# MosaicSync 1.26.1 manual QA

## Version consistency
- Settings displays `MosaicSync · 1.26.1` in Firefox and Chrome.
- Manifest/runtime/package version is `1.26.1` in both browsers; Chrome `version_name` is also `1.26.1`.

## Bookmark folder colors
- Open Bookmarks, right-click a folder in the sidebar and in the folder-card area.
- The seven-color/reset palette is visible above the modal dialog, remains within the viewport, accepts a click, and closes on outside pointer-down/Escape/dialog close.
- Reopen Bookmarks and confirm the device-local color remains.

## Light/dark wallpapers
- Open Settings and scroll to Background. The light/dark panel has visible spacing before `More wallpapers` / `Choose image` / `Clear`.
- Enable `Separate light and dark wallpapers`; the controls appear immediately and Settings remains responsive.
- Both Light and Dark selects fill their columns and display the selected option without the old 84 px truncation.
- With both selects on the main-background fallback, toggling the feature does not redraw/preload unrelated wallpapers.
- Choose a wallpaper for the inactive appearance and confirm the current page does not redraw.
- Choose a wallpaper for the active appearance and confirm it appears after preload without freezing Settings.
- Toggle system light/dark appearance and verify the correct preset is used.
- Repeat in Firefox and Chrome.

## Regression
- Existing background preset, custom-image, dimming, theme, Sync and profile-transfer behavior remains intact.
- No Unsplash/third-party wallpaper integration is present.

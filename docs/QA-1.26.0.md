# MosaicSync 1.26.0 manual QA

Run this checklist on both Firefox and Chrome before publishing.

## Version and upgrade
- Settings displays `MosaicSync · 1.26.0`.
- Manifest/runtime/package version is `1.26.0` in both browsers; Chrome `version_name` is also `1.26.0`.
- Upgrade from a 1.25.16.1 profile preserves both Spaces, shortcuts, folders, icons, wallpaper and Sync state.

## Shortcut mouse behavior
- Left-click opens a shortcut normally.
- Middle-click opens a shortcut in a new background tab.
- Right-click opens a shortcut in a new background tab and does not open the editor.
- The three-dot action still opens shortcut editing.
- Repeat inside a folder.

## Spaces
- Settings offers Last used, Personal and Work as the device default when Spaces are enabled.
- A device set to Work opens new MosaicSync tabs in Work without changing another device's default.
- `Alt+Shift+1` switches to Personal and `Alt+Shift+2` switches to Work.
- Shortcuts do nothing while typing in a field or while a dialog is open.
- Disabling multiple Spaces safely falls back from a Work default.

## Light/dark wallpapers
- Enable separate light/dark wallpapers and choose different built-in presets.
- With MosaicSync appearance set to System, changing OS/browser appearance switches the visible preset without a blank flash.
- Explicit Light/Dark appearance selects the matching preset.
- “Current background” falls back to the ordinary selected/uploaded background.
- Settings synchronize to another browser instance; custom image bytes remain device-local as before.

## Frequently Visited
- Enable the feature and verify 3/5/8/10 counts.
- The selected count survives restart and profile export/import.
- Suggestions remain device-local.
- Right-click a suggestion: Open in new tab works; Add shortcut creates a normal MosaicSync shortcut; Add to bookmarks requests bookmark permission only if needed and creates a browser bookmark.
- Context menu closes on outside click, Escape and Space switch.

## Bookmark folder colors
- Open Bookmarks, right-click a folder and choose each palette color.
- Color persists locally after closing/reopening the dialog.
- Reset removes the color.
- Removing a browser bookmark folder allows stale color metadata to be pruned on the next bookmark load.
- Color choices do not alter actual browser bookmark data.

## Localization/accessibility
- Spot-check English, French, Catalan, Japanese, Korean and one long-label EU locale.
- New labels fit Settings at common desktop sizes and at <=620 px.
- Context menus are keyboard-focusable and have localized accessible labels.
- No new user-facing English text appears when a non-English language is selected.

## Regression/security
- Firefox AMO validator still reports no variable dynamic-import warning.
- CSP remains unchanged and strict.
- No new permissions are present.
- No Unsplash/third-party wallpaper networking exists.
- Profile import/export, Sync, cross-Space drag, favicon recovery, Welcome and Donate behavior remain unchanged.

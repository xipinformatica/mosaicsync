# MosaicSync 1.26.7 manual QA

## Release identity
- Confirm Settings displays `MosaicSync · 1.26.7` in Firefox and Chrome.
- Confirm Firefox/Chrome manifests, Chrome `version_name`, internal `VERSION`, build manifest and package filenames all report `1.26.7`.

## Folder child drag-out regression
1. Create a folder containing at least three shortcuts.
2. Open the folder and drag the middle shortcut onto an empty main-grid slot.
3. Confirm the shortcut becomes a normal top-level shortcut at that slot, with its title, URL and icon unchanged.
4. Reopen the source folder and confirm the remaining children are present once, in order, with no duplicates.
5. Create a folder containing exactly two shortcuts and drag one child onto an empty main-grid slot.
6. Confirm the folder dissolves: the remaining child occupies the folder's former slot and the dragged child occupies the chosen empty slot.
7. Reload the New Tab page and confirm both layouts persist.
8. If Sync is enabled, allow Sync to complete and confirm the same structure arrives on another Firefox without resurrection or duplication.

## 1.26.5 appearance regression must remain fixed
- With separate Light/Dark wallpapers enabled, keep Settings open and repeatedly switch Automatic / Dark / Light and change the active day/night wallpaper.
- Confirm Settings remains painted and responsive throughout.
- Confirm the page behind Settings does not change appearance until Settings closes.
- Close Settings and confirm the final selected appearance/wallpaper is applied on the next frame.

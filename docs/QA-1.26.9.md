# MosaicSync 1.26.9 manual QA

## Version / packaging
- Confirm Settings displays `MosaicSync · 1.26.9` in Firefox and Chrome.
- Confirm Firefox/Chrome manifests, Chrome `version_name`, internal `VERSION`, build manifest and package filenames all report `1.26.9`.

## Critical appearance regression
1. Enable **Separate light and dark wallpapers**.
2. Choose obviously different built-in wallpapers for Light and Dark.
3. Leave Settings open and repeatedly switch **Light → Dark → Automatic → Light**.
4. Confirm both the Settings/theme skin **and the matching wallpaper behind Settings change immediately** on every switch.
5. Confirm Settings never blanks, freezes, loses its controls, or requires closing/reopening to repaint.
6. While Settings remains open, change the active Light or Dark wallpaper itself; confirm the new wallpaper appears immediately behind Settings.
7. Close Settings and confirm there is no flash/reversion: the same effective wallpaper remains after the authoritative page background commit.
8. Reopen Settings immediately after closing and repeat the sequence.

## Carry-forward regressions
- Create a folder with 3+ shortcuts and drag one child onto an empty top-level slot; the folder remains and the child moves out intact.
- Create a 2-shortcut folder and drag one child out; the folder dissolves and the remaining shortcut occupies the former folder slot.
- Verify the Light wallpaper card remains visually lighter than the Dark card in both dark and light Settings themes.

# MosaicSync 1.26.12 manual QA

## Version / packaging
- Confirm Settings displays `MosaicSync · 1.26.12` in Firefox and Chrome.
- Confirm Firefox/Chrome manifests, Chrome `version_name`, internal `VERSION`, build manifest and package filenames all report `1.26.12`.

## Favicon hardening regression
1. Open existing shortcuts with ordinary PNG/JPEG/WebP/ICO/SVG favicons and confirm icons still resolve normally.
2. Add a new normal website shortcut with automatic icon learning enabled; confirm favicon discovery/recovery still completes.
3. Confirm failed/unsupported favicon candidates do not prevent the shortcut from opening or the rest of MosaicSync from rendering.

## Local artwork integrity
- Edit an existing shortcut without changing its image and confirm the image remains intact after reload.
- Change a shortcut image and confirm the new image survives reload.
- Export and re-import a profile containing custom images and a custom wallpaper; confirm artwork remains intact.

## Carry-forward critical regressions
- Enable separate Light/Dark wallpapers and repeatedly switch Light → Dark → Automatic while Settings remains open; both theme and matching wallpaper must update immediately and Settings must never blank/freeze.
- Drag a shortcut out of a 3+ item folder and out of a 2-item folder; preserve the 1.26.6 extraction/collapse behavior.
- With Frequently Visited off, dependent controls stay hidden; enabling it reveals them immediately.

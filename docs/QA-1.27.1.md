# MosaicSync 1.27.1 QA / folder-popover positioning checklist

## Release identity / packaging
- [ ] Firefox manifest version = `1.27.1`.
- [ ] Chrome manifest version + `version_name` = `1.27.1`.
- [ ] Shared `VERSION`, Settings label, README, CHANGELOG and build manifest = `1.27.1`.
- [ ] Firefox + Chrome packages reproduce byte-for-byte from the GitHub-ready source.
- [ ] Permissions, host permissions and CSP are unchanged from 1.27.0.

## Folder positioning
- [ ] A one-line folder title opens with only the intended ~3 px visual gap below its rendered text.
- [ ] A genuine two-line folder title opens below the second visible text line, not through/over the title.
- [ ] Text clipped by the two-line label does not move the popover downward.
- [ ] Folder popovers near the bottom edge still flip above the folder when required.
- [ ] Horizontal centering and 12 px viewport edge clamping remain unchanged.
- [ ] Resize/reposition of an already-open folder keeps using the live folder anchor.

## Regression safety
- [ ] Open all in background, built-in icons, shortcut colors and Recently opened behavior are unchanged from 1.27.0.
- [ ] Frequently Visited permission recovery remains unchanged.
- [ ] Favicon resolver/recovery implementation remains unchanged.
- [ ] Full Firefox/Chrome automated suite passes.

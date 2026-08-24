# MosaicSync 1.27.2 QA / production hardening checklist

## Release identity / packaging
- [ ] Firefox manifest version = `1.27.2`.
- [ ] Chrome manifest version + `version_name` = `1.27.2`.
- [ ] Shared `VERSION`, Settings label, README, CHANGELOG and build manifest = `1.27.2`.
- [ ] Firefox + Chrome runtime ZIPs reproduce byte-for-byte from the GitHub-ready source.
- [ ] Permissions, optional permissions, host permissions and CSP are unchanged from 1.27.1.

## Recent-mode canonical layout safety
- [ ] Top-level shortcut drag sources remain disabled in Recent mode.
- [ ] Frequently Visited drag-to-grid cannot write a Recent visual slot into Manual positions.
- [ ] Folder-child extraction-to-grid cannot write a Recent visual slot into Manual positions.
- [ ] Add shortcut from an empty Recent slot selects a canonical free Manual position.
- [ ] Returning to Manual preserves canonical synchronized positions.
- [ ] Manual-mode exact empty-slot drag/drop behavior is unchanged.

## Shortcut editor
- [ ] At ordinary desktop heights (including ~1080p-class viewports) Edit shortcut fits without a visible internal scrollbar.
- [ ] The dialog remains readable/localization-safe; scrolling still works on genuinely short viewports.
- [ ] Icon picker, image controls, color picker and Save/Delete/Cancel remain fully reachable.

## Hardening / rendering
- [ ] Render manifest projects unknown `builtinIcon` / `colorTag` as empty strings.
- [ ] `imageSourceKind: builtin` without a valid built-in icon normalizes to `none`.
- [ ] Deliberate remote built-in icon remains last-writer-wins over local custom artwork.
- [ ] Folder popover one/two-line/clipped/edge-clamp/flip geometry tests pass.
- [ ] Classic first-paint and authoritative Recent ordering remain equivalent.

## Regression safety
- [ ] Folder Open all, built-in icons, shortcut colors and Frequently Visited permission recovery remain unchanged.
- [ ] Favicon resolver/recovery implementation remains unchanged.
- [ ] Full Firefox/Chrome automated suite and benchmark pass.

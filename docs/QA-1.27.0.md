# MosaicSync 1.27.0 QA / first feature-release checklist

## Release identity / packaging
- [ ] Firefox manifest version = `1.27.0`.
- [ ] Chrome manifest version + `version_name` = `1.27.0`.
- [ ] Settings eyebrow/shared `VERSION`/README/CHANGELOG/build manifest all = `1.27.0`.
- [ ] Firefox + Chrome packages build reproducibly from the GitHub-ready source.
- [ ] Permissions, host permissions and CSP match 1.26.17.7.

## Upgrade / data safety
- [ ] Upgrade an existing 1.26.17.7 profile without losing either Space, folders, shortcut order, images, favicons, wallpapers or permission-recovery settings.
- [ ] Old shortcuts without `builtinIcon`/`colorTag` normalize with empty values.
- [ ] Built-in icon/color survive Sync record round-trip and full `.mosaicsync` export/import.
- [ ] Built-in icon selection clears old image/local/sync asset references and does not enter automatic favicon recovery.

## Folder UI
- [ ] Open folders near center/top/bottom/left/right edges: the popover is visually close to the folder tile/label and remains fully usable in the viewport.
- [ ] One-line and two-line folder labels stay visible above the popover.
- [ ] **Open all in background** is compact, localized, disabled for an empty folder and opens only valid HTTP(S) children as inactive tabs.
- [ ] Right-click/middle-click/edit/drag inside folders remain unchanged.

## Built-in icons / shortcut colors
- [ ] All 13 bundled icons render in shortcut editor preview, normal tiles, folder mosaic and folder popover.
- [ ] Switching from favicon/upload/web image to built-in icon visibly clears the old selection; Clear image returns to automatic/fallback behavior.
- [ ] Built-in icon is identical across Firefox/Chrome and requires no network request.
- [ ] All 8 color tags + None are keyboard/screen-reader labelled and render subtly in light/dark themes.
- [ ] Color/icon edits publish through normal Sync conflict handling.

## Recently opened (local-only)
- [ ] Manual order is the default and existing synchronized positions are unchanged.
- [ ] Recent mode sorts top-level shortcuts by local last-opened timestamp; folders score by their most recently opened child.
- [ ] Never-opened/tied items retain manual-order fallback.
- [ ] Primary, middle-click, context-menu/background opening and folder Open all update usage appropriately.
- [ ] Top-level drag reorder is disabled in Recent mode; folder-child drag behavior remains intact.
- [ ] Switching back to Manual immediately restores canonical positions.
- [ ] Order mode/usage metadata do not appear in browser Sync or `.mosaicsync` profiles and remain bounded to 512 IDs.
- [ ] First paint and authoritative render show the same order (no visible reorder jump).
- [ ] With the disposable `localStorage` render manifest unavailable, the `storage.session` fallback still paints built-in icons/color tags (including folder children); hostile icon/color values invalidate the session snapshot, and an older snapshot missing these fields is corrected by authoritative reconciliation.

## Localization / regression
- [ ] All 32 locale catalogs contain exactly the English key set and matching `{count}` placeholders.
- [ ] Check long labels in French/German/Finnish/Dutch/Polish/Czech/Portuguese/Catalan/Italian/Neapolitan.
- [ ] Frequently Visited permission-recovery button/self-heal from 1.26.17.7 remains functional.
- [ ] Favicon quality/resolver pipeline and exact-URL single-flight behavior remain unchanged from 1.26.17.7.
- [ ] Full automated suite + benchmark + syntax/package/secret/leak scans pass.

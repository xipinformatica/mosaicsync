# MosaicSync 1.27.3 QA / optimization and favicon-choice checklist

## Release identity / packaging
- [ ] Firefox manifest version = `1.27.3`.
- [ ] Chrome manifest version + `version_name` = `1.27.3`.
- [ ] Shared `VERSION`, Settings label, README, CHANGELOG and build manifest = `1.27.3`.
- [ ] Firefox + Chrome runtime ZIPs reproduce byte-for-byte from the GitHub-ready source.
- [ ] Permissions, optional permissions, host permissions, schemas and CSP are unchanged from 1.27.2.

## Detected favicon chooser
- [ ] Shortcut editor offers **Choose detected favicon** in all 32 locales.
- [ ] Discovery returns at most eight deduplicated candidates and only validated `data:image/...` pixels to the UI.
- [ ] Discovery uses existing bounded favicon/image/SVG safety primitives and requires the existing website-access permission.
- [ ] Changing the shortcut URL invalidates stale candidate results.
- [ ] Selecting a candidate stores the exact pixels as explicit user artwork, clears built-in-icon state and is not eligible for automatic favicon replacement.
- [ ] **Sync this image** remains opt-in for the selected pixels.
- [ ] `resolveFaviconForUrl()` is byte-for-byte identical to 1.27.2 in both browser backgrounds.

## Folder / Recent refinements
- [ ] Open folder popover follows `.page` scroll and window resize.
- [ ] Repositioning is rAF-throttled/coalesced.
- [ ] Recent-mode `dragover` stops propagation, does not call `preventDefault`, and advertises no-drop.
- [ ] No grid-level drop/dragover handler can translate gap drops into canonical positions.
- [ ] Ordinary same-tab shortcut opens persist recency without scheduling a wasted Recent render.
- [ ] Modifier/background/context-menu opens still update visible Recent order.

## Regression / visual QA
- [ ] Both chronological directions of uploaded artwork vs built-in-icon Sync conflict choose the newer record.
- [ ] Edit shortcut remains scrollbar-free at normal desktop heights and scroll-safe on very short/zoomed viewports.
- [ ] Folder popover remains correctly anchored at 125–200% browser zoom.
- [ ] Full Firefox/Chrome automated suite, syntax checks and benchmark pass.

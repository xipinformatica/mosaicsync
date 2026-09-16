# MosaicSync 1.26.3 manual QA

- Settings displays `MosaicSync · 1.26.3` in Firefox and Chrome; manifests, Chrome `version_name`, internal `VERSION`, build manifest and package names all match.
- Open Settings and toggle **Separate light and dark wallpapers** on/off repeatedly. The switch and panel must repaint immediately; Settings must remain scrollable/clickable and must never turn into a blank/frozen panel.
- With separate wallpapers enabled, verify Light and Dark are visual cards with wallpaper previews (not native selects). Click each card, choose a preset from the gallery, close/reopen Settings, and confirm the selection persists.
- If the currently active appearance is changed, only that wallpaper should visibly update. Choosing the inactive appearance must not redraw the current wallpaper.
- Exercise rapid Light/Dark choices and another New Tab editing an unrelated shortcut/settings field; both edits must survive.
- Open Bookmarks, right-click several folders, apply red/violet/amber/green colors and verify the whole sidebar row and folder card fill with the chosen color while text remains readable. Close/reopen Bookmarks and verify persistence; Reset returns the default styling.
- In Settings Privacy/project links, confirm order: Website · Privacy · MPL 2.0 · GitHub · Support. GitHub opens `https://github.com/xipinformatica/mosaicsync` in a new tab. Verify the same GitHub link in Welcome.
- Switch through representative long/localized UI languages and verify the wallpaper cards remain readable without truncated native-select labels.
- Confirm Firefox/Chrome permissions are unchanged and no Unsplash/third-party wallpaper integration is present.

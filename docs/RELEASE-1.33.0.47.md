# MosaicSync 1.33.0.47 publication notes

## Firefox Add-ons / Chrome Web Store release notes

Polished six built-in shortcut icons so they look clearer at small sizes. Appearance choices and wallpaper-darkness sliders now match the rest of MosaicSync, with clearer Settings organization and more visible setup messages. No new permissions or changes to existing shortcuts.

## Mozilla Notes to Reviewer

Neofix 3 is a strictly visual/UX update over 1.33.0.46. Six hard-coded SVG shortcut glyph definitions in `src/shared/newtab/builtin-icons.js` are refined (game, finance, code, shopping, music, news); seven other icons are unchanged. Appearance buttons use fixed bundled SVGs rather than platform-dependent typographic glyphs; wallpaper darkness sliders follow the existing accent variable. Background and device-local identity Settings sections appear ahead of backup controls. The Welcome status region now precedes donation and uses readable error/warning colors. IDs, localized labels, input values, event handlers and storage semantics are preserved. No new remote assets, telemetry, permissions, CSP, persisted schema or Sync/Recovery protocol changes.

**Verification:** full suite and clean-room results, screenshots, and browser CI runs must be supplied from actual completed checks. The four-target browser workflow in GitHub Actions is required to be green before release publication; a locally successful Node test suite does not replace this gate.

## GitHub release title

`MosaicSync 1.33.0.47`

## GitHub release description

Neofix 3 improves the visual finish of MosaicSync: six built-in icons have clearer geometry, the Light/System/Dark controls use aligned vector symbols, wallpaper darkness sliders match the theme accent, Settings groups are more intuitive and Welcome setup messages are closer to the setup controls. No new permissions or behavior changes to Sync/Recovery. The packaged Firefox and Chrome extensions share the same hard-coded glyph set.

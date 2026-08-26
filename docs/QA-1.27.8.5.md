> **INTERNAL CANDIDATE — not a public MosaicSync release.** Superseded by public 1.27.8.9.

# MosaicSync 1.27.8.5 QA / first-frame visual-integrity checklist

## Release identity

- [x] Firefox manifest version = `1.27.8.5`.
- [x] Chrome manifest version + `version_name` = `1.27.8.5`.
- [x] Shared `VERSION`, Settings version label, README, CHANGELOG, build manifest and package-size baseline = `1.27.8.5`.

## CSS ownership regression

- [x] `newtab-critical.css` remains the permanent owner of `.settings-button` base/hover/focus/theme/ SVG styling.
- [x] `newtab-secondary.css` contains no `.settings-button` selector.
- [x] `newtab-secondary.css` contains no `.tile img`, `.folder-mosaic-cell img`, `.tile > img.artwork-layer` or `.folder-mosaic-cell > img.artwork-layer` selectors.
- [x] Secondary folder-popover artwork keeps `.folder-item-tile img` and `.folder-item-tile > img.artwork-layer` behavior.
- [ ] Real-hardware post-release testing showed the bright rounded startup artifact could still occur; 1.27.8.6 carries the follow-up native-control reset.
- [x] Settings/Bookmarks buttons, Spaces, shortcut geometry, labels, folder mosaics and Frequently Visited do not move/restyle when secondary CSS loads.

## Runtime stylesheet contract

- [x] `newtab.html` links `newtab-critical.css` and does not link vestigial `newtab.css`.
- [x] `secondary-style-bootstrap.js` loads only `newtab-secondary.css`.
- [x] Strict CSP remains unchanged; no inline handler or remote stylesheet was introduced.

## Regression baseline

- [x] Frequently Visited Show/Count Sync behavior from 1.27.8.4 is unchanged.
- [x] Separate Light/Dark wallpaper Settings preview isolation remains intact.
- [x] Chunked/generation-guarded folder artwork hydration remains intact.
- [x] Cold bootstrap DOM adoption and pre-module local-storage acceleration remain intact.
- [x] Shortcut hover remains paint-only with no layout shift.
- [x] PCP/long-task instrumentation remains local, ephemeral and bounded.
- [x] Firefox/Chrome New Tab source parity remains intentional.
- [x] Full automated test suite passes.
- [x] Benchmark passes.
- [x] Firefox/Chrome packages rebuilt from clean extracted GitHub-ready source are byte-for-byte identical to release packages.

## Final validation

- Full working-tree regression suite: **459 / 459 passing**.
- Clean-extracted GitHub-ready source regression suite: **459 / 459 passing**.
- Clean-extracted benchmark: passed.
- Firefox release ZIP rebuilt from clean source: byte-for-byte identical.
- Chrome release ZIP rebuilt from clean source: byte-for-byte identical.


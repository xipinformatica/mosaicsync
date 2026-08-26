# MosaicSync 1.27.8.6 QA / Firefox startup-pill native-control checklist

## Release identity

- [x] Firefox manifest version = `1.27.8.6`.
- [x] Chrome manifest version + `version_name` = `1.27.8.6`.
- [x] Shared `VERSION`, Settings version label, README, CHANGELOG, build manifest and package-size baseline = `1.27.8.6`.

## Native-control hardening

- [x] `.settings-button` is a real `<button>` and declares `appearance: none` in blocking `newtab-critical.css`.
- [x] `.bookmarks-button` is a real `<button>` and declares `appearance: none` in blocking `newtab-critical.css`.
- [x] `.space-button` is a real `<button>` and declares `appearance: none` in blocking `newtab-critical.css`.
- [x] `.brand-button` remains a `<span>` and is not treated as a native button.
- [x] None of those launcher selectors is patched by `newtab-secondary.css`.
- [x] Firefox and Chrome carry the same launcher reset.
- [ ] Real-hardware confirmation that the previously recorded Firefox startup pill is gone. This cannot be proven by source/unit tests and should be checked on the machine where the artifact is reproducible.

## Preserved 1.27.8.5 / 1.27.8.4 behavior

- [x] Settings-button/artwork CSS ownership split remains intact.
- [x] Vestigial `newtab.css` remains fenced out of runtime loading.
- [x] Frequently Visited Show/Count Sync behavior is unchanged.
- [x] Separate Light/Dark wallpaper Settings preview isolation is unchanged.
- [x] Chunked/generation-guarded folder artwork hydration is unchanged.
- [x] Cold bootstrap DOM adoption and pre-module local-storage acceleration are unchanged.
- [x] Shortcut hover behavior is unchanged.
- [x] PCP/long-task instrumentation remains local, ephemeral and bounded.
- [x] Strict CSP and packaged-only code/style loading remain unchanged.

## Final validation

- Full working-tree regression suite: **463 / 463 passing**.
- Clean-extracted GitHub-ready source regression suite: **463 / 463 passing**.
- Clean-extracted benchmark: passed.
- Firefox/Chrome packages rebuilt from clean extracted source: byte-for-byte identical to the release packages.

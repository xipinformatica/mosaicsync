# MosaicSync 1.27.9 QA / release-candidate checklist

## Scope freeze
- [x] Zero new features, buttons, settings, UI modes or integrations.
- [x] Scope limited to Settings draft/baseline correctness, favicon policy consistency, canonical New Tab source, unused runtime CSS/package sanitation, tests/localization/docs hygiene.
- [x] No permission, CSP, state/Sync/profile schema or complete-profile recovery redesign.

## Two-sided Snow Leopard regressions
- [x] Settings negative: an external Columns update cannot be overwritten by changing only Rows from a stale open panel.
- [x] Settings positive: untouched controls visibly refresh to the incoming value while the user's actual edited field remains editable/persistable.
- [x] Debounce negative: external state cannot erase an unpersisted Tile Size edit before the debounce writes.
- [x] Debounce positive: the user's pending Tile Size persists successfully after external adoption.
- [x] Background negative: changing only dim after an external wallpaper update cannot restore stale wallpaper fields.
- [x] Background positive: external wallpaper remains authoritative while the local dim edit persists.
- [x] Favicon negative: huge low-suitability manifest art cannot terminate discovery before a better conventional favicon is considered.
- [x] Favicon positive: an excellent square preferred favicon still permits bounded early termination; tiny legacy artwork can still upgrade.
- [x] Manual/automatic favicon ordering uses one deterministic preference policy.
- [x] Runtime CSS negative: `newtab/newtab.css` is absent from both browser packages and cannot be dynamically loaded.
- [x] Runtime CSS positive: critical + on-demand secondary CSS remain present and the mascot/launcher behavior is preserved.
- [x] Reduced-motion suppression remains present in critical CSS.

## Existing 1.27.8.9 preservation
- [x] No automatic secondary stylesheet insertion at New Tab startup.
- [x] Logo hover remains secondary-CSS-free and hello mascot keyframes remain critical-owned.
- [x] Light appearance establishes effective theme during first-paint bootstrap.
- [x] Settings-open launcher/root paint and render deferral remains centralized.
- [x] Drag/drop Move/Create-folder text remains localized at use time.
- [x] Complete Personal+Work Sync recovery, previous-generation fallback, waiting-local merge and torn-Work repair remain unchanged.

## Source/build sanitation
- [x] `src/shared/newtab/newtab.js`, `newtab-critical.css` and `newtab-secondary.css` are the canonical New Tab runtime sources.
- [x] Firefox and Chrome build outputs for those three files are byte-identical.
- [x] Browser-specific background workers remain separate; Chrome-specific native favicon behavior is preserved.
- [x] Historical monolithic `src/shared/newtab/newtab.css` remains source-only and is excluded from runtime packages.
- [x] GitHub-ready archive includes the reviewed/generated `dist/` trees required by the repository contract, while excluding `.git`, runtime ZIP artifacts, `__pycache__`, `.pyc`, local dependency/cache directories and other generated junk.

## Localization
- [x] 32/32 UI locale catalogs have exact English key parity.
- [x] No empty/null locale values.
- [x] Placeholder sets match English for every key.
- [x] English source values have no reverse-map collisions.
- [x] 32/32 Firefox and Chrome manifest locale catalogs are present/valid.
- [x] Hardcoded/runtime-created UI localization tests pass.

## Security / compatibility
- [x] No new permission or host permission.
- [x] CSP/no-remote-code policy unchanged.
- [x] State schema remains 18; Sync record schema remains 10; local Sync meta schema remains 12.
- [x] HTTP(S)-only navigation unchanged.
- [x] Profile/import prototype-pollution/checksum/size hardening unchanged.
- [x] Image/SVG remote-decode safety unchanged.
- [x] Storage/cache bounds and Sync conflict/tombstone semantics unchanged.

## Automated/package gates
- [x] Full automated suite passes from final versioned working source (503/503).
- [x] Performance benchmark passes.
- [x] Package-size report reviewed and conscious 1.27.9 baseline recorded.
- [x] Firefox and Chrome deterministic runtime ZIPs generated and inspected directly.
- [x] GitHub-ready source archive generated and inspected directly.
- [x] Fresh extraction reruns full tests (503/503), benchmark and size successfully.
- [x] Fresh extraction rebuilds byte-for-byte identical Firefox/Chrome ZIPs, GitHub-ready source and build metadata.
- [x] SHA-256 checksums recorded.

## Real-hardware acceptance still required before "final/public"
- [ ] Firefox Windows: several fresh New Tabs show no white pill, Dark/Light flash or layout jump.
- [ ] Firefox Windows: first logo hover shows the hello mascot without a pill.
- [ ] Settings: Separate Light/Dark Wallpapers and Frequently Visited remain usable while open.
- [ ] Cross-tab Settings: leave Settings open in one New Tab, change a grid/background setting in another, then edit a different field; the newer external value must remain.
- [ ] Catalan: drag/drop choice remains fully localized.
- [ ] Favicon: google.com/general previously poor-icon case resolves to visually appropriate artwork.
- [ ] Firefox Linux Mint 22.3 Cinnamon/Xorg: Separate Light/Dark Wallpapers leaves Settings usable.
- [ ] Firefox Linux Mint 22.3 Cinnamon/Xorg fresh permission state: enabling Frequently Visited leaves Settings usable.

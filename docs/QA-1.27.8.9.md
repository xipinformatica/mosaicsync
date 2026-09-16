# MosaicSync 1.27.8.9 QA / release-candidate checklist

## Scope freeze
- [x] Scope limited to the 1.27.8.x release bundle plus the six corrective items: mascot restoration, Light first paint, Settings-open lifecycle, Frequently Visited/Separate Wallpaper stability through that lifecycle, drag/drop localization, and general favicon suitability.
- [x] No opportunistic Sync-schema, permission, CSP, profile-format or bootstrap-DOM changes.

## Release identity
- [x] Firefox manifest version = `1.27.8.9`.
- [x] Chrome manifest version + `version_name` = `1.27.8.9`.
- [x] Shared `VERSION`, visible Settings label, README, CHANGELOG, build metadata, package-size baseline and package filenames = `1.27.8.9`.
- [x] Public changelog sequence is `1.27.8.9` → `1.27.7`; `1.27.8` through `1.27.8.8` are internal/unpublished candidates.
- [x] State schema remains 18; Sync record schema remains 10; local Sync bookkeeping meta schema remains 12.

## Two-sided corrective regressions
- [x] Mascot negative: logo hover never requests secondary CSS.
- [x] Mascot positive: both critical keyframes exist and hover still adds `brand-hello-active`.
- [x] Light first-paint negative: bootstrap no longer leaves Light mode on Dark launcher variables.
- [x] Light first-paint positive: bootstrap synchronously establishes `data-effective-theme="light"` from the same disposable hint used for the page color.
- [x] Settings negative: asynchronous/external state reconciliation defers full launcher/root commits and grid rebuilds while Settings is open.
- [x] Settings positive: direct Settings controls still preview live; isolated wallpaper feedback remains available; deferred external work coalesces into one settings commit + one render after close.
- [x] Drag-choice negative: dynamic opening cannot fall back to stale literal English for Move/Create-folder text.
- [x] Drag-choice positive: Catalan and all 32 catalogs provide the four required keys.
- [x] Favicon negative: a huge manifest asset cannot win solely because it is larger than a crisp conventional favicon.
- [x] Favicon positive: genuinely tiny legacy favicon artwork can still be upgraded by suitable high-resolution artwork; square geometry remains preferred.

## Complete-profile Sync preservation
- [x] Trusted snapshots retain complete Personal + Work behavior and previous-generation fallback.
- [x] Fresh bootstrap cannot finalize from Personal alone.
- [x] Waiting local edits merge safely when complete profile data arrives.
- [x] Torn Work compatibility data can be repaired only from trusted complete profile state.
- [x] No old blanket local-write suppression was restored.

## New Tab / white-pill preservation
- [x] No automatic `newtab-secondary.css` insertion at startup.
- [x] Logo hover does not activate deferred CSS.
- [x] Launcher-affecting form/color-tag/edit-chip/brand rules remain critical-owned.
- [x] Website Access prompt remains critical-styled.
- [x] Bootstrap/adoption DOM contract is unchanged.

## Localization
- [x] All 32 UI locale source catalogs present.
- [x] Identical key coverage to English; no empty values; placeholders match.
- [x] All 32 manifest locale catalogs present for Firefox and Chrome.
- [x] Platform-branding and hardcoded-English regression checks pass.
- [x] No new translation key was introduced for this corrective build.

## Security / architecture
- [x] No new permission or host permission.
- [x] CSP and no-remote-code policy unchanged.
- [x] HTTP(S)-only shortcut navigation unchanged.
- [x] Profile/import hardening unchanged.
- [x] Image/SVG safety and remote decode bounds unchanged.
- [x] Cache/storage bounds unchanged.
- [x] Sync conflict/tombstone semantics unchanged.
- [x] Firefox/Chrome parity retained.

## Automated/package gates
- [x] Full automated suite passes from working source.
- [x] Performance benchmark passes.
- [x] Package-size guards pass.
- [x] Finished Firefox and Chrome ZIPs inspected directly.
- [x] GitHub-ready clean extraction reruns full suite successfully.
- [x] Clean extraction rebuild reproduces Firefox/Chrome ZIPs byte-for-byte.
- [x] SHA-256 checksums recorded.

## Real-hardware acceptance still required before "final/public"
- [ ] Firefox Windows: startup has no white pill.
- [ ] Firefox Windows: first logo hover shows mascot and no pill.
- [ ] Firefox Windows: first opening of Settings/secondary UI has no pill.
- [ ] Firefox Light mode: fresh New Tab has no Dark-tile flash.
- [ ] Firefox Linux Mint 22.3 Cinnamon/Xorg: Separate Light/Dark Wallpapers toggle leaves Settings usable.
- [ ] Firefox Linux Mint 22.3 Cinnamon/Xorg fresh-state path: enabling Frequently Visited leaves Settings usable.
- [ ] Catalan: drag/drop choice shows localized Move/Create-folder text.
- [ ] google.com/general favicon case: learned icon is visually appropriate.

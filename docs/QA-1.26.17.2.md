# MosaicSync 1.26.17.2 QA contract

1. **One version identity:** Firefox manifest, Chrome manifest and `version_name`, shared `VERSION`, Settings labels, build manifest, README/current documentation, release notes and package filenames must all report exactly `1.26.17.2`. No alternate internal/display/technical version is permitted.
2. **Public history:** `CHANGELOG.md` must go directly from 1.26.17.2 to the last published 1.26.12. Unpublished development candidates must not appear as standalone public release headings.
3. **Automatic favicon before visit:** with Automatic site icons enabled and Website Access granted, create a never-before-used HTTP/HTTPS shortcut in Firefox and Chrome. The favicon must appear automatically without visiting the site. Repeat in the inactive Space.
4. **Chrome placeholder fail-closed:** with Website Access absent, Chrome generic/default favicon artwork must never become durable MosaicSync artwork. Sentinel failure remains retryable and native requests stay bounded.
5. **Frequently Visited cross-Space:** a site saved anywhere in Personal/Work, including inside a folder, must not be suggested in Frequently Visited in the other Space.
6. **Firefox/Chrome Sync self-heal:** once changed extension-sync data is locally visible, a missed `storage.onChanged` event must recover through the semantic watchdog without requiring browser restart.
7. **Concurrency/Spaces:** delete, edit URL, rename, upload custom artwork, toggle auto-icons, and move Personal↔Work while favicon recovery is in flight. Stale work must never resurrect or overwrite newer state.
8. **Profile boundary:** automatically learned/browser-native favicon pixels stay out of ordinary browser Sync but remain intentionally included in an explicit complete `.mosaicsync` profile export.
9. **Localization/security:** all 32 runtime catalogs and WebExtension locale catalogs remain complete; no new raw user-visible English, required permissions, remote code, telemetry or CSP relaxation.
10. Run the production-module favicon/Sync harnesses plus `npm test`, `npm run bench`, JavaScript/Python syntax checks, deterministic-build checks, ZIP integrity, secret scans and manifest-permission comparison before packaging.

## Light/Dark wallpaper darkness regression (1.26.17.2)

- Start from an older profile with **Separate light and dark wallpapers** enabled, clearly different Light/Dark presets, and a non-zero shared **Background darkness** while Dark is active. Upgrade to 1.26.17.2. The visible Dark wallpaper must keep exactly the previous darkness and the Light wallpaper must initialize to 0%.
- Repeat the migration while Light is the effective appearance: Light inherits the old darkness; Dark initializes to 0%.
- With separate wallpapers enabled, Settings must show one independent **Background darkness** slider under Light and another under Dark; the old single global darkness slider must be hidden.
- Set Light to 5% and Dark to 40%. Switch Light ↔ Dark manually and through Automatic/system appearance. The wallpaper and its matching darkness must change together with no carry-over from the previous appearance.
- Keep Settings open while switching Automatic/Light/Dark and while changing either darkness slider. Settings must remain painted/clickable; the existing isolated wallpaper preview architecture must not regress.
- Set different Light/Dark darkness values, close/reopen Settings, open another New Tab, and verify both persist.
- With Sync enabled, verify the two darkness values arrive on another MosaicSync installation. An older synchronized settings record that lacks the two fields must not erase already-migrated values on 1.26.17.2.
- Export a complete `.mosaicsync` profile and import it in the other browser edition; both per-appearance darkness values must survive.
- Disable **Separate light and dark wallpapers**. The original single `backgroundDim` control/behavior must remain unchanged for the normal fallback wallpaper.
- Verify the synchronous first frame after a theme switch/reopen already uses the effective appearance darkness; there must be no flash using the opposite wallpaper's darkness.

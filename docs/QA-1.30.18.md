# MosaicSync 1.30.18 QA / release-candidate checklist

## Automated gates

- [ ] Full Node regression suite passes from the final source.
- [ ] Benchmark and package-size guards pass.
- [ ] Firefox/Chrome/source package versions are exactly `1.30.18`.
- [ ] Clean GitHub-ready extraction reproduces the same public packages byte-for-byte.
- [ ] Release-contract scanner accepts both built runtime trees and both public browser ZIPs.

## 1.30.18 regressions

- [x] Session render snapshots force Personal when Multiple Spaces is disabled even if incoming activeSpaceId is Work.
- [x] External Settings-only/background-only state changes can avoid a full Manual-grid rebuild when exact render inputs are unchanged.
- [x] Title, URL, position, artwork, folder first-four artwork, auto-icon and web-access-prompt changes remain render-invalidating.
- [x] Settings-open, open-folder, Recent-order and Sync-waiting paths remain fail-closed on the full render path.
- [x] Inactive-Space wallpaper preload is skipped while Multiple Spaces is disabled and resumes when enabled.
- [x] Profile import remains whole-profile authoritative; current Sync state is not a partial-merge source.
- [x] Mixed-version Settings protection includes Work-space coverage.

## Preserved release contract

- [x] Firefox production manifest contains no `browser_specific_settings.gecko_android`.
- [x] Chrome declares `minimum_chrome_version: 104`.
- [x] Manifest/permission/host/data-category/external-endpoint allow-list checks remain active.

## Manual acceptance

- [ ] Disable Multiple Spaces while Work was previously active, close all MosaicSync tabs, then open a New Tab and confirm Personal is shown with no Work session-cache flash.
- [ ] With two devices, change only wallpaper/theme on one device and confirm the other updates without launcher breakage.
- [ ] Confirm folder edits, shortcut renames/URL changes and Recent mode still update immediately after remote/local storage changes.
- [ ] Confirm Firefox Home/New Tab and Chrome New Tab behavior remain unchanged.

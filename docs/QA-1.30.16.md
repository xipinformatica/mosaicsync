# MosaicSync 1.30.16 QA / release-candidate checklist

## Automated gates

- [ ] Full Node regression suite passes from the final source.
- [ ] Benchmark and package-size guards pass.
- [ ] Firefox/Chrome/source package versions are exactly `1.30.16`.
- [ ] Clean GitHub-ready extraction reproduces the same public packages byte-for-byte.
- [ ] Release-contract scanner accepts both built runtime trees and both public browser ZIPs.

## Browser/store contract regressions

- [x] Firefox production manifest contains no `browser_specific_settings.gecko_android`.
- [x] Firefox `browser_specific_settings` contains only the approved desktop `gecko` block.
- [x] Firefox required permissions remain exactly `storage` + `alarms`; optional permissions remain `topSites` + `bookmarks`; optional host access remains HTTP/HTTPS only.
- [x] Firefox's `browsingActivity` + `technicalAndInteraction` categories remain explicitly tied to documented browser-native-Sync rationales and not developer telemetry.
- [x] Firefox intentionally keeps both New Tab and Home overrides.
- [x] Chrome intentionally keeps New Tab only, has no Firefox-only manifest block, and declares `minimum_chrome_version: 104`.
- [x] Chrome required permissions remain exactly `storage` + `alarms` + `favicon`.
- [x] Final-package scanner rejects development identity, localhost endpoints and unapproved fixed external hosts.
- [x] Current localization-policy references say 33 languages.

## Manual store acceptance

- [ ] After AMO publishes 1.30.16, confirm the listing no longer shows **Available on Firefox for Android** / Android QR code.
- [ ] Confirm AMO permission/data wording matches PRIVACY.md: shortcut URLs/settings may use Firefox Sync; browsing-history/Top Sites data remains local; MosaicSync sends no developer telemetry.
- [ ] Confirm Firefox Home and New Tab still both open MosaicSync.
- [ ] Confirm Chrome New Tab still opens MosaicSync and normal Chrome Home behavior is unchanged.
- [ ] Confirm Chrome Web Store accepts `minimum_chrome_version: 104` and listing behavior is otherwise unchanged.

# MosaicSync 1.24.14m1 QA

## Scope

Localization/UI-only follow-up to 1.24.14m. No Sync/storage/profile/favicons/permissions/CSP architecture change.

## Localization

- 32 UI catalogs total.
- 354 keys per catalog with exact English key parity.
- Placeholder names/counts match English.
- Added Bulgarian, Croatian, Estonian, Greek, Hungarian, Latvian, Lithuanian, Maltese, Romanian, Slovak and Slovenian.
- All 24 official EU languages are represented.
- Firefox and Chrome store locale metadata exists for all 32 UI languages.
- Browser locale autodetection recognizes all eleven new locales.
- Chrome platform adaptation is checked for Firefox/Mozilla leakage and known malformed browser-name inflections in the new catalogs.

## UI regression fixes

- Mascot greeting bubble is content-sized with a 52 px minimum; long Japanese/Korean greetings remain inside the bubble.
- The SVG bubble background stretches with the localized text using `preserveAspectRatio="none"`.
- Portaled help tooltips are hidden synchronously before the active fixed-position class is removed/restored. This prevents Firefox from painting the old in-panel tooltip for one fade frame on pointer leave.

## Automated verification

- `npm test` must pass 136/136 tests.
- Both manifests must use technical version `1.24.14.13`; Chrome must expose `version_name: 1.24.14m1`.
- Runtime ZIPs and Source+Tests ZIP must be rebuilt twice and byte-identical.

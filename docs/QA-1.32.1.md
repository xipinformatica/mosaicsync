# MosaicSync 1.32.1 QA / release-candidate checklist

## Scope

Scoped post-freeze product feature from 1.32.0.10: optional Custom Branding with one device-local raster logo and one exact text line. MosaicSync controls placement/presentation and preserves the existing built-in mascot/Hello effect.

## Permanent 1.32.1 regressions

- `tests/custom-branding-1321.test.mjs` — 10 focused ownership, validation, profile-round-trip, backward-compatibility, first-paint and source-authority cases.
- Existing profile/security/localization/startup/New Tab/Sync/Recovery/browser/core/release suites remain permanent compatibility gates.

## Ownership / privacy contract

- Branding is a dedicated `storage.local` domain (`mosaicsync.custom-branding.v1`).
- Branding never enters Normal Sync, Sync clocks, pending cumulative/cross-Space journals or Recovery generations.
- Custom text is preserved verbatim; MosaicSync UI labels remain localized independently.
- The logo is actual bounded raster image data, never an external filesystem path.
- No new permissions, telemetry, developer cloud service or browser floor.

## Export / import contract

- Current profile format is v3 and checksums the branding field with the rest of the package.
- Enabled/disabled state, exact text and stored logo data round-trip through export/import.
- Disabled branding may retain its configured logo/text and that state round-trips.
- v1/v2 profiles remain importable and produce default/no custom branding.
- Checksum-valid malformed/unsupported v3 branding is rejected as damaged profile data.
- Settings import rolls branding back if authoritative local profile persistence fails.
- Welcome keeps imported branding provisional until source selection chooses that candidate; choosing the synchronized copy leaves local branding untouched.

## Performance / presentation contract

- Custom Branding selectors remain absent from `newtab-critical.css`.
- Branding is read only from post-paint maintenance after `interactionReady`.
- A visible branding surface is unhidden only after the secondary stylesheet is available, preventing an unstyled startup flash.
- The reviewed critical CSS byte ceiling remains unchanged; only the lazy/secondary UI budget is consciously expanded.

## Final certification

- Full regression suite: **1112 / 1112 passing**.
- Startup / first-paint group: **168 / 168 passing**.
- New Tab group: **353 / 353 passing**.
- Sync group: **238 / 238 passing**.
- Recovery group: **137 / 137 passing**.
- Security group: **123 / 123 passing**.
- Browser/parity group: **178 / 178 passing**.
- Core group: **125 / 125 passing**.
- Release group: **223 / 223 passing**.
- Dedicated Custom Branding regressions: **10 / 10 passing**.
- Runtime reachability / benchmark / package contract: required by final certification.
- Browser probe: Chromium is present, but no matching ChromeDriver; Firefox/GeckoDriver are absent, so real-browser smoke is unavailable in this environment.
- Measured deflated runtime payload: Firefox **699,749 bytes**; Chrome **714,265 bytes**.
- Final artifact SHA-256 hashes are recorded by deterministic mechanical certification after clean-room reproduction.

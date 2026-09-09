# MosaicSync 1.32.1.1 QA / release-candidate checklist

## Scope

Narrow corrective release over 1.32.1. Custom Branding replaces the existing upper-left MosaicSync logo/name. It never creates a second centered launcher surface and never repositions the Spaces selector.

## Permanent corrective regressions

- `tests/custom-branding-corrective-13211.test.mjs` — five placement/replacement/Hello/geometry/aspect-ratio regressions.
- `tests/custom-branding-1321.test.mjs` — the original ten branding storage, validation, profile and ownership regressions remain active with the corrected identity-slot presentation contract.

Dedicated Custom Branding coverage: **15/15 passing**.

## Presentation contract

- Custom logo replaces the built-in MosaicSync mark when branding is enabled.
- Custom text replaces the built-in `MosaicSync` name when branding is enabled.
- The old `customBrandingDisplay` centered surface no longer exists.
- The existing `.brand` upper-left geometry remains the sole identity location.
- The existing centered `.space-switcher` geometry is unchanged.
- The Hello mascot/effect remains inside `brandHelloButton` and keeps the same hover trigger.
- Horizontal logos are bounded with `object-fit: contain` and without forced aspect-ratio distortion.
- Disabling branding restores the built-in MosaicSync mark/name.

## Architecture / privacy contract

- Branding remains the same dedicated device-local `storage.local` domain.
- Profile format remains v3; existing v1/v2 compatibility is unchanged.
- Branding remains absent from browser Sync, Sync clocks, pending journals and Recovery.
- No new permissions, CSP capabilities, telemetry, remote services or browser floors.
- Custom Branding remains post-paint/secondary-CSS work; the critical first-paint stylesheet is unchanged.

## Automated verification

The complete set of 153 unique `tests/*.test.mjs` files was executed in four deterministic, non-overlapping batches because the execution wrapper cannot hold the monolithic runner for the complete duration:

- batch 1: **257/257**
- batch 2: **349/349**
- batch 3: **233/233**
- batch 4: **278/278**
- complete unique suite: **1117/1117**

Focused groups:

- Startup: **168/168**
- New Tab: **358/358**
- Sync: **238/238**
- Recovery: **137/137**
- Security: **128/128**
- Browser/parity contracts: **178/178**
- Core: **130/130**
- Release: **228/228**

Runtime reachability: **clean** — zero unreachable shared modules, zero unused named imports and zero unreferenced private functions.

Release-contract validation: **pass** for the Firefox and Chrome build trees and packaged ZIPs.

## Package size

Final deterministic release package payloads after the 1.32.1.1 correction:

- Firefox: **2,364,724 raw bytes**, **700,337 compressed payload bytes**
- Chrome: **2,386,366 raw bytes**, **714,845 compressed payload bytes**

The critical first-paint stylesheet is unchanged by this correction.

## Certification environment

Certification level is **MECHANICAL_ONLY** in this environment. Chromium is present, but ChromeDriver is not; Firefox and GeckoDriver are not available. Therefore a real automated Firefox/Chromium browser smoke pair cannot truthfully be claimed here.

The canonical performance benchmark runner also exceeds this execution environment's time ceiling before completing all cases. It emitted normal measurements through its startup-normalization cases, but this release does **not** claim a completed canonical benchmark pass. The correction is presentation-only and leaves the critical first-paint stylesheet and Sync/Recovery architecture unchanged.

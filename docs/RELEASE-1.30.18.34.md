# MosaicSync 1.30.18.34 publication notes

## Mozilla Add-ons changelog

Completes Maintenance Infrastructure M2 with one fail-closed end-to-end release-certification command. Product behavior, permissions and data formats are unchanged.

## Notes to Reviewer

MosaicSync 1.30.18.34 begins from the frozen 1.30.18.32 application architecture and the validated 1.30.18.33 M1 runtime. It does not reopen production architecture.

M2 adds `tools/certify-release.mjs` and makes `npm run certify` the canonical full-release certification entry point. It composes the existing deterministic build, full regression suite, reachability audit, real Firefox + Chromium smoke, performance benchmark, runtime-size report, generated release contracts, deterministic packaging, packaged release contracts, clean-source re-extraction/rebuild/retest/repackage, and byte-for-byte artifact verification.

A separate `npm run certify:mechanical` is provided for restricted environments that cannot launch the required real browsers. That mode explicitly records `MECHANICAL_ONLY` and `fullyCertified:false`; it cannot silently satisfy or skip the browser-smoke requirement of the official command.

Before the .34 identity bump, the M2 tooling was applied to the 1.30.18.33 source and regenerated Firefox and Chromium release ZIPs matched the validated .33 hashes byte-for-byte.

The only extension-runtime source edits are the unified 1.30.18.34 release identity. Startup/first-paint, New Tab algorithms, Settings, Frequently Visited, favicon/artwork policy, storage, Sync, Recovery, permissions, CSP, schemas, locales and browser adapters are unchanged.

## Chrome Web Store release notes

Maintenance tooling only: adds one fail-closed end-to-end certification command around the frozen runtime. No feature, permission or synchronized-data-format change.

## GitHub release title

`MosaicSync 1.30.18.34`

## GitHub release description

MosaicSync 1.30.18.34 completes Maintenance Infrastructure M2 by making `npm run certify` the single canonical full-release certification command.

The command composes MosaicSync's existing build, full tests, reachability, real-browser smoke, benchmark, release-contract, deterministic packaging and clean-room reproducibility gates. Any failed gate or artifact mismatch fails certification. A clearly separate mechanical-only mode exists for restricted environments and cannot claim full certification.

The extension runtime remains frozen apart from release identity.

## GitHub Desktop

**Summary:** `Release MosaicSync 1.30.18.34`

**Description:** Complete Maintenance Infrastructure M2 with one fail-closed end-to-end release-certification command around the frozen runtime.

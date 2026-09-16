# MosaicSync 1.30.18.6 QA / release-candidate checklist

## Release identity / packaging

- [x] Firefox manifest/runtime/Settings version is exactly `1.30.18.6`.
- [x] Chrome manifest/version_name/runtime/Settings version is exactly `1.30.18.6`.
- [x] GitHub-ready source and both browser ZIPs are reproducible from a clean extraction.
- [x] Firefox and Chrome browser ZIPs pass the production release-contract scanner.

## 1.30.18.6 first-paint / maintainability regressions

- [x] Work may paint validated cached Frequently Visited from the first visible frame while the Work shortcut grid remains behind its existing authoritative safety gate.
- [x] Personal keeps its existing Frequently Visited first-paint behavior.
- [x] The localStorage render manifest and browser.session snapshot project the same first-paint contract for active Space, Multiple Spaces state, personalized labels and Frequently Visited.
- [x] A bounded read-only 1.30.18.5 startup-cache bridge preserves first-tab upgrade continuity; current writes use the new versioned format.
- [x] State/Frequently-Visited changes use centralized first-paint refresh/invalidation rather than independent partial writers.
- [x] Cache absence/corruption remains correctness-safe and authoritative state wins.

## Sync quota UX

- [x] Usage separates Layout & settings, Recovery safety copies, Shortcut images and Metadata / cleanup.
- [x] More than 25 KiB free remains normal/green.
- [x] 10–25 KiB free warns that Sync storage is getting full.
- [x] Under 10 KiB free warns that Sync storage is almost full.
- [x] Recovery-limited, artwork-limited and storage-limited states are distinguishable.
- [x] Essential quota failure states that recent changes remain on the current device until storage capacity is available.
- [x] New strings exist across all supported locales.

## Preservation gates

- [x] Full automated suite passes after final versioning: 754/754.
- [x] Performance benchmark passes with no material startup regression versus 1.30.18.5; measured fast-path timings remain in the same sub-millisecond / tens-of-milliseconds bands with normal run-to-run variation.
- [x] Package-size guard passes with a conscious 1.30.18.6 baseline (Firefox 615,705 deflated bytes; Chrome 630,263).
- [x] Normal Sync/recovery/state/profile schema versions are unchanged.
- [x] Permissions, CSP, privacy boundaries, telemetry policy and backend-free operation are unchanged.
- [x] `docs/ARCHITECTURE.md` documents authoritative state, Normal Sync, Recovery, Artwork, First Paint, UI, browser adapters, import/export and device-local vs synchronized ownership.

## Manual browser checks before store publication

- [ ] Firefox: with Work active and Frequently Visited enabled/populated, repeatedly open New Tabs and confirm the section is present continuously rather than appearing after the grid.
- [ ] Chrome: repeat the Work/Frequently-Visited visual check.
- [ ] Firefox: inspect Sync usage with a profile containing recovery generations and confirm recovery bytes are separated from Layout & settings.
- [ ] Verify warning styling/messages at representative normal, 10–25 KiB-free and <10 KiB-free states where practical.

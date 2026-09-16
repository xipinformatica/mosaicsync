# MosaicSync 1.30.18.7 QA / release-candidate checklist

## Release identity / packaging

- [x] Firefox manifest/runtime/Settings version is exactly `1.30.18.7`.
- [x] Chrome manifest/version_name/runtime/Settings version is exactly `1.30.18.7`.
- [x] GitHub-ready source and both browser ZIPs are reproducible from a clean extraction.
- [x] Firefox and Chrome browser ZIPs pass the production release-contract scanner.

## Step 1.1 hardening regressions

- [x] A current schema-v3 boot manifest matching the warm session snapshot reuses the already-painted boot grid instead of forcing a second full render; legacy v2 remains a read bridge rather than the current reuse target.
- [x] Authoritative `frequentlyVisitedEnabled: false` projects an explicit disabled/empty first-paint snapshot even if stale enabled device-local cards are supplied.
- [x] When Frequently Visited is enabled but no fresh device-local site list exists, `frequent: null` keeps the contract's preserve/no-op semantics.
- [x] Removing the optional Top Sites permission from the background context clears only the device-local session site list; the synchronized Show preference/count remain intact.
- [x] A fresh session first-paint snapshot is reconciled immediately, so an explicit FV-disabled state can suppress older boot-painted cards before later maintenance.
- [x] The always-visible Frequently Visited heading is hidden until the locale pass completes; non-English startup cannot expose its static English fallback first.
- [x] Reading a valid session render cache and warming the same snapshot again performs no redundant `storage.session` write.

## Sync quota / accounting hardening

- [x] Near-full Sync pressure remains the primary status headline even when artwork and/or recovery protection is also limited; limitation detail is composed rather than masking quota pressure.
- [x] Synthetic usage accounting conserves total bytes across Layout/settings, Recovery, Artwork and Metadata/cleanup buckets.
- [x] Both current generation-scoped and legacy recovery keys are counted in Recovery rather than Layout/settings.
- [x] Existing 25 KiB / 10 KiB warning thresholds and hard essential-quota behavior remain unchanged.

## Preservation gates

- [x] Full automated suite passes after final versioning: 773/773.
- [x] Performance remains in the 1.30.18.6 range; warm-grid reuse is restored and identical session-cache rewrites are eliminated.
- [x] Package-size change is conscious and small; final baseline is recorded for both browsers.
- [x] Work shortcut-grid authorization remains stricter than global/device-local Frequently Visited first paint.
- [x] Normal Sync/Recovery/state/profile schema versions are unchanged.
- [x] Permissions, CSP, privacy boundaries, telemetry policy and backend-free operation are unchanged.

## Manual browser checks before store publication

- [ ] Firefox: Work active + populated Frequently Visited — repeatedly open New Tabs and confirm cards are continuously present and the Work grid never visibly rerenders when the warm cache exactly matches.
- [ ] Firefox in Catalan (or another non-English locale): confirm no English Frequently Visited heading/subtitle is exposed on the first visible frame.
- [ ] Firefox: remove the optional Frequently Visited/Top Sites permission with no MosaicSync New Tab open, then open Work and confirm stale cards are not left visible after the fast session handoff; normal permission-recovery UI should appear.
- [ ] Chrome: repeat the Work/Frequently-Visited and localization checks.
- [ ] Inspect a near-full Sync profile with recovery/artwork limitation and confirm the primary warning communicates storage pressure while also explaining the limitation.

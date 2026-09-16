# MosaicSync 1.30.18.8 QA / release-candidate checklist

## Release identity / packaging

- [x] Firefox manifest/runtime/Settings version is exactly `1.30.18.8`.
- [x] Chrome manifest/version_name/runtime/Settings version is exactly `1.30.18.8`.
- [x] GitHub-ready source and both browser ZIPs are reproducible from a clean extraction.
- [x] Firefox and Chrome browser ZIPs pass the production release-contract scanner.

## Step 1.2 hardening regressions

- [x] Removing Top Sites permission writes a session-only suppression tombstone even when no full session render snapshot exists.
- [x] The early session bootstrap reads that tombstone and the New Tab module clears any older boot-painted Frequently Visited strip before normal session/authoritative hydration.
- [x] A generic/background profile write while the tombstone is active preserves an explicit empty Frequently Visited projection instead of replacing it with `frequent: null`.
- [x] Granting Top Sites permission clears the session-only suppression marker without changing the synchronized Show/Count preference.
- [x] Cross-context session-cache dedup verifies actual shared `storage.session` bytes before suppressing a write; context-local fingerprints alone are never authoritative.
- [x] A genuinely identical shared session render-state/meta snapshot still incurs zero rewrite after verification.
- [x] Background-only Space-name changes update the shared session first-paint contract even when no New Tab context is alive.
- [x] Background favicon learning updates the shared session projection so artwork existence is not forgotten by the fast session layer.

## Explicit Step-2 boundary

- [x] `docs/ARCHITECTURE.md` records that MV3/background contexts cannot synchronously rewrite a New Tab page's localStorage render manifest.
- [x] No additional persistent first-paint cache was added to hide that platform boundary.
- [x] Background-only changes refresh the newer shared session projection; Step 2 will decide whether/how the persistent synchronous manifest should be reduced or consolidated.

## Preservation gates

- [x] Full automated suite passes after final versioning: 788/788.
- [x] Existing v3 warm boot-grid reuse remains covered.
- [x] Existing non-English Frequently Visited first-frame heading protection remains covered.
- [x] Existing Sync quota accounting/warning regressions remain covered.
- [x] Work shortcut-grid authorization remains stricter than global/device-local Frequently Visited first paint.
- [x] Normal Sync/Recovery/state/profile schema versions are unchanged.
- [x] Permissions, CSP, privacy boundaries, telemetry policy and backend-free operation are unchanged.
- [x] Package-size delta is recorded and reviewed against 1.30.18.7.
- [x] Benchmark/size/release-contract gates pass on the final versioned source.

## Manual browser checks before/after store publication

- [ ] Firefox: with Frequently Visited visible, close all MosaicSync New Tabs, remove Top Sites permission, then open a New Tab and confirm stale cards are cleared at the fast session handoff and normal permission-recovery UI appears.
- [ ] Firefox: restore Top Sites permission and confirm Frequently Visited returns without toggling the synchronized Show setting OFF/ON.
- [ ] Firefox: with Work active, repeatedly open warm New Tabs and confirm Work shortcuts stay stable and Frequently Visited remains continuous.
- [ ] Firefox in Catalan (or another non-English locale): confirm no English Frequently Visited heading/subtitle appears on first frame.
- [ ] Chrome: repeat permission removal/restoration and Work/Frequently-Visited checks.

# MosaicSync 1.30.18.16 QA / release-candidate checklist

## Scope

Narrow Step 3 adapter-boundary hardening on the accepted 1.30.18.15 baseline. Tests were added first against the unchanged production implementation and passed, so no favicon production code change was required. Step 2 remains frozen. No feature, state/meta/Sync/Recovery schema, permission, CSP, privacy-boundary, telemetry/backend or UI behavior change.

## Affected files / runtime functions

- `tests/corrective-1301816.test.mjs`: new release regressions.
- `tests/harness/background-runtime-scenario.mjs`: production-runtime fixtures for host-scoped Firefox `tabs.query`, real `tabs.onUpdated` dispatch and Chromium `_favicon`/sentinel responses.
- Version/release identity surfaces: Firefox/Chrome manifests, shared `VERSION`, Settings labels, release-contract/current-version tests, README/current engineering docs, release notes, QA, changelog and generated build/size metadata.
- Production favicon functions intentionally unchanged: shared `resolveBrowserCachedFavicon()`, `resolveTabNativeFavicon()`, `learnFaviconFromTab()`, `scheduleTabFaviconLearning()` and browser adapter implementations.
- The two `permissions.onRemoved` listeners remain intentional and unchanged.

## Negative regressions added

- [x] Firefox open-tab cache: website/network fallback is forced to fail; hydration succeeds only through the real Firefox `browser.tabs.query()` adapter.
- [x] Firefox tab learning: an unrelated `tabs.onUpdated` event without expected-navigation state cannot learn artwork.
- [x] Chromium protected store: any non-`_favicon` fetch fails the test; Chrome Web Store artwork must come from the browser-local endpoint.
- [x] Chromium placeholder: sentinel-equivalent `_favicon` output is rejected and never becomes durable artwork.

## Positive preservation assertions

- [x] Firefox real open-tab data favicon hydrates and materializes as a device-local local asset.
- [x] Firefox real `tabs.onUpdated` learning succeeds after expected navigation and clears the durable/session marker.
- [x] Automatic Firefox/Chromium learned artwork projects to `imageKind: "none"` / no synchronized image provenance, with no favicon bytes in `storage.sync`.
- [x] Chrome Web Store `_favicon` source remains usable, protected remote provenance is stripped, and sentinel safety remains intact.
- [x] Existing Step 3 listener topology remains one `tabs.onUpdated` and two intentional `permissions.onRemoved` listeners.

## Automated gates

- [x] Full regression suite passes: 865/865.
- [x] Shared background core remains byte-identical in generated Firefox and Chrome runtimes, and all production background semantic files are unchanged from the authoritative 1.30.18.15 source.
- [x] Release-contract validation passes for both browser packages.
- [x] Benchmark completes; production background/model hot-path code is unchanged from 1.30.18.15, and no runtime-size growth is introduced.
- [x] Package size baseline consciously updated for 1.30.18.16.
- [x] Deterministic generated runtime trees and `build-manifest.json` verified across consecutive builds.
- [x] First clean GitHub-ready extraction passes 865/865 tests, release-contract validation and identical size checks, then reproduces all three candidate ZIPs byte-for-byte.
- [ ] Final external artifacts survive an independent extraction/validation gate.

## Measured certification results

- Starting authoritative 1.30.18.15 ZIP SHA-256: `0af68903bc4abc73462cd9321af7fb44953a8c7c63e3ccfac7f6d401a7261ae4`.
- Baseline source before .16 changes: 862/862 tests passing.
- New .16 adapter-boundary tests against unchanged .15 production favicon logic: 3/3 passing.
- Full .16 suite: 865/865 tests passing.
- Firefox runtime: 2,152,061 raw bytes; 633,395 deflated bytes.
- Chrome runtime: 2,173,798 raw bytes; 648,042 deflated bytes.
- Versus the accepted .15 runtime: -1 deflated byte for Firefox and -1 deflated byte for Chrome (version-string compression only; semantic background code unchanged).
- Deterministic `build-manifest.json` SHA-256 across consecutive builds: `311e149541a564493305b8bc75f5ac9fd3ba9d15ebf23df77c0dd880f5e2c01f`.
- Production background source comparison versus authoritative .15: shared core, Firefox adapter, Chrome adapter and both entrypoints are byte-for-byte unchanged.

Representative benchmark run completed successfully:

- `normalizeState(200)`: 137.853 ms average.
- `stableStringify(200)`: 36.128 ms average.
- `projectStateToLocalAssets(200)`: 93.483 ms average.
- `createWriteBaseline(200)`: 137.132 ms average.
- active-Space hydration: 0.116 ms average.
- startup normalize with validated memo: 40.674 ms average.
- startup baseline with validated memo: 42.556 ms average.
- normalized flatten fast path: 1.082 ms average.
- normalized Settings fast path: 0.012 ms average.
- cross-Space move + intent: 2.931 ms average.

Absolute benchmark timings are environment-sensitive; the relevant release-level preservation evidence is that the production runtime logic is unchanged and package payload size did not grow.

First clean-source reproduction (before this QA stamp) was byte-for-byte deterministic:

- Firefox candidate/reproduction SHA-256: `fbe0adf6303e63843720d8e6769a7ad0e9e14f345ceb7d3825e8392958c9ca42`.
- Chrome candidate/reproduction SHA-256: `06a124943705e9e709317693fdb3270c048e786f6432518ca9bbc98bdff0278d`.
- GitHub-ready candidate/reproduction SHA-256: `ed84b642ddf17c19fe156c5a2ae999950c2343ff3bd4f32e93f50d7a115c6241`.

This QA record is now frozen. The exact post-QA GitHub-ready archive is independently re-extracted, tested, contract-validated and repackaged as the final external handoff gate. Final external archive hashes are reported with the handoff rather than written back into this file, avoiding self-referential archive-hash churn.

## Manual browser checks

- [ ] Firefox: optional smoke test with an open tab favicon and a shortcut navigation.
- [ ] Chrome: optional Chrome Web Store/native `_favicon` smoke test.

Manual checks are intentionally not claimed by automated certification.

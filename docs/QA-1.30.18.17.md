# MosaicSync 1.30.18.17 QA / release-candidate checklist

## Scope

Step 3.2 browser-boundary consolidation on the certified 1.30.18.16 live baseline. Zero new features. Consolidate only duplicated source with identical semantics; retain genuine Firefox/Chromium capability differences. Step 2 remains frozen. No state/meta/Sync/Recovery schema, permission-set, CSP, privacy, telemetry/backend or UI behavior change.

## Affected ownership / files

- `src/shared/background/background.js`: canonical tiny shared background entrypoint; browser-owned copies removed.
- `src/shared/newtab/newtab.html`: canonical New Tab DOM; browser-owned copies removed. Build injects Chrome's existing classic browser shim only into the Chromium runtime.
- `src/shared/manifest-locales.json`: canonical 33-locale manifest registry; browser `_locales` source trees removed and generated deterministically.
- `src/shared/core/permissions.js`: common Top Sites / optional HTTP(S) permission policy.
- `src/shared/core/permission-platform.js`: Firefox-default data-collection permission capability.
- `src/chrome/core/permission-platform.js`: Chromium no-op Sync-permission capability override.
- `tools/build.mjs`: deterministic Chrome shell injection + manifest-locale generation.
- Permanent tests/source-contract paths updated to the new canonical owners.
- Firefox/Chrome manifests, background favicon adapters, Chrome browser/platform/i18n adapters remain separate and behaviorally unchanged.

## Negative regressions

- [x] Browser overlays cannot reintroduce duplicate `background.js`, `newtab.html`, `permissions.js` or `_locales` source ownership.
- [x] Firefox generated New Tab shell cannot accidentally acquire Chrome's browser shim.
- [x] Chrome generated New Tab shell must contain exactly one shim before the classic bootstrap scripts.
- [x] Chrome Sync consent cannot issue a Firefox-style data-collection permission request or revoke.
- [x] Manifest locale generation cannot lose a locale or leak Firefox/Mozilla branding into Chrome descriptions.

## Positive preservation assertions

- [x] Generated Firefox/Chrome background entrypoint is identical.
- [x] Shared common `permissions.js` runtime is identical across browsers; only `permission-platform.js` differs.
- [x] Firefox data-collection permission request is still issued synchronously from the gesture call and revoke retains its existing behavior.
- [x] Chrome Sync consent remains immediately successful/no-op and disabling Sync does not revoke extension permissions.
- [x] All 33 generated manifest locales preserve their reviewed browser-specific descriptions and common action label.
- [x] Prior Step 3.1/.16 real favicon-adapter runtime regressions remain green.

## Preservation evidence before release bump

- [x] 1.30.18.16 baseline suite: 865/865.
- [x] New Step 3.2 tests were added before source changes and failed on duplicated ownership as intended.
- [x] After canonicalizing background entrypoint, New Tab shell and manifest locale ownership—but before permission refactor—the complete generated Firefox/Chrome runtime remained byte-for-byte identical to the frozen 1.30.18.16 runtime across all 295 files.
- [x] After permission refactor, only four runtime paths differed from 1.30.18.16: the two shared `core/permissions.js` outputs and the two new browser capability `core/permission-platform.js` files.
- [x] Browser-owned textual overlay is reduced to genuine capability/store code; no parallel New Tab HTML, manifest locale tree, common permission policy or background entrypoint remains.

## Automated gates

- [x] Full 1.30.18.17 regression suite passes: 869/869.
- [x] Release-contract validation passes for both generated browser trees and candidate packages.
- [x] Benchmark and package-size checks pass; runtime growth is limited to the small permission capability seam and version-string effects.
- [x] Deterministic generated runtimes / build manifest verified across consecutive builds.
- [x] First clean GitHub-ready extraction passes full tests/contract/size checks and reproduces all three candidate ZIPs byte-for-byte. The exact post-QA handoff archive receives one final external extraction gate after this QA file is frozen.

Final measured results and hashes are recorded after certification.
## Measured certification results

- Authoritative starting source: certified `mosaicsync-1.30.18.16-github-ready.zip`, SHA-256 `35ff7ca5635112be9c24811f0dcb423ffa0c8ea14da2733f42e23621d3ac9b38`.
- Baseline 1.30.18.16 suite before Step 3.2: 865/865 passing.
- Step 3.2 architecture tests: 4 new permanent tests; full 1.30.18.17 suite 869/869 passing.
- Firefox runtime: 2,152,741 raw bytes; 633,926 deflated bytes (+680 raw / +531 deflated versus 1.30.18.16).
- Chrome runtime: 2,174,385 raw bytes; 648,441 deflated bytes (+587 raw / +399 deflated versus 1.30.18.16).
- Consecutive deterministic `build-manifest.json` SHA-256: `71352bfdebe570c341e4699e39144cc785a497c64726729a8bbc63470c12a325`; all 297 generated runtime files per combined tree listing reproduced identically between builds.
- Before the permission split and release bump, shared background entrypoint/New Tab shell/manifest-locale generation reproduced the frozen 1.30.18.16 runtime byte-for-byte across all 295 files.
- After the permission split (still on the 1.30.18.16 identity), exactly four runtime paths differed: Firefox/Chrome `core/permissions.js` plus the new Firefox/Chrome `core/permission-platform.js`.
- Production surfaces outside Step 3.2 were byte-for-byte unchanged from 1.30.18.16: shared background core/runtime utilities, both favicon adapters, model/storage/profile/importer, New Tab JS/CSS/startup bootstrap scripts and Chrome platform/i18n/browser-shim modules.
- Browser-owned textual source fell from 79 files / 2,751 lines / 138,623 bytes in 1.30.18.16 to 8 files / 519 lines / 21,949 bytes in 1.30.18.17. Remaining browser-owned text is intentional capability/store code.

Representative benchmark run completed successfully:

- `normalizeState(200)`: 138.797 ms average.
- `stableStringify(200)`: 33.879 ms average.
- `projectStateToLocalAssets(200)`: 90.049 ms average.
- `createWriteBaseline(200)`: 128.942 ms average.
- active-Space hydration: 0.073 ms average.
- startup normalize with validated memo: 39.432 ms average.
- startup baseline with validated memo: 41.927 ms average.
- normalized flatten fast path: 1.267 ms average.
- normalized Settings fast path: 0.011 ms average.
- cross-Space move + intent: 2.651 ms average.

Absolute timings are environment-sensitive; the important Step 3.2 preservation evidence is the unchanged high-risk production code, green full suite and narrow runtime-size delta.

First clean-source candidate reproduction was byte-for-byte deterministic:

- Firefox candidate/reproduction SHA-256: `a8a71ae307a758da3910a58c34e0edc7ce667d2e16f0f06f101af54e41e4687b`.
- Chrome candidate/reproduction SHA-256: `e0cf8e7ee7dfd5794fa066c8f43a60d70f4514d2594b087d2f3d09576b587d29`.
- GitHub-ready candidate/reproduction SHA-256: `6778f223852b688562399a8898057ad7cfb354bd2263f26068264d0a0df5819f`.

This QA record is now frozen. The exact post-QA GitHub-ready archive is re-extracted, tested, contract-validated and repackaged as the final external handoff gate; final hashes are reported in the handoff to avoid self-referential source-archive churn.


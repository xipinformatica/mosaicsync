# MosaicSync 1.30.18.29 QA / release-candidate checklist

## Baseline / scope

- [x] Starts from the manually validated 1.30.18.28 GitHub-ready source archive.
- [x] 1.30.18.26 remains withdrawn and is not used as a baseline.
- [x] Scope is Step 5.3 dead-code/runtime-reachability retirement only.
- [x] Steps 1–4 and completed Step 5.2 behavior remain frozen.

## Retirement proof

- [x] `workspaceAllowsAutoIcons()` has no production caller and is removed.
- [x] `shortcutAllowsFaviconRecovery()` remains the canonical live policy and is unchanged.
- [x] The unused `settingsRecordEqual` import is removed from `core/concurrency.js`; the actual model helper remains intact and used elsewhere.
- [x] Stale historical tests no longer extract or mock the retired helper.
- [x] `npm run reachability` reports zero unreachable shared JS modules, zero unused named imports and zero unreferenced private functions.
- [x] Exported test/reference surfaces are reviewed and intentionally retained rather than deleted from static counts alone.

## Positive preservation

- [x] Generated Firefox preserves inactive Work-space automatic favicon recovery.
- [x] Generated Chromium preserves inactive Work-space automatic favicon recovery.
- [x] Generated Firefox preserves explicit favicon preference rehydration with automatic site icons disabled.
- [x] Generated Chromium preserves explicit favicon preference rehydration with automatic site icons disabled.

## Frozen behavior boundaries

- [x] No Recovery or normal Sync algorithm change.
- [x] No first-paint/session/render-cache change.
- [x] No Frequently Visited implementation change.
- [x] No New Tab interaction/Settings behavior change.
- [x] No favicon retrieval/commit policy change; only a dead predecessor helper is removed.
- [x] No permission, CSP, schema, persisted payload, locale or browser-adapter change.

## Automated / reproducibility gates

- [x] Full final suite passes: 934/934 (930 inherited + 4 Step-5.3 regressions).
- [x] Runtime reachability audit passes with zero high-confidence findings after retirement.
- [x] Firefox and Chromium release contracts pass on generated trees and packaged browser ZIPs.
- [x] Package-size baseline/report updated and compared with 1.30.18.28.
- [x] Final GitHub-ready ZIP is clean-extracted, rebuilt and retested at 934/934 before handoff.
- [x] Firefox, Chromium and GitHub-ready ZIPs reproduce byte-for-byte from the final clean extraction before handoff.

## Runtime-source boundary

Relative to 1.30.18.28, production source changes are limited to:

- Firefox/Chromium manifests, shared `VERSION`, and Settings version label — release identity only.
- `src/shared/background/background-core.js` — removes only the uncalled `workspaceAllowsAutoIcons()` helper.
- `src/shared/core/concurrency.js` — removes only the unused `settingsRecordEqual` import binding.

No other production runtime source differs.

## Final hashes / sizes

- `build-manifest.json` SHA-256: `5d50d6a3c851833af6d57f9ec28a7fa2b45a7810efb634e97465e71857d592d0`.
- Firefox ZIP SHA-256: `0245edb8fff5b0bd98ee966988f7bb7718637db9351ae7697dabc4218f40f59a`.
- Chromium ZIP SHA-256: `3f09022f5c5ea624f523c0d9f95c914842fe4fe3d54d8cb0ddd22ee2c33298ba`.
- Firefox runtime: 2,181,757 raw bytes / 643,225 deflated bytes (−216 / −28 versus 1.30.18.28).
- Chromium runtime: 2,203,401 raw bytes / 657,740 deflated bytes (−216 / −29 versus 1.30.18.28).
- The GitHub-ready source SHA-256 is reported externally because embedding its own archive hash would be self-referential.


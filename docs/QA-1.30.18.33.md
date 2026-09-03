# MosaicSync 1.30.18.33 QA / release-candidate checklist

## Baseline

- [x] Begin from the exact certified 1.30.18.32 GitHub-ready source.
- [x] 1.30.18.32 SHA-256 re-verified as `b01360c830f4ecc5452ca4f1a176fb00f9f721b57eee27abb114ae6bf4650c7c`.
- [x] Untouched baseline rebuilt and passed 940/940 tests.
- [x] Untouched baseline reachability audit reported zero high-confidence leftovers.

## M1 scope

- [x] Product architecture remains frozen; runtime changes are release identity only.
- [x] Add dependency-free WebDriver real-browser smoke tooling outside the runtime graph.
- [x] Add explicit Firefox/GeckoDriver and Chromium/ChromeDriver discovery with environment overrides.
- [x] Use fresh disposable profiles; never touch the user's normal browser profile.
- [x] Firefox automation uses the distinct development Gecko ID.
- [x] Smoke requires New Tab override + `interactionReady` + Settings + Space switching + FV disabled-state consistency + shortcut navigation.
- [x] Missing browser/driver dependencies fail explicitly rather than being skipped.
- [x] Five deterministic M1 tests pass for the smoke tooling/workflow contract.

## Current sandbox real-browser availability

`npm run smoke:probe` reports:

- Firefox: unavailable
- GeckoDriver: unavailable
- Chromium: `/usr/bin/chromium`
- ChromeDriver: unavailable
- Xvfb: `/usr/bin/Xvfb`

The sandbox's system Chromium is additionally managed so automated unpacked-extension loading is rejected. Therefore an actual Firefox/Chromium WebDriver session cannot be honestly claimed from this environment. M1 is implemented as a portable real-browser lane and its orchestration is regression-tested here; the real-browser lane remains an external environment gate before the infrastructure phase is considered fully exercised.

## Release gates

- [x] Full 1.30.18.33 suite passes after final identity/docs update: 945/945.
- [x] Reachability remains clean: zero unreachable shared modules, unused named production imports or unreferenced private functions.
- [x] Benchmark completes.
- [x] Generated Firefox and Chromium release contracts pass.
- [x] Package-size baseline is refreshed. Raw runtime size is byte-identical to .32 (Firefox 2,181,757 B; Chromium 2,203,401 B); deterministic deflated totals differ by -2 B in each browser from version-string compression only.
- [x] Firefox and Chromium packaged release contracts pass.
- [x] Final GitHub-ready ZIP clean-extracts, rebuilds, retests and reproduces all release artifacts byte-for-byte.

## Freeze rule

1.30.18.32 remains the frozen application-architecture baseline. 1.30.18.33 may be frozen as M1 only after the release gates above pass and the new real-browser command is successfully exercised in an environment with the required browser drivers.

## Mechanical certification hashes

- Firefox ZIP: `876df036ef52da77bce1028da2fd7bce1ac99f804ff78dcc6ca7799a2e236717`
- Chromium ZIP: `cb7a835a1efe6cb5479ecba123b8d72d83620c0fb1949cd8f08ac07c8476abdc`
- Build manifest: `9e103459f464d9fc33f63597cd4dab3380e4e66b6f92af22c24855efd3993468`

The GitHub-ready source hash is recorded after this final QA text is frozen and the exact handoff archive is repackaged/reproduced.

# MosaicSync 1.33.0.60 QA / release-candidate checklist

Baseline: 1.33.0.59 GitHub-ready CI-fixed source, plus Claude's `MosaicSync-1.33.0.59-firefox-title-test-fix.diff`.

## Scope

- In fresh Firefox profiles, the first actual New Tab override can redirect to Welcome. The title/redirect test must wait until `welcome/welcome.html` is fully loaded before sending background messages; bounded to 20 seconds. On failure, capture last observed state and page URL.
- Keep the Chrome viewport-target stabilization and privileged Firefox browser-chrome new-tab opening (neither replaced with a direct extension file navigation).
- Add browser-smoke text logs and title/redirect stderr logs to GitHub Actions evidence ZIPs on success/failure.
- Preserve 1.33.0.59 runtime functionality, permissions, temporary webRequest listeners, security restrictions and storage formats. Only version metadata changes in the extension runtime.

## Required verification

1. Full `npm test` with exact inventory, and `node --test --test-concurrency=4 tests/*.test.mjs`.
2. Runtime reachability, size/performance reports, release-contract checks and deterministic packaging.
3. Clean-room source extraction, retest and byte-identical source, Firefox and Chrome packages.
4. GitHub real browser gate: Chromium 141, Chromium stable, Firefox 140 baseline, Firefox current. Confirm the title/redirect checks run past the Welcome transition on both Firefox versions; inspect evidence ZIPs.
5. Existing-profile upgrade from the last published store version and optional-permission prompts should be manually checked before store publication; the smoke test's pregranted permission fixture is not a production prompt test.

## Status

PENDING four-browser GitHub verification. No store publication until the release gate passes.

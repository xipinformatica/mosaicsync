# MosaicSync 1.33.0.46 publication notes

## Firefox Add-ons / Chrome store release notes

Improves release quality checks: MosaicSync now includes automated real-browser compatibility testing for setup and everyday use, alongside stronger checks for background communication failures. No new permissions or changes to your layout.

## Mozilla Notes to Reviewer

Neofix stage 2 over 1.33.0.45 introduces a GitHub Actions browser smoke-test matrix (Chromium 141/current, Firefox 140/current) that exercises fresh Welcome setup, callback messaging, user-created shortcut persistence, Settings/Spaces and navigation. The scripts inspect packaged browser code rather than relying solely on simulated DOM. A generated file-level test inventory classifies tests by primary method without claiming assertion-level coverage.

The test harness now supplies real runtime `sendResponse` callbacks (including two-device Sync harnesses), removing an otherwise unreachable production test-only fallback for missing callback arguments. Explicit rejection coverage ensures async errors receive one structured failure reply. The browser message dispatch table and Sync/Recovery behavior remain unchanged. No permission, CSP, telemetry, schema or Sync/Recovery format changes.

**Verification:** mechanical results and actual GitHub Actions browser results must be reported separately. Do not represent an unexecuted workflow as successful browser certification.

## GitHub release title

`MosaicSync 1.33.0.46`

## GitHub release description

- Adds a required four-target real-browser compatibility gate for future releases, exercising first-run setup and background communication.
- Adds a checked test inventory distinguishing primary behavioral, integration, static and browser-level coverage.
- Strengthens failed background request coverage and aligns Node harnesses with real WebExtension callback messaging.
- No changes to shortcuts, appearance, browser permissions or Sync/Recovery formats.

## Post-audit browser-gate correction

The originally packaged `.46` browser smoke runner could stall on a browser-native optional website-access prompt. The corrected source now handles that prompt explicitly **only in the automated test session**, records the simulation/suppression in the smoke evidence, and navigates shortcuts to a local HTTP test page rather than external `example.com`. It also invokes `python3` when extracting the Chrome store ZIP. Production extension behavior, permissions, and Sync/Recovery code are unchanged. The workflow remains on HOLD until actual old/current Chromium and baseline/current Firefox jobs all pass.

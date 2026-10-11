# MosaicSync 1.33.0.46 QA / release-candidate checklist

## Scope

- Based on independently approved Neofix 1 (1.33.0.45), source SHA-256 `0318e84ab5b7eb73ac5f2b3ef85badbba5b303a544f73ed788185c3d8de4c7ba`.
- Neofix 2 is infrastructure and test-harness hardening, not feature/UX or Sync/Recovery changes.
- The existing runtime listener loses only its old Node test-harness-specific missing-callback fallback; all real browser requests include a callback argument.

## Claude HOLD and gate corrective (same .46 version)

- Independent review found the initial smoke runner blocked at the native optional website-access request before the Sync-choice step; this was a release-gate failure, **not a production extension regression**.
- The smoke runner now simulates a declined optional website-access prompt for Chromium via pre-document Chrome DevTools injection and suppresses the native prompt in Firefox test sessions via `extensions.webextOptionalPermissionPrompts=false`. Both approaches are test-only. They do **not** validate actual browser permission-grant UX.
- Test evidence explicitly records the simulated/suppressed permission decision. External `example.com` navigation has been replaced with a locally served HTTP target so network outages cannot invalidate navigation testing. Chrome extraction calls `python3`.
- New regression checks protect CDP command wiring, Firefox preference, and a functional local navigation target. The GitHub Actions four-browser matrix and `RELEASE GATE` job must actually run successfully before the build can be called browser-certified or published.

## Required checks

1. `npm run build`, `npm run test:inventory`, and all Node regressions (prefer controlled concurrency when historical runners hang).
2. `node tests/harness/background-runtime-scenario.mjs chrome neofix-133046-rejected-message-callback` and its Firefox equivalent: rejected command returns exactly one structured error.
3. `npm run reachability`, release contract and package-size census.
4. GitHub Actions `MosaicSync release browser gate`, including old/new Chromium and baseline/current Firefox. The smoke checks REAL first-run setup, background status response, a created shortcut surviving reload, Settings, Space switching and navigation.
5. Firefox/Chrome ZIP integrity and independent deterministic clean-room rebuild of all three release archives.
6. Independent reviewer audit of any test-harness or browser-gate blind spots.

## Non-negotiable certification conditions

- **Do not label FULL/browser-certified unless all four real-browser jobs have actually run and passed** on a real runner, and `release-gate` reports success. Local installation of this YAML is insufficient.
- Manual testing of current Chrome and Firefox is useful but cannot substitute for an unrun required CI gate. Set the GitHub `release-gate` status as required under branch protection; publishing/release action remains a conscious maintainer decision.
- No new permissions, Sync/Recovery wire formats, stored schemas, icon assets, runtime UX or heavy file extraction.
- The test inventory is primary-file-level classification, not execution coverage. Future assertion-level audit remains possible.

## Deliberately untested by the minimum gate

- Deep two-device cloud delivery, image-heavy backup import/export and every folder drag operation still rely on dedicated Node/integration scenarios and manual browser acceptance. Do not claim they are fully exercised in real-browser CI.

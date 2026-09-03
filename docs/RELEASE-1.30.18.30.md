# MosaicSync 1.30.18.30 publication notes

## Mozilla Developer Hub changelog

Completes Step 5.4 with test-architecture hardening only. Adds full generated Firefox/Chromium New Tab startup and interaction coverage, including Frequently Visited, without changing product behavior or data formats.

## Notes to Reviewer

1.30.18.30 begins from the manually validated 1.30.18.29 runtime and makes no production algorithm or ownership refactor.

The main addition is a deterministic generated-New-Tab integration harness. It imports the complete generated Firefox and Chromium `newtab.js` module graphs in a controlled browser/DOM/storage environment, seeds an onboarded profile with Frequently Visited enabled, and requires the real authoritative startup path to reach `interactionReady`. It then verifies that the generated Settings button actually opens the panel, color-swatch startup wiring completed, the storage-change listener registered, and Frequently Visited executed the browser Top Sites path and rendered.

The same harness drives the real generated Frequently Visited Settings change listener OFF and back ON, verifying dependent controls and the live strip hide and restore correctly.

A negative regression mutates a temporary generated tree to recreate the withdrawn 1.30.18.26 helper-contract failure. The integration harness must fail before `interactionReady`, Settings wiring and Frequently Visited execution. This specifically closes the test gap that allowed 1.30.18.26's isolated helper tests to pass while full New Tab initialization was broken.

Existing structural tests are retained where literal structure is itself the contract, including manifests, CSP/permissions, HTML/CSS/bootstrap ownership, release identity and package output.

No feature, UI behavior, permission, CSP, schema, persisted payload, locale, first-paint/cache, favicon, Sync, Recovery, storage or browser-adapter behavior changes.

## Chrome Web Store release notes

Internal test-hardening release only. Adds full generated New Tab startup/interaction coverage for Firefox and Chromium, including Frequently Visited, with no feature, permission or synchronized-data-format change.

## GitHub release title

`MosaicSync 1.30.18.30`

## GitHub release description

MosaicSync 1.30.18.30 completes Step 5.4 by strengthening the test architecture around the complete generated New Tab startup path.

A new Firefox/Chromium integration harness imports the full generated module graph, requires authoritative startup to reach interaction readiness, opens Settings, verifies color-swatch and external-state wiring, and exercises Frequently Visited through the real Top Sites and Settings-toggle paths. A negative mutation permanently reproduces the withdrawn 1.30.18.26 dependency-contract regression and proves this integration gate catches it.

Production behavior and architecture remain unchanged apart from release identity. No feature, UI behavior, permission, CSP, schema, persisted payload, locale, first-paint/cache, favicon, Sync, Recovery, storage or browser-adapter behavior changes.

## GitHub Desktop commit

**Summary:** `Release MosaicSync 1.30.18.30`

**Description:** Complete Step 5.4 with full generated New Tab startup/interaction regression coverage and no production behavior change.

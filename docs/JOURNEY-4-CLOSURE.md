# Journey 4 — Trust Boundaries & Failure Resilience: closure record

## Decision

The targeted Journey 4 release sequence 1.33.0.39–1.33.0.44 is functionally complete as a **local import, URL authoring, and persistence error-handling** hardening program. This is a scoped closure, not a claim that every distributed failure mode is solved. Do not call .44 publicly published until independently confirmed.

## Delivered

| Version | Outcome |
| --- | --- |
| 1.33.0.39 | Imported-profile logical timestamps are stamped under controlled authority. |
| 1.33.0.40 | Typed local persistence failure categories and user-facing save feedback. |
| 1.33.0.41 | Safe repair of local poisoned import clocks and protection against stale New Tab import baselines; independently proven two-device skewed-clock behavior. |
| 1.33.0.42 | Welcome staged-import guards, localized conflict messages, new shortcut URL credential rejection while preserving existing stored shortcuts. |
| 1.33.0.43 | Browser bookmarks remain visible; localized Frequent credential error, actionable setup retry, additional save-failure UI surfaces. |
| 1.33.0.44 | Remaining Frequently Visited save-error localization and storage-full profile-import advice, including staged Welcome paths. |

## Explicit boundary conditions

- Storage and Sync schema formats, permissions, CSP and browser floors are unchanged.
- The Recovery/Normal Sync distributed merge state machine has not been redesigned.
- Legacy stored credential URLs are not silently deleted. Browser bookmarks and MosaicSync shortcut creation remain different trust boundaries.
- Malformed backups do not silently acquire authority or bypass import validation.
- Passing mechanical suites is not equivalent to a real-browser smoke test.

## Separate future investigation — high-risk, not in this journey

A remote Sync peer whose logical clocks were poisoned by a historical bad import can ignore another device's healthy profile restore, or reintroduce damaged clock authority. Reproducing and repairing that condition requires a multi-device protocol design with crash/concurrency testing and independent audit, not a minor .44 patch. Any such work must show red-before-green distributed behavior and preserve non-poisoned clock ordering before release.

## Release gates

Run the regression suite, multi-device inherited tests, release contracts, deterministic packaging and independent clean-room replay. Perform real Firefox/Chrome installation smoke tests before store publication. Seek an adversarial independent audit of .44, including checking that its failure handlers do not weaken the `.41`/`.42`/`.43` fixes.

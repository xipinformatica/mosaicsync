# MosaicSync 1.33.0.63 publication notes

**PRIVATE RELEASE CANDIDATE — do not upload to browser stores before independent review and the six GitHub release-gate jobs for the final 1.33.0.63 commit.**

## Store changelog (Firefox / Chrome)

- Fixed failed folder creation, rename, grouping, ungrouping and grid moves unexpectedly being saved by a later unrelated action.
- Improved recovery from local storage errors while preserving concurrent edits made in other tabs.
- Includes the previous 1.33.0.62 atomic backup/restore improvement: imported branding and shortcuts are now committed together, including in Welcome.
- No new permissions, telemetry, Sync or Recovery format changes.

## Firefox AMO Notes to Reviewer

MosaicSync 1.33.0.63 extends the existing ED-1 failed-save recovery behavior to folder and grid mutations. Previously these operations could modify the open tab's in-memory profile before a failed local storage write; an unrelated later save could then persist the hidden, unsuccessful change. A failed structural save now re-reads the authoritative persisted profile and updates the visible grid; if that recovery read also fails, later writes fail closed until durable state can be re-adopted. No new browser APIs or permissions are requested.

This release also includes the independently reviewed but not separately published 1.33.0.62 import correction. The Settings and first-run Welcome backup import paths save imported Custom Branding together with the profile and assets in a single guarded `storage.local.set` operation. In independent real Chromium testing, 47 timed Settings-tab closures produced zero mixed branding/profile outcomes, compared with two in 25 trials on .61. 1.33.0.62 itself was not pushed to GitHub or published to the stores.

The production Firefox Gecko ID remains `mosaicsync@xipinformatica.cat`, with desktop Firefox 140.0 as minimum. The existing on-demand `webRequest` permission for optional title redirect validation is unchanged. No new telemetry, remote services, schema migrations, translation changes or Sync wire-format changes.

**Testing status:** targeted folder recovery tests pass in an extracted-function harness. Real Chromium acceptance for the folder changes, Firefox-specific storage fault injection, receiving-device Sync, and the final versioned GitHub Actions six-job gate remain outstanding. Do not submit before the release decision.

## GitHub release title

`MosaicSync 1.33.0.63`

## GitHub release comments

Stage 2C data-integrity stabilization: failed folder/grid operations no longer leak into later unrelated saves. Reuses ED-1 durable-state re-adoption and fail-closed recovery, preserving other tabs' committed edits. Includes the previously accepted .62 atomic Settings/Welcome backup-restore fix. Adds targeted regression tests. No new permissions, telemetry, schema migration or Sync format changes. Real-browser acceptance for the new folder paths and GitHub six-job release gate are required before publication.

## Publication gate

Require independent real-browser fault-injection acceptance for failed folder create/rename/group/reorder/ungroup, all automated tests, deterministic clean-room package rebuild, and all six GitHub release-gate jobs on the final 1.33.0.63 commit. Document residual Firefox storage-failure and receiving-device Sync test gaps. The .62 GitHub gate was not run and must not be represented as passed.

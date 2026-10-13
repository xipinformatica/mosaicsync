# MosaicSync 1.33.0.61 publication notes

**Release candidate — do not publish until the versioned 1.33.0.61 GitHub four-browser gate passes.**

## Store changelog (Firefox / Chrome)

- Fixed duplicate shortcuts after retrying a failed save, including saves that completed but reported an error.
- Fixed cancelled shortcut edits and moves accidentally being applied by later saves or synchronized to other devices.
- Fixed cross-Space moves that could leave the same shortcut in Personal and Work after a failed save and retry.
- Improved failed-delete recovery and confirmation; preserves other tabs' legitimate edits.
- No new permissions, telemetry, translations, storage migration or Sync protocol changes.

## Firefox AMO Notes to Reviewer

MosaicSync 1.33.0.61 is a targeted shortcut data-integrity correction based on 1.33.0.60. Two shared runtime source files change: `src/shared/newtab/newtab.js` and `src/shared/core/storage.js`. The Firefox production Gecko ID remains `mosaicsync@xipinformatica.cat`, and desktop Firefox 140.0 remains the minimum version. No new permissions or optional host permissions are requested. The existing `webRequest` permission is used only for optional, on-demand website-title redirect validation, as in .60; it is not part of ED-1. No telemetry or remote server is introduced.

When a shortcut save fails, MosaicSync now re-reads durable local state and restores the visible Space while keeping the editor draft available for retry. New shortcuts reuse their IDs on retry. Cross-Space Sync intents are recalculated against durable state to ensure source-Space tombstones. Failed deletes surface an error and require a new confirmation. Sync schema, Recovery formats and import logic are unchanged.

Independent real Chromium 141 fault-injection tests passed for rejected and ambiguous writes, retries, cancellation, cross-Space moves, drag-and-drop, concurrent tabs, and real `chrome.storage.sync` records. Firefox 140 and current Firefox passed the standard installed-browser GitHub checks for the unversioned candidate. **Firefox-specific injected-storage-failure tests were not performed.** The 1.33.0.61 versioned release must pass the full GitHub browser gate before publication.

## Chrome Web Store — webRequest justification (unchanged from .60)

MosaicSync uses `webRequest` only to correlate response headers for its own temporary, user-initiated website-title lookup after optional website access has been granted. Listeners are installed on demand, removed after a short idle period, and unrelated events are ignored without recording or transmission. It does not collect browsing history, add always-on host permissions, or send telemetry. This update makes no changes to that permission or its behavior.

## GitHub release title

`MosaicSync 1.33.0.61`

## GitHub release comments

ED-1 stabilization: restores durable shortcut state after failed saves; makes add/edit/delete retry behavior safe; prevents cancelled mutations from leaking into later saves or Sync; recomputes cross-Space Sync intents to avoid duplicate placement of the same shortcut across Personal and Work. Includes targeted regression tests. No new permissions, telemetry, migrations or Sync wire-format changes. Chromium fault-injection audit and candidate GitHub four-browser gate passed; Firefox-specific fault injection and a second-device receiving test remain unverified.

## Publication gate

Before submitting to AMO/Chrome Web Store, require: (1) all 1,559+ automated tests, (2) package/release contract and clean-room byte-identical rebuild, (3) **the versioned .61 GitHub Actions six-job release gate green**, and (4) review of the accepted Firefox fault-injection and separate-device Sync test gaps. Passing the previous unversioned candidate's gate is not a substitute for the versioned .61 gate.

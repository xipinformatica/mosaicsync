# MosaicSync 1.33.0.32 QA / release-candidate checklist

1.33.0.32 is a narrow visual refinement over 1.33.0.31. It changes only the one-time folder-discovery demonstration and release/test metadata. No real folder/shortcut mutation semantics, profile schema, Sync/Recovery wire format, permissions, CSP, browser floor or privacy boundary change.

## Acceptance

- Eligibility, one-time localStorage flag, retry/cancellation rules, Recently opened suppression, reduced-motion policy and direct-child render observer remain as certified in 1.33.0.31.
- Motion users see the real conceptual sequence: ghost drag → fake two-choice popover → visual emphasis of localized “Create folder” → fake folder tile → fake opened folder panel containing both shortcut visuals.
- The fake sequence is entirely inside the inert, `aria-hidden`, `pointer-events:none` tutorial layer. It contains no links/buttons, no `data-id`, and never calls `showDropChoice`, `createFolderFromShortcuts`, `saveState`, browser storage, runtime messaging, Sync or Recovery code.
- The real launcher grid remains structurally unchanged before, during and after the tutorial.
- Fake popover labels reuse existing localized `moveHere`, `switchPositions`, `createFolder`, `putTogether` and `folder` strings; no new locale keys are introduced.
- Reduced-motion users continue to receive static callout/arrow/ring guidance only; the staged fake popover/folder sequence is not mounted.

## Regression evidence

`tests/feature-133032.test.mjs` was written red against 1.33.0.31 and protects the complete fake sequence, inert/no-identity contract, localized production action labels, reduced-motion exclusion, test-group ownership and mutation-API isolation. The existing 1.33.0.31 lifecycle/race suite remains in force.

Final release candidate must pass all canonical groups, reachability, syntax/JSON checks, deterministic build/package checks and clean archive inspection.

## Final mechanical evidence

- Unique full-suite inventory: 1360/1360 PASS across 192/192 test files, 0 ungrouped.
- Canonical groups: Startup 285/285; New Tab 554/554; Sync 350/350; Recovery 225/225; Security 219/219; Browser/parity 278/278; Core 201/201; Release 463/463.
- New Tab and Release were completed in disjoint file chunks to avoid the execution ceiling; no timed-out run is counted as a pass.

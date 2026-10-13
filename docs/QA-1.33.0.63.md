# MosaicSync 1.33.0.63 QA / release-candidate checklist

## Scope and baseline

Based on independently Chromium-accepted 1.33.0.62 source; **1.33.0.62 was not published and did not run the final GitHub gate**. 1.33.0.63 includes its atomic import/branding fix, unchanged, plus narrowly targeted recovery flags for 13 structural New Tab save call sites. The protected `DEVELOPER-GUIDE.md` must remain SHA-256 `e18406e412a7ab2132d47aaa1511b305756e7944e51050b31459d753ca2e593e`.

## Confirmed baseline defect

In the 1.33.0.62 source, actual `createFolderFromShortcuts()` mutates `state.shortcuts` before `saveState()`. A simulated rejected persistence write leaves a ghost folder in the open tab; an unrelated settings save subsequently commits that ghost. Test harness result saved in Stage 2C evidence; five of six new tests fail on the .62 baseline and pass on the .63 candidate.

## Acceptance

1. Failed folder creation/rename/reorder/group/ungroup must re-adopt latest durable state; a later unrelated save must not publish a ghost.
2. An ambiguous commit (write succeeded but Promise rejected) must re-adopt what actually committed, without reverting another tab.
3. A failed recovery read must block unrelated later writes until the durable state can be read.
4. Normal settings drafts must retain their existing semantics; import, Sync/Recovery schema, permissions and translations remain unchanged.
5. All automated tests, package contracts, deterministic clean-room rebuild, real-browser fault injection and six GitHub jobs for the final 1.33.0.63 commit must pass before publication.

## Known gaps

The initial Stage 2C evidence is a source-handler VM harness, **not installed-browser UI proof**. Workspace name/Space-toggle direct commits and certain settings/cache flows are not part of this narrow patch. Firefox injected failures and actual receiving-device Sync remain unverified.

# MosaicSync 1.33.0.45 publication notes

Neofix stage 1 is a small corrective over the published 1.33.0.44 baseline. No visual changes or new browser permissions.

## Firefox Add-ons / Chrome Web Store changelog

Fixes a setup problem on some Chromium-based browsers that prevented MosaicSync from communicating with its background service. Backup-import errors now explain browser storage limits and how to try a smaller backup without losing your current layout.

## Mozilla Notes to Reviewer

The single production messaging change adapts `runtime.onMessage` responses at `src/shared/background/background-core.js` from a returned Promise to the backward-compatible `sendResponse(value)` and `return true` callback channel. This addresses older Chrome/Chromium behavior, including forks that do not support Promise-returning message listeners. The command dispatcher, sender checks, serialized Sync work, storage operations and action semantics are unchanged. The callback channel is opened only for recognized MosaicSync messages, not for foreign senders or unrelated message types. Async failures resolve to explicit `{ok:false,error}` replies rather than leaving the channel unanswered.

All 33 source locale catalogs update the existing `profileImportStorageFull` message to explain browser-allocated extension storage limits, rather than falsely implying that freeing disk space always helps. The wording advises exporting a backup of the current layout before deleting custom images/wallpapers. Existing quota classification and atomic import handling are unchanged.

Tests include red-before-green callback-only production background scenarios for Chromium and Firefox-shaped adapters; full inherited Sync/Recovery tests remain in the suite. No additional required/optional permissions, host permissions, CSP, telemetry, schema migration or Sync/Recovery format changes. Actual browser smoke results must be reported separately.

## GitHub release title

`MosaicSync 1.33.0.45`

## GitHub description

- Restores first-run setup and background communication on Chromium engines that require callback-based extension messaging.
- Improves storage-limit guidance for imported profiles in all 33 languages; existing layouts remain protected.
- Preserves permissions, Sync/Recovery storage formats and the existing interface. No unrelated refactoring.

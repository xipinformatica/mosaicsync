# MosaicSync 1.30.18.29 publication notes

## Mozilla Developer Hub changelog

Completes a proof-driven internal dead-code retirement pass. Removes only two unreachable/unused implementation leftovers and adds deterministic runtime-reachability auditing; product behavior and data formats are unchanged.

## Notes to Reviewer

1.30.18.29 is Step 5.3 and begins from the manually validated 1.30.18.28 runtime.

The production deletion is deliberately tiny. `background-core.js` contained an uncalled private `workspaceAllowsAutoIcons()` helper left behind after the favicon recovery policy evolved to the broader `shortcutAllowsFaviconRecovery()` path. The latter already owns both workspace-aware automatic favicon recovery and explicit user-selected favicon preference recovery. The old helper had no production caller. `core/concurrency.js` also imported `settingsRecordEqual` without using it. Those are the only production leftovers removed.

A deterministic `npm run reachability` audit now verifies shared module reachability from real background/HTML runtime roots and separately reports unused named imports/private functions. Exported test/reference helpers are reviewed but are not automatically deleted.

Generated Firefox and Chromium regression coverage confirms that inactive Work-space automatic favicon recovery still works and that explicit favicon preference rehydration still works with automatic site icons disabled.

No New Tab startup/first-paint behavior, Frequently Visited behavior, Settings orchestration, Sync, Recovery, storage schema, permission, CSP, locale or browser-adapter behavior changes.

## Chrome Web Store release notes

Internal maintainability cleanup only. Retires two proven-unused implementation leftovers and adds runtime-reachability auditing. No feature, permission or synchronized-data-format change.

## GitHub release title

`MosaicSync 1.30.18.29`

## GitHub release description

MosaicSync 1.30.18.29 completes Step 5.3 with a proof-driven dead-code retirement pass on the manually validated 1.30.18.28 baseline.

Only two production leftovers are removed: an uncalled private favicon eligibility helper superseded by the existing canonical recovery policy, and an unused named import in the concurrency module. A new deterministic reachability audit distinguishes high-confidence dead implementation from intentionally retained test/reference exports.

Generated Firefox and Chromium regressions preserve both inactive Work-space automatic favicon recovery and explicit manual favicon preference recovery when automatic site icons are disabled.

No product feature, UI behavior, permission, CSP, schema, persisted payload, locale, first-paint/cache, Frequently Visited, Sync, Recovery or browser-adapter behavior changes.

## GitHub Desktop commit

**Summary:** `Release MosaicSync 1.30.18.29`

**Description:** Complete Step 5.3 with reachability-proven dead-code retirement and generated-browser favicon preservation coverage.

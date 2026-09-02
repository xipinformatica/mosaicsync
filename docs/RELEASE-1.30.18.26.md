# MosaicSync 1.30.18.26 publication notes

## Mozilla Developer Hub changelog

Advances the final maintainability phase with a narrow internal New Tab responsibility extraction. Browser behavior, permissions and data formats are unchanged.

## Notes to Reviewer

This is a zero-feature Step-5.2 maintainability release built from certified 1.30.18.25.

The only production responsibility moved is deterministic background-color conversion/normalization used by the Settings color picker. Those pure helpers now live in `src/shared/newtab/appearance-color.js`. Their 1.30.18.25 expressions are pinned by direct equivalence tests, and the generated Firefox and Chromium copies are both executed by the regression suite.

All DOM/event orchestration remains in `newtab.js`, including pointer handling, live Settings preview, persistence/debounce and page repaint ordering. Startup/first-paint/cache ownership, Frequently Visited, favicon handling, Sync, Recovery, browser adapters, permissions, CSP, schemas and persisted data are unchanged.

## Chrome Web Store release notes

Internal maintainability refinement only: isolates deterministic New Tab color-conversion helpers without changing UI behavior, permissions or synchronized data formats.

## GitHub release title

`MosaicSync 1.30.18.26`

## GitHub release description

MosaicSync 1.30.18.26 advances Step 5.2 with one deliberately narrow responsibility extraction from the canonical shared New Tab implementation.

Pure background-color conversion and normalization now have an explicit browser-neutral owner. The extraction preserves the exact 1.30.18.25 expressions and is covered directly plus through both generated browser runtimes. DOM/event handling, Settings live preview and persistence sequencing remain in the New Tab orchestrator.

No feature, UI behavior, permission, CSP, schema, persisted payload, locale, first-paint/cache, favicon, Sync, Recovery or browser-adapter behavior changes.

## GitHub Desktop commit

**Summary:** `Release MosaicSync 1.30.18.26`

**Description:** Advance Step 5.2 with a pure New Tab appearance-color responsibility extraction and generated-browser equivalence coverage.

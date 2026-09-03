# MosaicSync 1.30.18.28 publication notes

## Mozilla Developer Hub changelog

Corrects the withdrawn 1.30.18.26 internal maintainability refactor while keeping product behavior unchanged. Pure New Tab color conversion/normalization now has a dedicated shared owner without changing any existing caller contract.

## Notes to Reviewer

1.30.18.28 is rebuilt from the safe production implementation restored by 1.30.18.27 (code-equivalent to 1.30.18.25 apart from release identity). It does not continue from the withdrawn 1.30.18.26 source.

The only production responsibility moved is deterministic background-color conversion/normalization used by the New Tab Settings color picker. The historical helper signatures remain unchanged: `normalizeHexColor(value)` and `hexToRgb(hex)` still take one argument. The new browser-neutral owner imports the existing pure `validHex` validator itself, so no New Tab call site has to inject a dependency.

A new permanent regression was first run against the withdrawn 1.30.18.26 implementation and fails there. It executes the exact generated Firefox and Chromium color-swatch initialization block that previously threw synchronously before Settings click wiring and final New Tab `loadState()` startup. The same regression passes on 1.30.18.28.

All DOM/event orchestration remains in `newtab.js`, including Settings live preview/persistence, pointer handling and repaint sequencing. Frequently Visited, startup/first-paint/session caches, favicon handling, Sync, Recovery, storage, permissions, CSP, schemas, locales and browser adapters are unchanged.

## Chrome Web Store release notes

Corrective internal maintainability release. Preserves the existing New Tab color-helper interface and adds generated-browser startup coverage for the regression that caused the withdrawn 1.30.18.26 release. No feature, permission or data-format change.

## GitHub release title

`MosaicSync 1.30.18.28`

## GitHub release description

MosaicSync 1.30.18.28 safely resumes Step 5.2 from the rollback baseline restored in 1.30.18.27.

The release isolates only deterministic New Tab background-color conversion/normalization while preserving the exact historical function contracts used by every existing caller. A new generated Firefox/Chromium startup regression reproduces the failure boundary from withdrawn 1.30.18.26 and proves the synchronous color-swatch pass completes before Settings wiring and final startup proceed.

No product feature, UI design, permission, CSP, schema, persisted payload, locale, first-paint/cache, favicon, Sync, Recovery, storage or browser-adapter behavior changes.

## GitHub Desktop commit

**Summary:** `Release MosaicSync 1.30.18.28`

**Description:** Correct Step 5.2 appearance-color extraction from the safe rollback baseline and add generated-browser startup regression coverage for withdrawn 1.30.18.26.

> **INTERNAL CANDIDATE — not a public MosaicSync release.** Superseded by public 1.27.8.9.

# MosaicSync 1.27.8.8 QA / final release checklist

## Release identity
- [x] Firefox manifest version = `1.27.8.8`.
- [x] Chrome manifest version + `version_name` = `1.27.8.8`.
- [x] Shared `VERSION`, visible Settings/New Tab label, README, CHANGELOG, build manifest, package-size baseline and package filenames = `1.27.8.8`.
- [x] Public changelog sequence jumps from `1.27.7` to `1.27.8.8`; `1.27.8` through `1.27.8.7` are internal/unpublished candidates.
- [x] State schema remains 18; Sync record schema remains 10; local Sync bookkeeping meta schema remains 12.

## Complete-profile Sync recovery
- [x] Trusted snapshots carry Personal + Work in one verified root-last generation and retain the previous complete generation.
- [x] Fresh bootstrap cannot become ready from Personal alone; valid zero-record Work is distinct from missing/torn Work.
- [x] Local edits created while waiting for the full profile are preserved and merged by existing deterministic record clocks.
- [x] Trusted complete snapshots can repair torn Work compatibility data while preserving newer visible records.
- [x] Half-restored devices without an applied Work/profile baseline cannot publish a temporary blank Work view as complete recovery data.

## New Tab critical path
- [x] Launcher-only critical CSS remains the only blocking runtime stylesheet.
- [x] Authoritative local-state I/O starts before the main module graph consumes it.
- [x] Exact bootstrap-grid matches are adopted in place; uncertainty falls back to the established renderer.
- [x] Closed folders hydrate only visible mosaic artwork first; hidden artwork warms later in bounded yielding chunks with mutation guards.
- [x] Startup timing/long-task diagnostics remain local, ephemeral and bounded.
- [x] Frequently Visited Show/Count intent synchronizes while actual browser data, hidden-site data and optional permission remain local.
- [x] Light/Dark wallpaper preview stays isolated while Settings is open.
- [x] Shortcut hover remains paint-only (`scale(1.045)` / `brightness(1.065)`) with no grid reflow.

## Firefox white-pill / deferred CSS isolation
- [x] New Tab startup schedules no automatic `newtab-secondary.css` insertion.
- [x] First MosaicSync-logo hover never calls `ensureSecondaryStyles()` and the mascot animation remains functional from critical CSS.
- [x] Global `button/input/select` font normalization and button color inheritance are present in critical CSS before first paint.
- [x] Visible top-level shortcut/folder color-tag variables and rendering are critical-owned.
- [x] Secondary CSS contains no launcher `.edit-chip` rule and no top-level `.tile[data-color-tag]` / `.folder-mosaic-cell[data-color-tag]` rules.
- [x] Brand `@keyframes` are critical-only and absent from secondary CSS.
- [x] Deferred Sync-tooltip width styling is scoped to `.settings-dialog`; launcher Sync tooltip remains critical-owned.
- [x] Website Access prompt remains fully critical-styled because it can appear automatically.
- [x] Secondary UI (Settings, Bookmarks, editor, folder/drop UI, Frequently Visited context menu, toast) still waits for packaged secondary CSS before visibility.
- [x] Bootstrap/adoption DOM contract is unchanged from 1.27.8.7.

## Localization / language audit
- [x] All 32 MosaicSync UI locale catalogs present in both browser runtime trees.
- [x] Every locale has the same UI key set as English, all values non-empty and placeholders matching English.
- [x] All 32 manifest `_locales` catalogs present for both browsers with non-empty localized strings.
- [x] Chrome/Firefox platform-branding regression checks pass.
- [x] Hardcoded-English regression checks pass.
- [x] 1.27.8.8 adds no new translatable user-facing string.

## Security / packaging
- [x] No new permission, host permission, telemetry, remote code or CSP relaxation.
- [x] No state/Sync/profile schema increase for this rendering correction.
- [x] Full automated test suite passes.
- [x] Performance benchmark passes.
- [x] Firefox and Chrome ZIPs inspected directly for exact 1.27.8.8 identity and deferred-style behavior.
- [x] GitHub-ready source clean rebuild reproduces packaged browser ZIPs byte-for-byte.
- [x] SHA-256 checksums recorded.

## Real-hardware acceptance
- [ ] Firefox: New Tab startup shows no transient white pill.
- [ ] Firefox: first MosaicSync-logo hover shows mascot with no transient white pill.
- [ ] Firefox: first opening of Settings / other secondary UI shows no transient launcher pill.

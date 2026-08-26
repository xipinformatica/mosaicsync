> **INTERNAL CANDIDATE — not a public MosaicSync release.** Superseded by public 1.27.8.9.

# MosaicSync 1.27.8.7 QA / final release checklist

## Release identity
- [x] Firefox manifest version = `1.27.8.7`.
- [x] Chrome manifest version + `version_name` = `1.27.8.7`.
- [x] Shared `VERSION`, visible Settings/New Tab label, README, CHANGELOG, build manifest, package-size baseline and package filenames = `1.27.8.7`.
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

## Localization / language audit
- [x] All 32 MosaicSync UI locale catalogs are present in both Firefox and Chrome runtime trees.
- [x] Every locale contains the same 406 UI keys as English; all values are non-empty and every placeholder set matches English.
- [x] All 32 manifest `_locales` catalogs are present for both browsers and contain non-empty localized manifest strings.
- [x] Chrome platform-branding regression checks pass, including the expanded EU-language catalogs; Firefox/Mozilla-specific wording is not leaked into Chrome output where platformization applies.
- [x] Dynamic New Tab/toast/status paths pass the hardcoded-English regression checks.
- [x] The 1.27.8.7 startup-style correction introduces no new translatable user-facing copy, so no locale catalog needed a new key for this patch.

## Firefox startup-pill lifecycle fix
- [x] `secondary-style-bootstrap.js` schedules no `requestAnimationFrame`, timer or automatic stylesheet insertion on New Tab startup.
- [x] Merely executing the loader and advancing frames cannot create `#mosaicsyncSecondaryStyles`.
- [x] First secondary-UI demand creates exactly one `newtab-secondary.css` link; concurrent/repeated demands are idempotent.
- [x] Settings, Bookmarks, shortcut editor, folder popover, drop-choice menu, Frequently Visited context menu, toast and brand animation wait for secondary CSS before becoming visible.
- [x] Automatically surfaced Website Access prompt styling lives in critical CSS and does not force secondary CSS during permission reconciliation.
- [x] `.settings-button`, `.bookmarks-button`, `.space-button`, `.add-slot`, `.edit-chip` and `.empty-ghost-tile` suppress native appearance in critical CSS.
- [x] Bootstrap empty-slot/edit-control structural adoption remains unchanged for clean root-cause isolation.
- [ ] Real-hardware confirmation that the previously reproducible Firefox startup pill is gone.

## Final validation
- [x] `npm test`: **473/473 tests pass** on the final identity.
- [x] `npm run bench`: completed successfully on the final identity.
- [x] Deterministic Firefox/Chrome packages rebuilt, opened and inspected from the final source; clean-source rebuilds are byte-for-byte identical.
- [x] No new permissions, host permissions, CSP relaxation, telemetry, remote code or external service.

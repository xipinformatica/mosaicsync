> **INTERNAL CANDIDATE — not a public MosaicSync release.** Superseded by public 1.27.8.9.

# MosaicSync 1.27.8.8 publication notes

## Mozilla Developer Hub — concise changelog

Improves whole-profile Sync recovery and New Tab startup reliability/performance. Personal + Work now recover as one verified profile with previous-generation fallback, safe fresh-device waiting/merge behavior, and Work self-repair. New Tab keeps its fast critical launcher path while eliminating the Firefox one-time white-pill trigger: first logo hover no longer loads secondary CSS, and deferred CSS is isolated from already-painted launcher controls. Also improves wallpaper preview isolation, Frequently Visited preference Sync and shortcut hover. No new permissions.

## Mozilla — Notes to Reviewer

MosaicSync 1.27.8.8 combines a Sync consistency/recovery release with a focused New Tab startup/render-lifecycle hardening pass. There are no new permissions, host permissions, remote code, telemetry, analytics service or CSP relaxation.

### Sync/recovery

The existing synchronized shortcut/settings record schema remains version 10 and keeps the same per-record conflict/tombstone behavior. 1.27.8.8 extends the existing bounded, gzip-compressed, root-last device snapshot transport so a trusted complete generation contains both Personal and Work. The immediately previous verified complete generation is retained as fallback if Firefox/Chromium exposes a newer root before all of its chunks are usable.

Fresh bootstrap no longer becomes `ready` from Personal alone. It requires either a verified complete Personal+Work safety generation or independently usable Personal and Work compatibility ledgers. An explicitly valid zero-record Work dataset remains a legitimate empty Space; missing/torn Work does not. Local shortcuts created while waiting are preserved and merged through the existing deterministic record clocks when the complete incoming profile arrives. A verified complete profile may also repair torn Work compatibility data while preserving newer visible records through the same conflict rules. A half-restored device with no applied Work/profile baseline is prevented from publishing its temporary blank Work view as a complete recovery source. Legacy Personal-only safety snapshots remain readable but do not gain complete-profile repair authority.

State schema remains 18, synchronized record schema remains 10, and local Sync bookkeeping meta schema remains 12.

### Localization

This release adds no new translatable user-facing copy for the 1.27.8.8 Firefox rendering correction. All 32 UI locale catalogs and all 32 manifest locale catalogs are nevertheless revalidated in both browser builds for identical key coverage, non-empty values, placeholder parity, platform-branding rules and hardcoded-English regressions.

### New Tab critical path

New Tab blocks only on the launcher critical stylesheet rather than the historical monolithic sheet. Authoritative `storage.local` I/O starts from a tiny classic bootstrap before the main module graph consumes it. When the disposable first-frame grid exactly matches authoritative state, MosaicSync adopts it in place; any mismatch falls back to the established renderer. Closed folders hydrate only the first four visible mosaic artworks initially, while hidden artwork is warmed later in bounded yielding chunks with mutation guards. Startup paint/long-task timing remains local and ephemeral only.

Frequently Visited Show/Count are synchronized profile preferences, while actual Top Sites/history data, hidden-site data and the optional browser permission remain device-local and user-gesture-controlled. Separate Light/Dark wallpaper changes continue to paint through the isolated preview surface while Settings is open. Shortcut hover remains paint-only (`scale(1.045)` / `brightness(1.065)`) and does not change grid geometry.

### Firefox white-pill root-cause correction

Earlier internal 1.27.8.x candidates inserted `newtab-secondary.css` after startup. Internal 1.27.8.7 removed the automatic startup insertion, and real-hardware testing produced the decisive observation: New Tab startup became clean, but the same white rounded artifact appeared exactly once when the MosaicSync logo was hovered for the first time. That hover unnecessarily called the on-demand secondary-style loader; later logo hovers were clean because the stylesheet had already been attached.

1.27.8.8 removes that dependency. The MosaicSync mascot and brand animation are fully owned by `newtab-critical.css`; logo hover never calls the secondary stylesheet loader.

The deferred stylesheet is also isolated from the already-painted launcher. The following rules now exist before first paint in critical CSS rather than arriving later: global `button, input, select { font: inherit }`, `button { color: inherit }`, top-level shortcut/folder-mosaic color-tag variables and visible tag rendering, and the light-theme launcher edit-chip styling. Brand keyframes are removed from secondary CSS. The remaining generic Sync-help tooltip width override is scoped to `.settings-dialog`, so it cannot alter the launcher Sync tooltip when secondary CSS first loads.

`secondary-style-bootstrap.js` remains an idempotent packaged-only loader and schedules no `requestAnimationFrame`, timer or automatic stylesheet insertion merely because New Tab opened. Secondary UI entry paths wait for it before visibility: Settings, Bookmarks, shortcut editor, folder popover, drag/drop choice menu, Frequently Visited context menu and toast feedback. The automatically surfaced Website Access prompt remains fully critical-styled.

The bootstrap/adoption DOM structure is intentionally unchanged. This keeps the fix focused on the now-observed stylesheet-activation trigger rather than mixing in a second DOM experiment.

### Security / compatibility

No synchronized shortcut/settings schema or profile import semantics changed. HTTP(S)-only navigation, CSP, image/SVG validation, bounded caches, local-asset handling, concurrency rules and existing browser parity remain intact. No telemetry or remote code was added.

## Chrome Web Store — release note

Improves Personal + Work Sync recovery and New Tab startup reliability. Also hardens deferred New Tab styling so secondary UI activation cannot restyle the already-painted launcher, while preserving the Firefox-style tile hover, wallpaper preview isolation and Frequently Visited preference Sync. No new permissions.

## GitHub commit title

`Release MosaicSync 1.27.8.8 — complete-profile Sync + Firefox render lifecycle hardening`

## GitHub commit description

Internal 1.27.8.8 candidate. Includes complete Personal+Work Sync recovery/fallback work, New Tab critical-path performance improvements, wallpaper/Frequently Visited/hover refinements, and the final Firefox one-time white-pill correction. Internal 1.27.8 through 1.27.8.7 were unpublished candidates. The 1.27.8.8 rendering fix removes the logo's unnecessary secondary-CSS activation and makes deferred CSS launcher-isolated without changing the bootstrap DOM contract. No new permissions, telemetry, remote code or CSP relaxation.

## GitHub release title

`MosaicSync 1.27.8.8`

## GitHub release description

MosaicSync 1.27.8.8 was an internal candidate toward public 1.27.8.9. It ships the complete-profile Personal+Work Sync recovery work and the 1.27.8 New Tab performance architecture, plus a final Firefox render-lifecycle correction validated by real-hardware behavior: the transient white pill moved from startup to the exact first logo hover that attached secondary CSS. The logo no longer loads that sheet, and deferred CSS can no longer alter already-painted launcher controls through global form rules, edit-chip/color-tag ownership, brand keyframes or an unscoped Sync-tooltip rule. The bootstrap DOM contract is unchanged. No new permissions.

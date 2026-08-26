> **INTERNAL CANDIDATE — not a public MosaicSync release.** Superseded by public 1.27.8.9.

# MosaicSync 1.27.8.7 publication notes

## Mozilla Developer Hub — concise changelog

Improves whole-profile Sync recovery and New Tab startup reliability/performance. Personal + Work now recover as one verified profile with previous-generation fallback, safe fresh-device waiting/merge behavior, and Work self-repair. New Tab uses a smaller critical path, visible-first artwork hydration and on-demand secondary UI CSS; Firefox no longer receives a deliberate post-first-paint stylesheet recascade. Also improves wallpaper preview isolation, Frequently Visited preference Sync and shortcut hover. No new permissions.

## Mozilla — Notes to Reviewer

MosaicSync 1.27.8.7 combines a Sync consistency/recovery release with a focused New Tab startup architecture pass. There are no new permissions, host permissions, remote code, telemetry, analytics service or CSP relaxation.

### Sync/recovery

The existing synchronized shortcut/settings record schema remains version 10 and keeps the same per-record conflict/tombstone behavior. 1.27.8.7 extends the existing bounded, gzip-compressed, root-last device snapshot transport so a trusted complete generation contains both Personal and Work. The immediately previous verified complete generation is retained as fallback if Firefox/Chromium exposes a newer root before all of its chunks are usable.

Fresh bootstrap no longer becomes `ready` from Personal alone. It requires either a verified complete Personal+Work safety generation or independently usable Personal and Work compatibility ledgers. An explicitly valid zero-record Work dataset remains a legitimate empty Space; missing/torn Work does not. Local shortcuts created while waiting are preserved and merged through the existing deterministic record clocks when the complete incoming profile arrives. A verified complete profile may also repair torn Work compatibility data while preserving newer visible records through the same conflict rules. A half-restored device with no applied Work/profile baseline is prevented from publishing its temporary blank Work view as a complete recovery source. Legacy Personal-only safety snapshots remain readable but do not gain complete-profile repair authority.

State schema remains 18, synchronized record schema remains 10, and local Sync bookkeeping meta schema remains 12.

### Localization

This release adds no new translatable user-facing copy for the startup-style correction. All 32 UI locale catalogs and all 32 manifest locale catalogs were nevertheless revalidated in both browser builds: identical 406-key coverage, non-empty values, placeholder parity, platform-branding checks and hardcoded-English regression coverage all pass.

### New Tab critical path

New Tab now blocks on a launcher-only critical stylesheet rather than the historical monolithic sheet. Authoritative `storage.local` I/O starts from a tiny classic bootstrap before the main module graph consumes it. When the disposable first-frame grid exactly matches the authoritative state, MosaicSync adopts it in place; any mismatch falls back to the established renderer. Closed folders hydrate only the first four visible mosaic artworks initially, while hidden artwork is warmed later in bounded yielding chunks with mutation guards. Startup paint/long-task timing remains local and ephemeral only.

Frequently Visited Show/Count are synchronized profile preferences, while actual Top Sites/history data, hidden-site data and the optional browser permission remain device-local and user-gesture-controlled. Separate Light/Dark wallpaper changes continue to paint through the isolated preview surface while Settings is open. Shortcut hover remains paint-only (`scale(1.045)` / `brightness(1.065)`) and does not change grid geometry.

### Firefox startup-pill fix

Earlier internal 1.27.8.x candidates deliberately inserted `newtab-secondary.css` after two animation frames. Real-hardware testing showed a brief white rounded artifact could still appear during Firefox startup. The final 1.27.8.7 removes that unsolicited CSSOM mutation entirely.

`secondary-style-bootstrap.js` is now only an idempotent `__mosaicsyncEnsureSecondaryStyles()` provider. It schedules no `requestAnimationFrame`, timer or automatic stylesheet insertion merely because a New Tab opened. Launcher-reachable secondary surfaces wait for the packaged secondary stylesheet immediately before they can become visible: Settings, Bookmarks, shortcut editor, folder popover, drag/drop choice menu, Frequently Visited context menu, toast feedback and the brand animation. The automatically surfaced Website Access prompt is fully owned by `newtab-critical.css`, so permission reconciliation does not force a secondary stylesheet insertion during normal startup.

Custom launcher native buttons that exist or may be inserted around first paint also explicitly suppress platform widget appearance in critical CSS (`.settings-button`, `.bookmarks-button`, `.space-button`, `.add-slot`, `.edit-chip`, `.empty-ghost-tile`). The bootstrap/adoption DOM structure itself is intentionally unchanged in this final fix so the stylesheet hypothesis remains isolated for real-hardware verification.

The loader remains CSP-safe and packaged-only: no inline handlers/styles and no remote resource.

Validation on the final source: **473/473 automated tests passing** and the performance benchmark suite completes successfully. New behavioral fake-DOM coverage executes the production loader and proves that startup alone inserts no secondary stylesheet, concurrent/repeated demands create exactly one link, and the launcher-reachable entry paths are gated before visibility.

## Chrome Web Store — release notes

Improves Sync recovery, startup performance and visual stability. Personal and Work now recover as one verified profile with safe previous-generation fallback, fresh-device waiting/merge behavior and Work self-repair. New Tab does less work on the critical path, loads secondary UI styling only when needed, improves wallpaper/Frequently Visited behavior and keeps shortcut hover layout-stable. No new permissions.

## GitHub commit

**Summary:** `Release MosaicSync 1.27.8.7`

**Description:**

Finalize 1.27.8.7 with verified Personal+Work recovery, previous-generation fallback, safe waiting-local merge and Work-ledger repair; retain existing record conflict/tombstone semantics. Complete the New Tab performance pass with critical-only launcher CSS, early local-state I/O, strict bootstrap-grid adoption, visible-first folder artwork and bounded deferred hydration. Remove automatic post-first-paint secondary stylesheet insertion, gate all launcher-reachable secondary UI on the idempotent on-demand loader, keep the automatic Website Access prompt critical-styled, and harden launcher native-button appearance. 473/473 tests pass; benchmark suite passes.

## GitHub release

**Title:** `MosaicSync 1.27.8.7 — Safer Sync, faster and cleaner startup`

**Body:**

MosaicSync 1.27.8.7 strengthens both synchronization recovery and the New Tab startup path.

- Personal and Work now share one verified complete-profile safety generation, with the previous verified generation retained as fallback.
- Fresh devices no longer become ready from Personal alone; missing/torn Work stays waiting instead of silently becoming empty.
- Shortcuts created locally while Sync is still arriving are merged safely when the complete profile appears.
- A trusted complete profile can repair torn Work compatibility data without discarding newer records.
- New Tab starts authoritative local-state I/O earlier, adopts an exact first-frame grid in place, hydrates only visible closed-folder artwork initially, and warms the rest in bounded yielding chunks.
- Frequently Visited Show/Count intent now synchronizes while actual browser data and permissions remain device-local.
- Light/Dark wallpaper preview remains isolated while Settings is open, and shortcut hover is stronger but still paint-only with no layout shift.
- Firefox no longer receives a deliberately delayed secondary stylesheet after first paint. Secondary UI CSS loads only when a secondary surface is actually needed, eliminating the deterministic startup recascade that was the leading cause of the transient white startup pill.
- Automatically surfaced Website Access UI remains critical-styled, and launcher native buttons suppress platform appearance before first paint.
- No new permissions, host permissions, telemetry, remote code or CSP relaxation.

Validation: **473/473 automated tests passing** plus the performance benchmark suite.

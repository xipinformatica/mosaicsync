# MosaicSync 1.27.8.9 publication notes

## Mozilla Developer Hub — concise changelog

Improves complete Personal + Work Sync recovery, New Tab startup performance and Firefox rendering stability. Fixes the one-time white startup pill without breaking the MosaicSync hello mascot; prevents Light mode from briefly painting Dark tiles; keeps Settings stable while Separate Light/Dark Wallpapers or first-time Frequently Visited changes persist; fixes drag/drop localization; and improves general favicon quality ranking so oversized manifest/touch assets do not automatically displace a better conventional favicon. No new permissions.

## Mozilla — Notes to Reviewer

MosaicSync 1.27.8.9 is the public successor to 1.27.7. Versions 1.27.8 through 1.27.8.8 were internal/unpublished development candidates. This release combines the reviewed 1.27.8 complete-profile Sync/startup work with the final corrective lifecycle fixes found during real-hardware Firefox testing. There are no new permissions, host permissions, remote code, telemetry, analytics services or CSP relaxations.

### Sync/recovery

The synchronized shortcut/settings record schema remains version 10 and keeps the existing deterministic per-record conflict/tombstone behavior. A trusted safety generation now contains both Personal and Work, with the immediately previous verified complete generation retained as fallback. Fresh bootstrap cannot become ready from Personal alone: MosaicSync requires either a verified complete Personal+Work profile generation or independently usable Personal and Work compatibility data. A valid zero-record Work dataset remains a legitimate empty Space; missing/torn Work does not.

Local edits made while waiting are merged through the existing record clocks once the complete profile arrives. A trusted complete profile can repair torn Work compatibility data while preserving newer visible records. A half-restored device without an applied Work/profile baseline cannot publish a temporary blank Work view as a complete source. Legacy Personal-only safety snapshots remain readable but do not gain complete-profile repair authority.

State schema remains 18, synchronized record schema remains 10, and local Sync bookkeeping meta schema remains 12.

### New Tab startup and Firefox white-pill lifecycle

New Tab blocks only on launcher-critical CSS. Authoritative `storage.local` I/O is started before the main module graph consumes it, matching bootstrap state may be adopted in place, closed folders hydrate visible mosaic artwork first, and hidden artwork warms later in bounded yielding work.

Internal 1.27.8.x testing isolated a Firefox transient white rounded artifact to post-first-paint activation of `newtab-secondary.css`. The final architecture performs no automatic startup stylesheet insertion. Logo hover never requests deferred CSS, and launcher-affecting global form normalization, color tags, edit-chip styling, Sync-tooltip ownership and brand animation styling are critical-owned. Secondary UI loads the packaged deferred stylesheet only immediately before that UI becomes visible.

Internal 1.27.8.8 correctly removed the pill but accidentally left the mascot animation selectors referring to missing `@keyframes`. 1.27.8.9 restores `brand-hello-pop` and `brand-easter-wave` to critical CSS. The mascot works again without reintroducing deferred stylesheet loading on logo hover.

### First-frame Light mode

The tiny `appearance-bootstrap.js` already used a disposable local appearance hint to choose the initial page color. It now also sets `data-effective-theme` synchronously from that same resolved Light/Dark hint before the first launcher paint. Critical Light variables therefore apply to tiles and controls immediately rather than after the main module reconciles authoritative storage. The hint remains non-authoritative; browser storage still wins after startup.

### Settings-open render lifecycle

Real Firefox/Linux testing showed two apparently different Settings failures with the same symptom: Separate Light/Dark Wallpapers and first-time Frequently Visited changes persisted successfully but the still-open Settings surface could become white/stuck until reopened.

The underlying lifecycle is now handled at the external-state reconciliation boundary. MosaicSync may continue to adopt incoming `storage.local`/Sync-style state while Settings is open, but asynchronous launcher/root commits and grid rebuilds are deferred rather than being painted behind the open fixed dialog. Wallpaper feedback continues through the isolated appearance-preview layer. Pending external launcher work is coalesced and committed once on the animation frame after Settings closes. Intentional Settings controls such as grid and tile-size changes still preview live; this is not a blanket `applySettings()`/`render()` ban. Cross-tab ordering changes, deferred Recent-mode renders, import reconciliation and Sync wait-state transitions use the same guarded path. The older blanket own-write suppression is not restored, so legitimate device-local favicon/cache updates remain observable.

Theme-button transitions retain their dedicated live theme-skin path so the Settings UI itself can still preview the chosen appearance.

### Localization

The drag/drop choice UI now refreshes all four dynamic strings through `t()` whenever it opens: Move here, Switch their positions, Create folder and Put both shortcuts together. This removes dependence on the initial static-document localization pass. All 32 UI locale catalogs and all 32 manifest locale catalogs are validated for complete key coverage, non-empty strings, placeholder parity, browser-branding rules and hardcoded-English regressions.

No new user-facing translation key was required.

### Favicon selection

The automatic resolver and manual detected-favicon chooser continue to use the existing bounded network/image/SVG validation pipeline. Candidate selection no longer treats icon size as an unbounded quality signal. Resolution reward saturates once artwork is sufficiently large for a tile; candidate provenance and geometry then contribute to suitability. Standard favicon/link artwork is preferred over unrelated app/tile/mask assets once both are sufficiently sharp, strongly non-square images are penalized, and a genuinely tiny legacy favicon can still be upgraded by suitable high-resolution artwork.

There are no host-specific or `google.com` special cases. Existing remote-image byte/dimension limits, safe SVG rasterization, timeouts, concurrency limits, cache bounds and permission checks remain unchanged.

### Security / compatibility

No Sync/profile schema increase, permission change, navigation-policy change, profile-import relaxation, CSP change, telemetry or remote code was introduced. HTTP(S)-only navigation, image/SVG safety, storage/cache bounds, local artwork rules and Firefox/Chrome parity remain intact.

## Chrome Web Store — release note

Improves complete Personal + Work Sync recovery, New Tab startup, Settings stability, Light-mode first paint, drag/drop localization and favicon quality selection. Also restores the MosaicSync hello mascot while preserving the deferred-CSS fix for Firefox's transient white pill. No new permissions.

## GitHub commit title

`Release MosaicSync 1.27.8.9 — recovery, Settings lifecycle and first-frame fixes`

## GitHub commit description

Public 1.27.8.9 release and direct successor to 1.27.7. Includes the complete Personal+Work Sync recovery and New Tab performance work developed through internal 1.27.8.x candidates, plus the final corrective fixes: restored critical-only mascot animation, deterministic Light first paint, Settings-open launcher commit deferral for wallpaper/Frequently Visited stability, complete drag-choice localization, and provenance/geometry-aware favicon suitability. Internal 1.27.8 through 1.27.8.8 were unpublished candidates. No new permissions, telemetry, remote code or CSP relaxation.

## GitHub release title

`MosaicSync 1.27.8.9`

## GitHub release description

MosaicSync 1.27.8.9 is the public successor to 1.27.7. It ships complete-profile Personal+Work Sync recovery, the optimized New Tab critical path and the real-hardware Firefox rendering corrections developed through the internal 1.27.8.x candidates. The transient white pill remains eliminated and the hello mascot works again; Light mode is correct from the first frame; asynchronous state reconciliation no longer performs full launcher/root commits behind open Settings while direct Settings previews remain live; drag/drop text is localized at use time; and favicon ranking values suitability rather than raw size. No new permissions.

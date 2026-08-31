# MosaicSync 1.30.18.6 publication notes

## Mozilla Developer Hub changelog

Fixes the remaining Work-space first-paint gap for Frequently Visited by carrying the same validated cached sites through the fast startup layers without authorizing the Work shortcut grid early. Sync-storage reporting now separates layout/settings, recovery safety copies, shortcut images and metadata/cleanup, with progressive near-quota warnings and a clear local-safety message when essential Sync cannot publish. Also establishes one versioned first-paint contract and centralized cache refresh path for the maintainability program. No normal Sync/profile schema, permission, CSP, telemetry or backend change.

## Notes to Reviewer

1.30.18.6 is a zero-feature maintainability-foundation release with two user-facing correctness/clarity changes.

First, Frequently Visited is browser-global presentation data rather than Work-space layout data. Previous fast startup intentionally kept the Work shortcut grid behind an authoritative safety gate, but that restriction also prevented the already-validated cached Frequently Visited cards from painting in Work, producing an empty-then-populated flash. The first-paint contract now carries the bounded Frequently Visited snapshot independently of the Work grid. Work shortcut navigation/layout remains gated exactly as before.

Second, Sync quota reporting now classifies browser-native `storage.sync` usage into layout/settings, complete recovery safety copies, synchronized shortcut artwork and metadata/cleanup overhead. It warns at 25 KiB and 10 KiB free thresholds and distinguishes recovery/artwork/storage-limited states. An essential quota failure explicitly tells the user that recent changes remain on the current device until capacity is available. This changes presentation only; the existing quota-protection/priority behavior is unchanged.

For maintainability, the localStorage render manifest and browser.session acceleration snapshot now share one explicit first-paint projection for active Space state, Multiple Spaces enablement, sanitized Space labels and the bounded Frequently Visited snapshot. Cache creation/refresh uses the same projection rules, the disposable format is versioned, and a read-only bridge accepts 1.30.18.5 entries for one release so upgrade first paint stays continuous. `docs/ARCHITECTURE.md` documents subsystem ownership and the staged consolidation rules.

All new UI text is localized across the complete locale set. No synchronized/profile schema version, permissions, CSP, remote code, telemetry, analytics or MosaicSync backend behavior changes.

## GitHub release title

`MosaicSync 1.30.18.6`

## GitHub release description

MosaicSync 1.30.18.6 starts the maintainability transition by giving every fast startup layer one shared first-paint truth for Space state and Frequently Visited. Work now keeps cached Frequently Visited continuously visible from the first frame without weakening its shortcut-grid safety gate. Sync storage reporting is also clearer near the browser-native quota, separating core layout, recovery copies, artwork and overhead while warning before essential synchronization is blocked. Existing Sync/recovery schemas, permissions, privacy and security boundaries are unchanged.

## GitHub Desktop

**Summary:** `Release MosaicSync 1.30.18.6`

**Description:** `Unify first-paint state, fix Work Frequently Visited continuity, and clarify Sync quota pressure.`

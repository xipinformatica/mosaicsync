# MosaicSync 1.30.18.18 publication notes

## Mozilla Developer Hub changelog

Fixes a brief New Tab startup layout shift where shortcuts could paint about one row too high and then move down as Frequently Visited appeared. MosaicSync now reserves the configured Frequently Visited geometry synchronously before the shortcut grid paints, while keeping actual browser-history-derived sites and favicons session/device-local. No new features, permissions, Sync/Recovery schema or privacy-boundary changes.

## Notes to Reviewer

This is a focused New Tab first-frame continuity corrective release built from the certified 1.30.18.17 source.

The issue was caused by the synchronous shortcut cache painting while `#frequentSitesSection` still occupied zero layout space. A moment later the session/live Frequently Visited projection committed above the shortcut grid, moving the entire grid downward. With a desktop 10-item FV configuration this late insertion is approximately one shortcut-row stride, making the movement especially visible on the last row.

1.30.18.18 adds a small classic `frequent-geometry-bootstrap.js` before `render-bootstrap.js`. It reads only the already-existing local compatibility hints for Frequently Visited enabled/count and creates invisible, accessibility-hidden placeholder cards using the same responsive FV grid/card geometry. It does not read browser storage areas, Top Sites, tabs, URLs or favicon data. Actual browser-derived sites/titles/URLs/favicons remain session/live-owned.

The existing real FV renderer still prepares cards off-DOM and waits for favicon decoding before atomic commit. The real fragment replaces the reservation and releases its hidden state in the same task. Disabled/empty and missing-permission recovery paths also clear the reservation explicitly.

No state/meta/Sync/Recovery schema, manifest permission, CSP, background architecture, automatic-favicon Sync policy, Frequently Visited browser-history persistence rule, telemetry/backend or product-feature change.

## Chrome Web Store release notes

Fixes a brief New Tab startup layout shift when Frequently Visited is enabled. No new features or permissions.

## GitHub release title

`MosaicSync 1.30.18.18`

## GitHub release description

MosaicSync 1.30.18.18 is a focused first-frame continuity fix.

When Frequently Visited was enabled, the synchronous shortcut cache could paint while the FV section still occupied no space. Once the session/live FV cards finished preparing above it, the whole shortcut grid moved downward. On common desktop layouts the inserted FV geometry is close to one shortcut-row stride, which made the last row visibly jump for a split second.

The New Tab now establishes an invisible FV geometry reservation before the synchronous shortcut painter runs. The reservation is driven only by the existing enabled/count compatibility hints and uses the same responsive card grid, so the shortcut grid begins at its intended vertical coordinate. Actual browser-history-derived FV sites, titles, URLs and favicons remain session/device-local and are not added to the persistent render manifest.

Real FV cards keep MosaicSync's existing detached favicon decode and atomic commit behavior. Disabled FV still occupies no startup space, and permission-recovery/empty states explicitly clear a pending reservation.

No new feature, permission, CSP, state/meta/Sync/Recovery schema, background architecture, automatic-favicon Sync policy, telemetry/backend or browser-history privacy-boundary change.

## GitHub Desktop commit

**Summary:** `Release MosaicSync 1.30.18.18`

**Description:** Fix Frequently Visited first-frame geometry so shortcut rows no longer shift after startup hydration; preserve session-only browser-history data and existing atomic favicon commit behavior.

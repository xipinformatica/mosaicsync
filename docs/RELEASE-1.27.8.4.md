> **INTERNAL CANDIDATE — not a public MosaicSync release.** Superseded by public 1.27.8.9.

# MosaicSync 1.27.8.4 publication notes

## Scope

1.27.8.4 is the third focused New Tab performance/stability pass for older/slower desktop CPUs. It refines the 1.27.8.3 critical-path work by removing duplicated critical CSS from the deferred UI stylesheet, shrinking the blocking launcher stylesheet further, starting authoritative local-state I/O before the large ES-module graph evaluates, and warming hidden folder artwork in bounded idle chunks instead of one delayed bulk read.

The release also fixes the Settings blanking regression triggered by separate Light/Dark wallpaper controls, synchronizes the Frequently Visited Show/Count preference while keeping actual browser-derived sites/history and permission device-local, and makes the paint-only shortcut hover enlargement more noticeable.

There are no new permissions or host permissions, no Sync shortcut/profile/container schema change, no conflict/tombstone change, no CSP relaxation, no telemetry/remote code, and no reduction of URL/image/SVG validation or artwork quality.

## Mozilla Add-ons concise changelog

Performance/stability follow-up for older/slower computers. MosaicSync now uses a smaller launcher-only critical stylesheet plus a truly secondary-only UI stylesheet, starts authoritative local-state I/O before the main module graph evaluates, and hydrates hidden folder artwork in bounded idle chunks. Fixed the Settings blank/white regression when separate Light/Dark wallpaper controls change. Frequently Visited Show/Count now follows the synchronized MosaicSync profile while actual sites/history and the browser permission remain device-local. Shortcut hover enlargement is more noticeable without layout shift. No new permissions, CSP relaxation, telemetry or image-quality reduction.

## Mozilla Notes to Reviewer

This release contains New Tab performance scheduling, one UI/compositor regression fix, one additive settings-Sync behavior change, and a hover-only visual adjustment. It adds no permissions, host permissions, remote code or telemetry and does not change shortcut/profile container schemas or conflict/tombstone semantics.

Key changes:

1. `newtab-critical.css` is reduced to the launcher/Space/grid/background/Frequently Visited/sync shell required for the first frame (~33 KB). `newtab-secondary.css` contains only secondary editor/dialog/settings UI rules (~85 KB). The external packaged `secondary-style-bootstrap.js` appends that secondary sheet after two animation-frame callbacks. No inline handler, remote stylesheet or CSP relaxation is used. The monolithic `newtab.css` remains as reviewed source/reference but is not linked by the New Tab page.
2. New `local-storage-bootstrap.js` starts a frozen four-key authoritative `storage.local.get()` from `<head>` before the large ES-module graph evaluates. `newtab.js` consumes the same Promise/result. Normal materialization, validation and write/concurrency logic are unchanged.
3. Closed-folder hidden artwork remains device-local pixel data only. Child records are authoritative immediately. Deferred artwork now hydrates in bounded chunks with an explicit yield between chunks. Opening a folder triggers immediate folder-specific hydration if necessary. Generation guards prevent an asynchronous artwork result from replacing a newer structural edit.
4. Startup performance diagnostics remain local and ephemeral. 1.27.8.4 adds approximate first-launcher/Perceived Complete Paint stamps and a bounded `PerformanceObserver` long-task window; the observer disconnects and nothing is persisted, messaged or sent over the network.
5. The separate Light/Dark wallpaper Settings path now keeps all real root/page paint-affecting wallpaper/dim values frozen while Settings is open. Changes are shown only on the fixed isolated `appearancePreviewLayer` (including its dim pseudo-overlay) and committed to the real page only after Settings closes. This targets the Firefox compositor failure where dialog descendants could become blank although the setting itself saved.
6. `frequentlyVisitedEnabled` and `frequentlyVisitedCount` are now allow-listed normal settings fields and therefore synchronize with the MosaicSync profile. Actual Top Sites/history results, hidden-domain list and optional `topSites` permission remain device-local. A receiving device with Show=ON but no permission keeps the preference ON and shows the existing Grant permission action; `browser.permissions.request()` remains user-gesture-only. Legacy migration deliberately avoids allowing a default OFF/5 installation to publish a competing default over another computer's meaningful legacy ON/non-default intent.
7. The shortcut hover transform increases to `scale(1.045)` with a slightly stronger brightness filter. It remains transform/filter-only and does not change grid geometry.

Regression coverage includes both Firefox and Chrome for bounded folder hydration, folder-open mutation races, CSS partitioning, pre-module storage-key contract, local-only paint/long-task diagnostics, Settings-open appearance isolation, synchronized Frequently Visited preference semantics and permission behavior, plus the existing full Sync/security/import/image/SVG/concurrency/profile suite.

Final source-tree validation: 455/455 tests passing before packaging; benchmark passed. The GitHub-ready source was then extracted into a blank directory, passed 455/455 tests and the benchmark again, and reproduced the Firefox/Chrome release ZIPs byte-for-byte.

## Chrome Web Store changelog

Faster and smoother New Tab startup on older PCs. Reduced blocking and duplicated CSS work, started local-state I/O earlier, and split hidden folder artwork warming into small idle batches. Fixed separate Light/Dark wallpaper Settings blanking, synchronized the Frequently Visited Show/Count preference while keeping actual browsing data local, and made shortcut hover enlargement more noticeable. No new permissions.

## GitHub Desktop commit

**Summary:** `Release MosaicSync 1.27.8.4`

**Description:** `Refine New Tab startup with secondary-only CSS, pre-module local-state overlap and bounded folder-artwork warming; fix Light/Dark wallpaper Settings blanking; sync Frequently Visited Show/Count intent; and strengthen paint-only shortcut hover.`

## GitHub release

**Title:** `MosaicSync 1.27.8.4 — Faster startup and UI fixes`

**Body:**

MosaicSync 1.27.8.4 continues the older-CPU New Tab performance work by shrinking the launcher-only blocking CSS, eliminating duplicated critical rules from the deferred UI sheet, beginning authoritative local-state I/O before the main module graph evaluates, and warming invisible closed-folder artwork in small yielding batches instead of one delayed bulk operation.

The release also fixes the Firefox/Settings blanking regression seen when separate Light/Dark wallpaper controls change. While Settings is open, wallpaper and darkness changes are isolated to a dedicated preview surface and the real page paint state is committed only after the dialog closes.

Frequently Visited now treats Show and Count as synchronized MosaicSync profile preferences. The actual sites, browsing-derived data, hidden-domain list and Top Sites permission remain local to each browser. If another computer receives Show=ON but lacks permission, the preference stays ON and MosaicSync offers the local Grant permission action.

Shortcut hover is now more noticeable while remaining paint-only with no layout shift. No new permissions, CSP relaxation, telemetry, remote code, Sync conflict/schema changes or artwork-quality reduction.

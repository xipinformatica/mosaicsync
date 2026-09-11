# MosaicSync 1.33.0.9 publication notes

## Mozilla changelog

Completes Snow Leopard II Step 4 with a narrow Frequently Visited startup optimization. MosaicSync still performs the delayed installation-local Top Sites permission recheck used to recover browser permission state after updates, but after a verified successful live refresh it no longer rebuilds the same Frequently Visited cards, waits for the same favicon decodes, or regenerates the same session-only projection a second time.

Failed/unverified first refreshes and missing permission still use the existing full recovery path. No permission, persisted-schema, profile-format, Normal Sync/Recovery wire-format, CSP or browser-floor changes.

## Mozilla Notes to Reviewer

1.33.0.9 is a narrow device-local startup optimization. `refreshFrequentlyVisited()` records an ephemeral success proof only after live rendering and session projection commit. The delayed reconciliation still rechecks Top Sites permission; it skips the full refresh only when permission is currently granted and that New Tab already has a verified live refresh. The proof is not persisted or synchronized. Permission recovery/events, browser-history privacy and favicon/background correctness paths are unchanged.

## Chrome Web Store release notes

Reduces duplicate Frequently Visited startup work while keeping the delayed Top Sites permission recovery check. Healthy New Tabs no longer rebuild and re-decode the same cards a second time. No permission or data-format changes.

## GitHub release title

`MosaicSync 1.33.0.9`

## GitHub release description

MosaicSync 1.33.0.9 completes **Snow Leopard II Step 4 — asset/image/network frugality** with Step 4C.

Frequently Visited has a historical delayed startup reconciliation because browsers can briefly rehydrate an already-granted optional Top Sites permission after an extension update. Before this release, that delayed check always called the complete refresh pipeline again, even when the first live refresh had already succeeded. With the existing 30-second candidate cache, a healthy startup could therefore filter the same candidates again, rebuild the same card DOM, wait for the same favicon decodes and prepare the same session-only first-paint derivatives twice.

1.33.0.9 keeps the recovery observation but separates it from the expensive work. A full live refresh now records an ephemeral New-Tab-local verification bit only after live rendering and session projection both commit. The delayed reconciliation rechecks Top Sites permission exactly as before. If permission remains granted and the live refresh is verified, it stops there. If the first refresh failed/superseded or permission is missing, the original full `refreshFrequentlyVisited()` recovery path still runs.

Deterministic healthy-startup accounting for five visible sites moves from **2 → 1** full Frequently Visited passes, **10 → 5** candidate/image-preparation items and **2 → 1** session projections, while permission observations stay **2 → 2**.

No new cache, persistence, telemetry, network path or authority boundary is introduced. Permission `onAdded`/`onRemoved`, browser-history privacy, slow-decode generation protection, remote favicon quality resolution, Sync, Recovery and Space/background continuity remain unchanged.

Step 4 is closed at this release. Snow Leopard II now moves to **Step 5 — storage/background frugality**, beginning with measurement of storage operations and wakeups rather than deleting reads on appearance alone.

## GitHub Desktop

**Summary:** Release MosaicSync 1.33.0.9 — avoid duplicate healthy-startup Frequently Visited work

**Description:** Complete Snow Leopard II Step 4 by preserving the delayed Top Sites permission recovery check while skipping a second full FV render/favicon/session-projection pass after a verified healthy refresh. Failure and permission-loss recovery paths remain unchanged.

# MosaicSync 1.32.0.5 publication notes

## Mozilla changelog

Completes Journey-3 Step 6 with proven internal cleanup only. The Bookmarks controller now exposes only the operations used by the New Tab orchestrator, avoids a redundant device-local preference read on every New Tab, and avoids a duplicate sidebar rebuild during localized refresh. No feature, permission, persisted-schema or Sync/Recovery wire-format change.

## Mozilla Notes to Reviewer

MosaicSync 1.32.0.5 is a zero-new-features maintainability release built from certified 1.32.0.4. It performs no new ownership extraction and does not change Sync, Recovery, browser permissions, first-paint authority or browser Bookmarks capability loading.

Three proven Step-5 leftovers are retired. First, the Bookmarks controller no longer exposes its internal `open()` function in the object returned to `newtab.js`; opening remains owned by the controller's existing `bind()` click listener. Second, the controller no longer exposes/calls `hydratePostPaintPreferences()`. The bookmark-folder-color preference is already read and validated inside `loadBookmarksIntoDialog()` immediately before the successfully read tree is rendered, so the previous post-paint read performed on every New Tab was redundant. Third, localized refresh no longer calls `renderBookmarkSidebar()` before `renderBookmarkBrowser()`, because `renderBookmarkBrowser()` already rebuilds that sidebar.

The result removes one `localStorage.getItem(...)` from the startup/post-paint path for tabs that never open Bookmarks and one duplicate DOM rebuild when the Bookmarks UI is relocalized. It introduces no new browser-storage operation, Promise/await, network work, image decode, timer, serialization or first-paint dependency.

Four permanent Step-6 regressions were proven red on untouched 1.32.0.4 and green after cleanup. Historical Bookmarks/runtime tests remain in place. Runtime reachability still reports no high-confidence dead shared module, unused named import or unreferenced private function, so Step 6 stops rather than deleting review-only reference/test exports.

There is no feature, UI string, permission, host-permission, CSP, persisted state/profile schema, Sync/Recovery wire-format, telemetry, remote-code or browser-floor change.

## Chrome Web Store release notes

Internal maintainability cleanup only: removes redundant Bookmarks UI work while preserving features, permissions, stored data and Sync/Recovery behavior.

## GitHub release title

`MosaicSync 1.32.0.5`

## GitHub release description

MosaicSync 1.32.0.5 completes **Step 6 of the 3rd Maintainability Journey — Ownership & Auditability** with proven contract cleanup only. It narrows the Step-5 Bookmarks controller interface, removes a redundant device-local folder-color preference read from New Tab post-paint maintenance, and removes a duplicate sidebar DOM rebuild during localized refresh.

Four cleanup regressions were proven red on 1.32.0.4 and green after the change. No feature, permission, persisted schema, Sync/Recovery wire format or browser-floor change.

## GitHub Desktop

**Summary:** `Release MosaicSync 1.32.0.5`

**Description:** `Complete Journey-3 Step 6 by removing only proven redundant Bookmarks glue and work, with behavior unchanged.`

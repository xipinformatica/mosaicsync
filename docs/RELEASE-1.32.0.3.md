# MosaicSync 1.32.0.3 publication notes

## Mozilla changelog

Continues MosaicSync's 3rd Maintainability Journey with a behavior-preserving New Tab ownership cleanup. The Bookmarks dialog UI lifecycle now has a dedicated shared controller, while first-paint/startup, the lazy browser Bookmarks API loader and global New Tab orchestration remain in `newtab.js`. No feature, permission, persisted-schema or Sync/Recovery wire-format change.

## Mozilla Notes to Reviewer

MosaicSync 1.32.0.3 is a zero-new-features maintainability release built from certified 1.32.0.2.

The only production ownership change is mechanical: the existing Bookmarks dialog UI state/rendering/lifecycle moves from `src/shared/newtab/newtab.js` to `src/shared/newtab/bookmarks-controller.js`. That controller owns bookmark tree/folder/item UI projections, search/folder rendering, folder-color preference persistence/rendering, dialog permission/read handling and bookmark-local event listeners.

The existing browser Bookmarks implementation remains `src/shared/core/bookmarks.js` and remains dynamically imported only when needed. `newtab.js` still owns first-paint/startup, the lazy loader shared with the Frequently Visited “Add to bookmarks” action, global pointer/Escape coordination and all authoritative profile persistence. The existing bookmark-folder color `localStorage` read still occurs from the post-paint maintenance phase through the controller; it is not moved onto the critical path.

No storage.local/storage.sync profile I/O, Sync/Recovery behavior, network work, image decode, timer, first-paint await, permission, host permission, CSP, persisted schema, browser floor or feature semantics change.

Ten permanent Step-5 ownership regressions were proven red 10/10 on untouched 1.32.0.2 before passing after extraction. The generated New Tab runtime smoke was also strengthened to open/close the Bookmarks dialog on both Firefox- and Chrome-shaped runtimes.

## Chrome Web Store release notes

Internal maintainability improvement only: the Bookmarks dialog UI now has a dedicated controller. Features, permissions, bookmark behavior, Sync/Recovery behavior and stored formats are unchanged.

## GitHub release title

`MosaicSync 1.32.0.3`

## GitHub release description

MosaicSync 1.32.0.3 completes Step 5 of the **3rd Maintainability Journey — Ownership & Auditability**. It mechanically extracts the Bookmarks dialog UI lifecycle from `newtab.js` into `newtab/bookmarks-controller.js`, while preserving the existing lazy browser Bookmarks API loader, post-paint preference hydration and first-paint/startup ownership. Ten permanent Step-5 regressions were proven red on untouched 1.32.0.2 and green after extraction. No feature, permission, persisted schema, Sync/Recovery wire format or browser-floor change.

## GitHub Desktop

**Summary:** `Release MosaicSync 1.32.0.3`

**Description:** `3rd Maintainability Journey Step 5: extract the Bookmarks dialog UI owner without changing first-paint, features or browser-Bookmarks behavior.`

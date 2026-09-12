# MosaicSync 1.33.0.15 publication notes

## Mozilla changelog

Corrects two asynchronous Step-6 dialog-session ownership races. Recovery Copies and Bookmarks now bind delayed results to the specific open session that launched them, so close→reopen cannot let an older Recovery model, cleanup response, bookmark tree or permission result populate the new session. Recovery cleanup continues safely in the unchanged background authority and is never cancelled merely because the dialog closes. No permission, schema, Sync/Recovery format, network or browser-floor change.

## Mozilla Notes to Reviewer

1.33.0.15 is a presentation/lifetime corrective. Recovery and Bookmarks each maintain a dialog-open generation. Async completions render/adopt only while that generation still owns the open dialog. Recovery cleanup itself remains background-owned and freshly revalidated; if its original UI session is superseded, the cleanup may finish and the current open session then reloads a fresh model. No destructive authority moved into New Tab UI.

## Chrome Web Store release notes

Fixes stale close→reopen results in Recovery Copies and Bookmarks by tying asynchronous results to the dialog session that launched them. No permission or data-format changes.

## GitHub release title

`MosaicSync 1.33.0.15`

## GitHub release description

MosaicSync 1.33.0.15 continues **Snow Leopard II Step 6 — lifetime and memory** with Step 6C, correcting two asynchronous dialog-session ownership races found by adversarial audit.

Recovery Copies previously used only `dialog.open` plus one shared busy flag. A close→reopen while a model request was pending could suppress the new session's fetch and allow the old response to populate the reopened dialog. 1.33.0.15 gives each Recovery open session a generation identity, allows the reopened session to start its own model request while the superseded load finishes, and rejects old-session rendering. Submitted cleanup is not cancelled: background Recovery authority/revalidation is unchanged, and a superseded cleanup completion triggers a fresh model load for the current open session.

The same audit reproduced a related pre-existing Bookmarks issue. Bookmarks now revalidates its dialog generation after lazy-module, permission and tree-read awaits, so a closed/superseded session cannot repopulate arrays, status or hidden DOM.

The two original findings were proven red on untouched 1.33.0.14 before implementation. No Sync, Recovery wire-format, permission, schema, telemetry, network or browser-floor change. Step 6 remains in progress.

## GitHub Desktop

**Summary:** Release MosaicSync 1.33.0.15 — fix async dialog-session ownership

**Description:** Correct Recovery and Bookmarks close→reopen ABA races with per-session generations while preserving background Recovery authority and fresh destructive revalidation.

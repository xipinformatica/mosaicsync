# MosaicSync 1.33.0.14 publication notes

## Mozilla changelog

Continues Snow Leopard II Step 6 lifetime/memory work. The Recovery Copies manager now releases its generated device/generation list when the dialog closes, and late asynchronous Recovery responses no longer rebuild hidden controls after close. Recovery cleanup continues safely in the background and retains all existing eligibility/revalidation checks. No permission, Sync/Recovery format, schema, network or browser-floor change.

## Mozilla Notes to Reviewer

1.33.0.14 changes only the New Tab lifetime of generated Recovery-manager controls. `clearRecoveryCopiesView()` clears the dynamic list on the native dialog `close` event. `loadRecoveryCopies()` and `performRecoveryCleanup()` render returned models only while the dialog remains open; cleanup itself is still executed and revalidated by the unchanged background service. No Recovery cleanup authority, Sync read, journal, permission, storage key, telemetry or network path is changed.

## Chrome Web Store release notes

Reduces closed-dialog memory retention in the Recovery Copies manager and prevents late asynchronous responses from rebuilding hidden Recovery controls. No permission or data-format changes.

## GitHub release title

`MosaicSync 1.33.0.14`

## GitHub release description

MosaicSync 1.33.0.14 continues **Snow Leopard II Step 6 — lifetime and memory** with Step 6B.

The Recovery Copies manager dynamically creates device cards, generation rows and cleanup buttons whose click listeners close over the current Recovery model. In 1.33.0.13 that generated tree remained attached after the manager closed. An in-flight model request could also finish after close and repopulate the hidden list.

Step 6B clears only that generated list on the native dialog `close` event and suppresses hidden rendering from late model/cleanup responses. Successful cleanup is not cancelled: it still completes through the existing background-owned Recovery planner/revalidation path and Sync status refresh.

A deterministic 120-node fixture demonstrates **120 retained dynamic nodes after close → 0**, and 50 repeated cycles return to an empty dynamic list. The permanent regression also proves a late model response and a late successful cleanup response cannot rebuild closed controls.

Recovery selection, destructive-cleanup revalidation, Normal Sync, pending journals, Recovery wire format, permissions and schemas are unchanged. Step 6 remains in progress.

## GitHub Desktop

**Summary:** Release MosaicSync 1.33.0.14 — release closed Recovery-manager payload

**Description:** Continue Snow Leopard II Step 6 by clearing generated Recovery device/generation controls on close and suppressing late hidden UI renders while preserving background cleanup/revalidation.

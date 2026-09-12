# MosaicSync 1.33.0.16 publication notes

## Mozilla changelog

Completes Snow Leopard II Step 6 lifetime/memory work. The folder popover now releases its generated item controls and per-item listener closures whenever it closes while preserving the reusable shell and authoritative folder data. Reopening rebuilds from current state before display. No permission, Sync/Recovery, schema, network or browser-floor change.

## Mozilla Notes to Reviewer

1.33.0.16 changes only the lifetime of generated folder-popover controls. `closeFolder()` clears `folderItems` before dropping active folder ownership. Folder data remains in normalized New Tab state; `openFolder()` rebuilds synchronously before display. Deferred folder artwork hydration already checks active-folder ownership and hidden state, and cross-Space drag preserves its source element before close. No Sync, Recovery, storage or destructive authority changes.

## Chrome Web Store release notes

Reduces closed-folder memory retention by releasing generated folder-item controls when the popover closes. No permission or data-format changes.

## GitHub release title

`MosaicSync 1.33.0.16`

## GitHub release description

MosaicSync 1.33.0.16 completes **Snow Leopard II Step 6 — lifetime and memory** with Step 6D.

The folder popover dynamically creates item cards, edit buttons and drag/click/context-menu listeners from authoritative folder state. Previously those generated controls stayed attached after the popover closed. Step 6D now releases that interaction-only payload on every `closeFolder()` call, including idempotent already-hidden close, while retaining the reusable shell.

A deterministic 40-item fixture demonstrates **40 retained generated item roots after close → 0** across 50 cycles. `openFolder()` still rebuilds synchronously from current state before display. Deferred folder artwork hydration already requires matching active folder ownership and a visible popover, while cross-Space drag preserves its source element before closing the folder.

After auditing the remaining lifetime owners as explicitly cleared, bounded or intentionally New-Tab-lifetime, Step 6 closes here. Real-browser heap/RSS/GC convergence is not claimed without compatible browser/driver pairs. **Step 7 — runtime loading/dead work** is next.

No Sync, Recovery, permission, persisted-schema, network, CSP, privacy-boundary or browser-floor change.

## GitHub Desktop

**Summary:** Release MosaicSync 1.33.0.16 — release closed folder-popover payload and close Step 6

**Description:** Complete Snow Leopard II Step 6 by clearing generated folder-item controls on close while preserving folder state, reopen behavior, deferred artwork ownership and cross-Space drag continuity.

# MosaicSync 1.32.1.5 publication notes

## Mozilla changelog

Clarifies Sync status provenance so exact incoming updates show the friendly source-device name while collaborative updates are labelled as combined changes from other devices. Fixes unnecessary folder scrollbars when contents fit, and keeps Settings open behind Recovery, Custom Branding and Wallpaper Gallery child dialogs. No permission, profile-format, Sync/Recovery wire-format, CSP or browser-floor changes.

## Mozilla Notes to Reviewer

1.32.1.5 is a narrow New Tab UI corrective. It changes only Sync-status presentation, folder overflow layout and Settings child-dialog ownership. Normal Sync/Recovery data and algorithms are unchanged. No new permissions, remote code, telemetry, schemas or browser-floor changes.

## Chrome Web Store release notes

Improves Sync status clarity, removes unnecessary folder scrollbars, and keeps Settings open when closing Settings-owned child dialogs. No permission or data-format changes.

## GitHub release title

`MosaicSync 1.32.1.5`

## GitHub release description

MosaicSync 1.32.1.5 is a narrow UI-correctness corrective over 1.32.1.4.

Sync status now distinguishes the newest synchronized change from the last incoming receipt more truthfully. When incoming provenance is exact, MosaicSync shows the synchronized friendly device name. When the received revision is a collaborative/non-exact product, it says that it contains combined changes from the user’s other devices instead of implying a single unnamed sender.

Folder popovers no longer reserve an arbitrary 305px scroll region. The folder panel now owns a viewport-bounded column layout and the item grid scrolls only when its real contents exceed the available height.

Recovery safety copies, Custom Branding and Wallpaper Gallery are now one explicit class of Settings-owned child dialogs. Opening/interacting with them cannot close Settings behind them; closing the child returns to the still-open Settings panel, and Escape/outside-click behavior remains unchanged when no child is open.

No feature/data-model, permission, profile-format, Normal Sync/Recovery wire-format, CSP or browser-floor changes.

## GitHub Desktop

**Summary:** `Release MosaicSync 1.32.1.5 — polish Sync status and Settings child dialogs`

**Description:** `Show truthful named/collaborative incoming Sync provenance, remove unnecessary folder scrollbars, and keep Settings open behind Settings-owned child dialogs.`

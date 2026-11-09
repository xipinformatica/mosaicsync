# MosaicSync 1.33.0.94 publication notes

## GitHub release title

`MosaicSync 1.33.0.94`

## Firefox Add-ons — What's new

**Clearer Sync storage details**

Recovery safety copies now have clearer counts and labels. Firefox storage shows more accurate free space, and MosaicSync offers a helpful suggestion when old devices’ safety copies may be taking up room. No changes to synchronization or data protection.

## Chrome Web Store — What's new

**Clearer Sync storage details**

Recovery safety copies now have clearer counts and labels, and MosaicSync offers a helpful suggestion when old devices’ safety copies may be taking up room. No changes to synchronization or data protection.

## GitHub release — changes since 1.33.0.93

- Recovery manager: localized singular/plural device copy counts and no duplicate Newest indicator. Title, introduction and close button accessibility label are translated when the dialog opens; count units use the same backup terminology as each language’s dialog.
- Firefox Technical Sync details: display includes serialized-namespace quota overhead as metadata/cleanup; browser quota and safety decisions unchanged. Chrome display calculation unchanged.
- Near-full warning: optional suggestion for managing safety copies from unused devices, shown only when the actual "Remove device copies" button is eligible (including maturity and current-device fallback), there is conservative estimated capacity for this computer to publish the fresh safety copy required by that action, every verified device has only its newest generation, and the Sync storage warning is visible.
- Retain the existing .93 source-selection detail: a complete verified cloud copy is shown as available; absent or incomplete copies are never falsely described as complete. Do not change B1 reset behavior.
- No new permissions, network services, data formats, telemetry, Sync/Recovery state transitions or cleanup rules.

## Release caution

This is display-only. The real Firefox quota rule measured in Firefox 140 and 158 is four bytes per stored item plus one; the presentation uses the already-fetched Sync item count and falls back to the previous number if unavailable. It does not modify any storage write, cleanup or quota decision. The explicit reset-source choice and its existing detail wording remain unchanged. The suggestion is gated by the same actual old-device deletion eligibility used by Recovery Manager **and** a conservative, read-only estimate that the acting device can fit its own new safety copy first. This uses the already-fetched Sync snapshot and byte count, without extra reads; it is an advisory estimate rather than an authorization or guarantee. The action caption uses the localized Manage string. Independent browser visual review is still required.

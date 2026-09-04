# MosaicSync 1.31.0 publication notes

## Mozilla changelog

No-new-features quality release. Makes interrupted quota-full Sync reset safe, improves coherent Restore source selection, bounds remote-image downloads before decoding, commits release ZIPs atomically, and adds generated-browser editor-preview coverage. No new permissions or data-format changes.

## Mozilla Notes to Reviewer

MosaicSync 1.31.0 is built from certified 1.30.18.46 and implements five audit-demonstrated corrections only. Intentional reset now creates capacity while retaining at least one old Sync item, writes and verifies reset-intent, then removes old keys; this prevents an interruption from exposing an empty namespace without reset authority. Restore selects a newer atomic Personal+Work profile only when it dominates both modern live ledgers from the same publisher. Remote image bodies are capped while streaming and timed out. Packaging now writes, validates and atomically replaces ZIPs. The generated Firefox/Chromium New Tab harness now exercises Fit → Fill → Fit directly.

Permissions, host permissions, CSP, persisted schemas and Sync/Recovery wire formats are unchanged.

## Chrome Web Store release notes

No-new-features quality release with safer interrupted Sync reset and Restore behavior, bounded remote-image downloads, and stronger generated-browser tests. No new permissions.

## GitHub release title

`MosaicSync 1.31.0`

## GitHub release description

MosaicSync 1.31.0 is a no-new-features quality release based on the certified 1.30.18.46 source. It hardens interrupted quota-full reset, coherent Restore selection, remote-image resource bounds and deterministic release packaging, while expanding real generated-browser UI coverage. Permissions and persisted/wire formats are unchanged.

## GitHub Desktop

**Summary:** `Release MosaicSync 1.31.0`

**Description:** `Apply audited safety, resource-bound and release-integrity corrections without new features.`

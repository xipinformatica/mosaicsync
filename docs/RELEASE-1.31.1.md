# MosaicSync 1.31.1 publication notes

## Mozilla changelog

Narrow no-new-features corrective release after the independent 1.31.0 audit. Prevents a valid Sync reset marker from being bypassed by a fresh/uninitialized bootstrap, keeps live deletion tombstones authoritative during Restore source selection, preserves Recovery-recognized live-core evidence while staging a quota-full reset, and cancels/aborts abandoned remote-image requests. No new permissions or data-format changes.

## Mozilla Notes to Reviewer

MosaicSync 1.31.1 is a scoped corrective release based directly on 1.31.0. It addresses four reproduced audit findings only. Reset-intent is now authoritative before any bootstrap source can be accepted, including on an uninitialized `await-remote` profile. Restore source comparison distinguishes visible-record equality from deletion authority so a still-valid live tombstone cannot be dropped by an atomic safety copy. Reset quota staging preserves a key that the existing catastrophic-Recovery predicate recognizes as live core, or fails before destructive staging if no such guard exists. Remote-image early rejection and HTTP/terminal failure now cancel/abort the underlying body/request before timeout cleanup.

Permissions, host permissions, CSP, persisted schemas, Sync/Recovery wire formats, browser floors and product features are unchanged.

## Chrome Web Store release notes

Narrow corrective update for Sync reset/Restore safety and remote-image request cleanup. No new features or permissions.

## GitHub release title

`MosaicSync 1.31.1`

## GitHub release description

MosaicSync 1.31.1 is the post-audit corrective release for 1.31.0. It closes four reproduced issues in reset/bootstrap authority, tombstone-aware Restore selection, quota-full reset staging versus Recovery classification, and remote-image cancellation. The fixes stay within the existing architecture and add permanent Firefox/Chromium regressions. No feature, permission, CSP, schema or Sync/Recovery wire-format changes.

## GitHub Desktop

**Summary:** `Release MosaicSync 1.31.1`

**Description:** `Apply the four reproduced 1.31.0 audit corrections without new features or schema changes.`

# MosaicSync 1.30.18.15 publication notes

## Mozilla Developer Hub changelog

Begins Step 3 by consolidating Firefox and Chrome background logic into one shared implementation with small browser adapters. Sync, Recovery, metadata, alarms, queues and favicon policy now have one semantic owner while genuine Firefox/Chrome API differences remain isolated. Settings also now names the device that delivered the latest remote Sync receipt when that attribution is known. No permission, CSP or Sync/Recovery schema changes.

## Notes to Reviewer

Architecture-focused Step 3.1 cleanup: Firefox and Chrome now share one background core with thin platform adapters. The only user-visible correction is that the existing Sync receipt card uses the known device name when available. No permission, CSP, state/meta/Sync/Recovery schema, telemetry or backend changes.

## Chrome Web Store release notes

Reliability update: Firefox and Chrome now share one canonical background implementation, reducing cross-browser drift. Sync Settings also identifies the named device that delivered the latest remote change when known. No new permissions or schema changes.

## GitHub release title

`MosaicSync 1.30.18.15`

## GitHub release description

MosaicSync 1.30.18.15 begins Step 3 of the maintainability program by replacing two nearly identical ~6,800-line browser background implementations with one canonical shared background core plus thin Firefox and Chrome adapters.

Sync, Recovery, metadata transitions, device attribution, queues, alarms and favicon-recovery policy now have one semantic owner. Firefox-specific data-collection/tab-favicon handling and Chromium `_favicon`/Chrome Web Store behavior remain explicit platform capabilities.

The final pre-publication audit also hardened adapter/favicon regressions with real behavioral tests and fixed the existing Sync receipt card so a known delivering device is shown by name instead of generically as “another device”. The label is localized across all 33 UI languages.

No Step-2 ownership, permission, CSP, state/meta/Sync/Recovery schema, telemetry or backend changes.

## GitHub Desktop commit

**Summary:** `Release MosaicSync 1.30.18.15`

**Description:** Begin Step 3.1 with one shared Firefox/Chrome background core, thin platform adapters, hardened behavioral parity tests, and named Sync receipt attribution.

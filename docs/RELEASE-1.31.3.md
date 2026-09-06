# MosaicSync 1.31.3 publication notes

## Mozilla changelog

Fixes Frequently Visited setup on newly synchronized devices. If a complete synchronized profile already has Frequently Visited enabled when the user chooses it, MosaicSync now requests the device-local Firefox Top Sites permission from that existing setup click. If the synchronized ON preference arrives later, MosaicSync shows a one-time localized permission step instead of requiring an OFF/ON toggle workaround; the existing inline Grant permission action remains available. Browsing history and permission state remain device-local. Fresh profiles now default to an 11-column × 4-row grid; existing saved layouts remain unchanged.

## Mozilla Notes to Reviewer

MosaicSync 1.31.3 is a narrow first-run permission-recovery and default-layout correction over 1.31.2.

The synchronized `frequentlyVisitedEnabled` preference is intentionally separate from Firefox's optional, device-local Top Sites permission. 1.31.3 exposes only the synchronized ON/OFF intent in the read-only Sync status used by Welcome. When a complete remote profile is already available and the user explicitly chooses it, Welcome starts `permissions.request()` synchronously from that user gesture. If the remote preference becomes authoritative after the gesture has expired, Welcome/New Tab displays a one-time localized permission step with Grant permission / Continue actions. Continuing or denying never turns the synchronized preference off; the existing inline recovery remains available. No visited-site/history candidate is synchronized or exposed through this status path.

The fresh/default grid changes from 8×8 to 11×4. Existing profiles retain their persisted columns/rows, and the existing adjustable bounds remain unchanged.

The new permission step reuses existing locale keys already present in all 33 runtime locale catalogs. No new permission, host permission, CSP relaxation, telemetry, remote code, persisted state/profile schema, Sync/Recovery wire-format, or browser-floor change is introduced.

## Chrome Web Store release notes

Improves first-run Frequently Visited permission recovery for synchronized profiles and changes fresh-profile grid defaults to 11 columns × 4 rows. Existing layouts remain unchanged. No new permissions or synchronized browsing-history data.

## GitHub release title

`MosaicSync 1.31.3`

## GitHub release description

MosaicSync 1.31.3 closes the new-device Frequently Visited permission gap: when synchronized intent is already available, the setup click requests the device-local Top Sites permission immediately; when that intent arrives later, a one-time translated permission step appears without requiring an OFF/ON workaround. The feature's permission and browser-history candidates remain local to each device. Fresh profiles now start at 11 columns × 4 rows while existing saved layouts remain unchanged. No Sync/Recovery schema, permission-list, CSP or browser-floor change.

## GitHub Desktop

**Summary:** `Release MosaicSync 1.31.3`

**Description:** `Fix synchronized Frequently Visited permission handoff and set fresh profiles to an 11×4 grid.`

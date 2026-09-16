# MosaicSync 1.32.0.10 publication notes

## Mozilla changelog

Adds guarded Recovery safety-copy storage management. Settings can show complete Recovery copies by device and reclaim superseded copies while preserving protected complete fallbacks. Cleanup never exposes raw Sync keys and cannot delete the live synchronized layout, pending Sync journals or reset authority. No permission, persisted-schema, Sync/Recovery wire-format or browser-floor change.

## Mozilla Notes to Reviewer

MosaicSync 1.32.0.10 is a narrow post-freeze Recovery storage-management feature built from 1.32.0.9.

Firefox Sync quota is limited, while MosaicSync deliberately retains immutable complete Recovery generations as catastrophic-loss safety copies. Settings now exposes a **Manage** action beside Recovery safety-copy usage. The manager lists only verified complete Recovery generations, grouped by device with date/size. Users can delete an individual superseded generation, retire all superseded generations, or remove the complete Recovery set for a non-current old device only while the current device itself retains a verified complete fallback.

The UI never enumerates or deletes raw Sync keys. Eligibility is pure policy owned by `recovery-generation-lifecycle.js`. The privileged background reads Sync, calculates size, builds a conservative cleanup plan, takes a second fresh full Sync view immediately before removal, and revalidates the original plan. Destructive removal goes through the existing `removeSyncItems()` expected-change-aware helper. Torn/incomplete/orphan generations are not manually targetable. Live layout/settings, pending Normal Sync journals, cross-Space journals, reset authority and device-local artwork are outside the deletion surface.

The manager is lazy and performs no additional New Tab first-paint/startup work. No persisted schema, Recovery format, Sync wire format, permission or browser-floor change is introduced.

## Chrome Web Store release notes

Adds guarded Recovery safety-copy storage management with per-device size/date and safe cleanup of superseded complete copies. Live synchronized data and pending Sync work are never part of manual cleanup.

## GitHub release title

`MosaicSync 1.32.0.10`

## GitHub release description

MosaicSync 1.32.0.10 adds explicit management for Recovery safety-copy storage when browser Sync quota becomes tight.

Settings can now inspect verified complete Recovery generations by device, show exact size/date, safely remove superseded copies, or remove an old device's Recovery set under a conservative current-device fallback guard.

Safety rules are enforced below the UI: Recovery lifecycle policy decides eligibility, the background revalidates against a fresh Sync snapshot immediately before removal, and all deletion uses MosaicSync's expected-change-aware Sync removal path. Raw Sync keys, live layout/settings, pending Sync journals, reset authority and incomplete Recovery data are not manually deletable.

No permission, persisted-schema, Sync/Recovery wire-format, first-paint or browser-floor change.

## GitHub Desktop

**Summary:** `Release MosaicSync 1.32.0.10`

**Description:** `Add guarded Recovery safety-copy management with verified-generation eligibility, fresh pre-delete revalidation and protected current-device fallback.`

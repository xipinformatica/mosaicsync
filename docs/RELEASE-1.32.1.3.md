# MosaicSync 1.32.1.3 publication notes

## Mozilla changelog

Closes the confirmed defects from the 1.32.1.2 adversarial audit: top-level grid mutations can no longer create invisible out-of-range items, profile import now performs bounded hostile-structure preflight and validates real raster containers/geometry, Custom Branding rollback cannot overwrite a newer local save, and failed Settings imports no longer install rejected profile state in memory before durable commit. Recoverable legacy out-of-grid layouts are expanded/reflowed into a visible grid when they fit within the 12×8 product maximum. No new permissions, profile-format version, Sync/Recovery wire-format, CSP or browser-floor changes.

## Mozilla Notes to Reviewer

1.32.1.3 is a narrow correctness/security-hardening corrective. It centralizes visible grid-capacity enforcement, strengthens profile structural/raster validation, and makes Custom Branding/profile-import rollback authority-safe. Profile format remains v3; Normal Sync/Recovery formats and permissions are unchanged.

## Chrome Web Store release notes

Fixes grid-capacity edge cases, hardens profile raster/structure validation, and makes failed profile/branding imports concurrency-safe. Existing recoverable layouts remain visible. No permission, Sync/Recovery format or profile-version changes.

## GitHub release title

`MosaicSync 1.32.1.3`

## GitHub release description

MosaicSync 1.32.1.3 is a narrow post-audit correctness corrective over 1.32.1.2.

Top-level placement is now capacity-aware across ordinary shortcut creation, Frequently Visited insertion, cross-Space moves, folder extraction/ungrouping and grid shrink. Operations that cannot fit reject without destructive mutation. Legacy/imported layouts that contain recoverable out-of-grid positions are deterministically reflowed and the grid expands when needed, up to MosaicSync's 12×8 maximum.

Profile import is now treated as a stricter hostile-input boundary: raw structure is bounded before recursive/hash-heavy work, embedded raster data must match its claimed PNG/JPEG/WebP/GIF/ICO container and safe geometry envelope, and checksum-valid fake image payloads are rejected.

Custom Branding import uses serialized conditional rollback, so a failed import cannot overwrite a newer branding save from another New Tab. Open New Tabs adopt branding storage changes. Settings import also keeps the candidate profile out of live in-memory authority until the durable state commit succeeds.

Profile format remains v3. There are no new permissions, CSP changes, persisted state-schema changes, Normal Sync/Recovery wire-format changes or browser-floor changes.

## GitHub Desktop

**Summary:** `Release MosaicSync 1.32.1.3 — close adversarial audit defects`

**Description:** `Close grid-capacity, hostile-profile, imported-raster, Custom Branding rollback and failed-import authority defects with permanent regressions, without changing Sync/Recovery formats.`

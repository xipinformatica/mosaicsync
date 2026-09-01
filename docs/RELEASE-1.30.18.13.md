# MosaicSync 1.30.18.13 publication notes

## Mozilla Developer Hub changelog

Adds optional device naming and clear Sync-source attribution. When Sync is chosen in Welcome, users can name the current MosaicSync installation; the same name can be changed later in Settings. Settings now shows which named MosaicSync device produced the latest synchronized change, using the source dataset time and showing local receipt time separately when relevant. Device names synchronize as tiny attribution-only metadata tied to the existing stable device ID. All 33 UI languages are updated. No permission, CSP, layout/Sync/Recovery schema, telemetry or backend changes.

## Notes to Reviewer

MosaicSync 1.30.18.13 adds only device naming and Sync-source attribution. A friendly name is attached to MosaicSync's existing stable device ID and, when Sync is enabled, published as a tiny dedicated browser-Sync metadata record; existing synchronized datasets already contain the originating device ID, so no layout schema change is required.

Welcome and Settings use the shared localized UI across all 33 languages. No permissions, CSP, telemetry, backend, layout/Recovery schema or browsing-history behavior changes.

## Chrome Web Store release notes

Adds optional device names and clearer Sync attribution. Name a computer during Sync setup or later in Settings, then see which named MosaicSync device produced the latest synchronized change. Device names use tiny attribution-only Sync metadata; no permissions or layout/Recovery schema changes.

## GitHub release title

`MosaicSync 1.30.18.13`

## GitHub release description

MosaicSync 1.30.18.13 adds a focused Sync transparency feature: each installation can have a friendly device name such as **Oasis** or **Work PC**.

When browser Sync is selected during Welcome, MosaicSync offers a cohesive device-name field. The name can be changed later from the Sync section in Settings. Settings now shows the named source of the latest synchronized change using the source dataset timestamp, with this device's receipt time shown separately when relevant.

The implementation reuses MosaicSync's existing stable random device ID. Friendly names synchronize through a tiny dedicated attribution-only record; existing layout datasets keep their current origin-device IDs, and name-only Sync deliveries do not trigger layout reconciliation. Existing installations receive a browser/OS fallback name after first paint.

All 33 supported UI languages are updated. There are no new permissions, CSP changes, telemetry, backend services or layout/Sync/Recovery schema changes.

## GitHub Desktop commit

**Summary:** `Release MosaicSync 1.30.18.13`

**Description:** Adds localized device naming in Welcome and Settings plus named Sync-source attribution, while preserving existing device IDs, schemas, permissions and first-paint behavior.

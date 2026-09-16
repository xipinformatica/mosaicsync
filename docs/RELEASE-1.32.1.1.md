# MosaicSync 1.32.1.1 publication notes

## Mozilla changelog

Fixes Custom Branding placement: the custom logo and text now replace MosaicSync's existing upper-left logo/name instead of appearing as a separate centered block near Spaces. The Hello mascot/effect remains intact, horizontal logos keep their aspect ratio, and disabling branding restores the default MosaicSync identity. No Sync/Recovery, permission or profile-format changes.

## Mozilla Notes to Reviewer

1.32.1.1 is a narrow UI corrective over 1.32.1. Custom Branding now reuses the existing brand mark/name DOM nodes; the separate centered branding surface was removed. Branding storage/export/import and all Sync/Recovery boundaries are unchanged. No new permissions, remote code, telemetry or browser-floor changes.

## Chrome Web Store release notes

Fixes Custom Branding so the custom logo/text replace the normal MosaicSync identity in the upper-left brand area instead of overlapping the centered Spaces control. No Sync, permission or profile-format changes.

## GitHub release title

`MosaicSync 1.32.1.1`

## GitHub release description

MosaicSync 1.32.1.1 is a narrow corrective release for the Custom Branding feature introduced in 1.32.1.

When branding is enabled, the custom logo now replaces MosaicSync's built-in mark and the custom text replaces the `MosaicSync` name in the existing upper-left brand area. The erroneous separate centered branding block has been removed, so it can no longer sit underneath or overlap the Spaces selector. The existing Hello mascot/effect stays attached to the same brand control, horizontal logos preserve their aspect ratio, and disabling branding restores the standard MosaicSync identity.

The underlying Custom Branding contract is unchanged: branding remains device-local, stays completely outside browser Sync and Recovery, and is included only in explicit MosaicSync profile export/import. No new permissions, persisted schemas, Sync/Recovery wire formats or browser-floor changes.

## GitHub Desktop

**Summary:** `Release MosaicSync 1.32.1.1 — fix Custom Branding placement`

**Description:** `Make custom logo/text replace the existing MosaicSync brand identity, remove the overlapping centered branding surface, and preserve the Hello effect with no Sync/Recovery changes.`

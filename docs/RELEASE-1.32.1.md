# MosaicSync 1.32.1 publication notes

## Mozilla changelog

Adds optional Custom Branding: one device-local logo and one text line can personalize the New Tab without replacing MosaicSync's built-in mascot/Hello effect. Branding never enters Firefox Sync or Recovery; browser-neutral profile export/import v3 embeds it for explicit transfer or backup. Existing v1/v2 profiles remain importable. No new permissions or browser-floor changes.

## Mozilla Notes to Reviewer

MosaicSync 1.32.1 is a scoped post-freeze product feature built from 1.32.0.10.

Custom Branding stores one optional PNG/JPEG/WebP logo plus one exact Unicode text line in a dedicated `storage.local` record. It is intentionally excluded from the synchronized MosaicSync state, Sync clocks, cumulative/cross-Space pending journals, immutable Recovery generations and automatic cross-device propagation. The Normal Sync/Recovery wire formats and authority owners are unchanged.

Profile backup format advances from v2 to v3. v3 adds a checksummed `profile.branding` field containing the actual bounded canonical logo data plus enabled/text state, making export/import self-contained. v1/v2 files remain accepted and restore default/no branding. Settings import writes branding locally and rolls it back if the authoritative profile-state write fails. Welcome/profile import keeps branding memory-only until source resolution actually selects the imported/local candidate; choosing the synchronized copy discards the provisional candidate without writing branding.

Branding is not part of New Tab first paint. The device-local branding read is scheduled only after `interactionReady`; if branding is visible, MosaicSync first loads the existing secondary stylesheet and only then unhides the branding surface. The critical stylesheet budget remains frozen. Uploaded branding artwork is raster-only (PNG/JPEG/WebP), bounded and optimized locally. No new WebExtension permissions, host permissions, telemetry, network service, persisted MosaicSync state schema, Sync/Recovery wire format or browser minimum is introduced.

## Chrome Web Store release notes

Adds optional device-local Custom Branding with one logo and one text line. Branding stays out of browser Sync/Recovery but is included in MosaicSync profile export/import for explicit backup or transfer. Existing MosaicSync mascot/effect remains unchanged.

## GitHub release title

`MosaicSync 1.32.1`

## GitHub release description

MosaicSync 1.32.1 adds a focused **Custom Branding** option for personal and business New Tabs.

You can add one local PNG/JPEG/WebP logo and one exact text line while keeping MosaicSync's own mascot and Hello effect intact. Branding has a deliberately simple ownership rule: it is stored only on the device, uses zero browser-Sync quota, never participates in Sync conflict/retry/Recovery machinery, and moves to another installation only when you explicitly export and import a MosaicSync profile.

The browser-neutral profile format is now v3 and embeds the stored branding asset/text so backups are self-contained. Older v1/v2 profiles remain compatible. Import/source-selection paths are transactional around branding, malformed branding data is rejected safely, and branding presentation stays off the critical first-paint path.

No new permissions or browser-floor changes.

## GitHub Desktop

**Summary:** `Release MosaicSync 1.32.1`

**Description:** `Add device-local Custom Branding with self-contained profile-v3 export/import and no Sync/Recovery footprint.`

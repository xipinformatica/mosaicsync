# MosaicSync 1.33.0.70 publication notes

**PRIVATE CANDIDATE — DO NOT PUBLISH without independent audit, GitHub browser gate and signed-in multi-device Sync acceptance.**

## Public changelog (cumulative from published 1.33.0.63)

- Improves the reliability of simultaneous and offline changes between browsers, with independent Personal and Work synchronization.
- Better protects deleted shortcuts against older changes reappearing after synchronization.
- Improves safety when another device resets Sync, including devices that were offline through the reset and replacement.
- Makes synchronization waiting messages clearer in all 34 languages.
- Improves add-button alignment and High Contrast visibility.
- No new permissions, tracking or external services; existing backup files remain compatible.

## Reviewer notes

The extension continues to use browser-native storage.sync, with no additional network endpoints. This candidate adds a small `mosaicsync.sync.reset-epoch.v1` metadata record to browser Sync when the user deliberately clears their synchronized copy. It is atomically introduced alongside the existing reset-intent marker and remains after the new coherent Personal+Work layout replaces the previous cloud profile. An offline initialized .70 client that sees the new epoch can prevent obsolete local changes from being merged into the replacement and instead safely wait. Earlier versions ignore the record, so mixed-version behavior requires an upgrade. The record contains an epoch, initiating local device ID and timestamp; it is not telemetry and is not sent to MosaicSync-operated servers. User-visible Sync choices, permissions and backup format are unchanged.

## GitHub release title

`MosaicSync 1.33.0.70`

## Release gates

Independent code audit, reproducing offline-reset failures on .69, passing regression/packaging tests, six GitHub browser-gate jobs, signed-in two-device Chrome and Firefox acceptance. **These external gates have not passed for .70.**

# MosaicSync 1.30.15 publication notes

## Mozilla Developer Hub changelog

Fixes cross-device Settings conflicts so changing one preference can no longer overwrite a newer unrelated preference from another computer. Adds compact per-setting conflict clocks, keeps same-setting conflicts deterministic, and preserves existing Sync recovery/favicon behavior. No new permissions, telemetry, backend or remote code.

## Notes to Reviewer

1.30.15 changes only Settings conflict metadata/merge semantics. Independent Settings controls now carry compact logical clocks through normal Sync and device/profile snapshots; legacy records migrate from the existing `settingsModifiedAt`. `autoSiteIcons`, `webAccessPrompted` and browser permission state remain device-local. State schema is 19 and Sync schema is 11; no profile-container format or permission change.

## GitHub release title

`MosaicSync 1.30.15`

## GitHub release description

MosaicSync 1.30.15 prevents stale unrelated Settings values from silently clobbering newer choices across devices by synchronizing compact per-logical-setting clocks. Local and cross-device merges now share one deterministic Settings merge model, with snapshot/recovery coverage and five-device stress tests.

## GitHub Desktop

**Summary:** `Release MosaicSync 1.30.15`

**Description:** `Add fine-grained synchronized Settings clocks so unrelated cross-device preference edits converge without stale-field overwrites.`

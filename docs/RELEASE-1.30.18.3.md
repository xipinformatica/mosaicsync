# MosaicSync 1.30.18.3 publication notes

## Mozilla Developer Hub changelog

Hardens complete Personal+Work recovery snapshots for cloned or restored browser profiles that share a copied MosaicSync device identity. New recovery generations use immutable commit-scoped root/chunk keys, so concurrent clones cannot overwrite the same recovery snapshot while publishing. Legacy recovery snapshots remain readable, failed generation commits preserve the previous complete copy, and storage remains bounded. No Sync/state/meta schema, permission, UI, telemetry or backend change.

## Notes to Reviewer

1.30.18.3 is a narrow recovery-snapshot identity hardening release. MosaicSync intentionally keeps its existing stable `deviceId` for ordinary Sync records and conflict semantics. The change is limited to the additional complete-profile recovery copy in `storage.sync`: new snapshots are written to commit-scoped immutable roots/chunks rather than one fixed root derived only from `deviceId`. This prevents two live browser-profile clones with the same copied `deviceId` from overwriting each other's recovery publication. Chunks are still committed before the root; a failed root write cleans only the new generation; legacy fixed-root `a/b` snapshots remain readable; and generation cleanup remains bounded. Device/profile snapshot payload versions and the state, meta and normal Sync schema versions are unchanged. No permissions, CSP, remote code, UI/localization, telemetry or backend behavior were added.

## GitHub release title

`MosaicSync 1.30.18.3`

## GitHub release description

MosaicSync 1.30.18.3 hardens complete-profile recovery for cloned/restored browser profiles. Recovery publications now use immutable commit-scoped roots and chunks, preventing profiles that share a copied `deviceId` from writing over the same recovery generation while preserving legacy snapshot reads and existing Sync semantics.

## GitHub Desktop

**Summary:** `Release MosaicSync 1.30.18.3`

**Description:** `Harden cloned-profile recovery snapshots with collision-free immutable generations.`

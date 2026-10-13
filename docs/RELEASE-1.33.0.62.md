# MosaicSync 1.33.0.62 publication notes

**PRIVATE RELEASE CANDIDATE. Do not publish until independent review and the versioned GitHub six-job release gate pass.**

## Store changelog (Firefox / Chrome)

- Fixed a rare backup-import interruption that could apply imported branding without applying the imported shortcuts.
- Backup import now saves branding, shortcuts, images and pending Sync changes together, in both Settings and first-run Welcome.
- Improved consistency after storage errors and quota failures, without changing backup formats or permissions.

## Firefox AMO Notes to Reviewer

MosaicSync 1.33.0.62 is a targeted data-integrity correction to the backup-import flow in 1.33.0.61. Both the Settings import and the first-run Welcome profile import now include device-local Custom Branding in the same `storage.local.set` transaction that commits the imported profile, image assets and any pending Sync journal. Previously, branding was saved first and rolled back on failure; closing the tab between those writes could leave old shortcuts with imported branding. The new implementation removes the speculative branding write and rollback from both import paths.

The existing Firefox Gecko ID (`mosaicsync@xipinformatica.cat`), Firefox 140 minimum, permissions, on-demand webRequest behavior, data formats, Sync protocol and privacy behavior are unchanged. No new network destinations or telemetry are introduced. The storage writer validates imported branding strictly and preserves its existing stale-baseline guard and quota-failure behavior. Ordinary shortcut saves do not write branding.

New regression tests cover successful atomic commits, rejected writes, quota failure, stale-baseline protection, ambiguous write outcomes and normal-save isolation. Firefox-specific injected-storage-failure testing and second-device Sync receipt remain unverified; do not describe these as passed.

## GitHub release title

`MosaicSync 1.33.0.62`

## GitHub release description

Stage 2B reliability: backup imports now commit shortcuts, local image assets, device-local branding and pending Sync state together. Fixes a real tab-close interruption window that could previously apply branding without the imported layout, and removes rollback-dependent partial import outcomes. Applies to Settings and first-run Welcome imports. No new permissions, telemetry, translations, data migrations or Sync protocol changes. Includes focused atomicity and failure-path regression tests.

## Publication gate

Do not upload to Firefox AMO or Chrome Web Store until (1) complete regression suite and package contracts pass, (2) clean-room builds reproduce all release ZIPs byte-for-byte, (3) real-browser interruption sweep and quota scenarios pass or gaps are explicitly accepted, (4) independent audit reviews the actual candidate, and (5) all six GitHub Actions jobs are green for the final .62 commit. The .61 store builds must remain untouched until then.

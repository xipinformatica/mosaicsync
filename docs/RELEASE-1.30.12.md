# MosaicSync 1.30.12 publication notes

## Release status

MosaicSync 1.30.12 is an update/reinstall data-preservation hardening release on top of 1.30.11. It removes an unsafe lifecycle assumption exposed by the Firefox update incident: a browser `runtime.onInstalled` event whose reason is `install` is no longer treated as proof that MosaicSync has no prior local state.

## Mozilla Developer Hub changelog

Update/reinstall safety hardening. MosaicSync no longer resets onboarding, Sync enablement/bootstrap status, applied revision markers or recovery metadata merely because Firefox/Chrome reports `runtime.onInstalled` with reason `install`. Genuine empty installs still receive the normal first-run defaults through the existing storage initializer, while any surviving layout/metadata is preserved across install-like recovery transitions. Added Firefox/Chrome lifecycle regressions for false-install, waiting-for-Sync, fresh-install, normal-update and downgrade/re-upgrade-shaped events. Also added a separate-ID Firefox development packaging path (`mosaicsync-dev@xipinformatica.cat`) so routine `about:debugging` testing cannot overlay the production AMO identity. The 1.30.11 live wallpaper/darkness preview fix remains intact. No new permissions, synchronized/profile schema, telemetry, backend, remote code or CSP relaxation.

## Notes to Reviewer

1.30.12 is a narrow data-preservation hardening release prompted by a Firefox update/reinstall incident. The runtime change is intentionally small: the previous `runtime.onInstalled` handler contained an explicit `if (details.reason === "install")` branch that rewrote `mosaicsync.meta` to first-run values and cleared local recovery queues. That assumption is now removed.

The handler still calls the existing `ensureLocalStorage()` initializer. On a genuinely empty browser namespace, that function creates MosaicSync's ordinary default state/meta (Sync off, onboarding incomplete, fresh device ID), so first installation behavior does not require a destructive lifecycle branch. If state/meta already exists, the same initializer performs only the existing normalization/migration behavior and preserves the durable profile. Consequently an install-like recovery/reinstallation event cannot itself disable Sync, zero bootstrap/revision bookkeeping, clear recovery state, or mark completed onboarding incomplete. If surviving metadata already says onboarding is incomplete, Welcome may still be foregrounded; that does not authorize resetting the surviving Sync/recovery fields.

Production regression scenarios execute the generated Firefox and Chrome background workers with real storage/event mocks and verify: (1) a false `install` with completed onboarding/ready Sync preserves semantic Personal+Work layout, device identity, Sync status/bootstrap, protection and applied/received revision fields; (2) a false `install` while waiting for Sync preserves the waiting state and local draft while still allowing Welcome to appear; (3) a genuinely empty install materializes safe first-run defaults; and (4) normal update plus downgrade/re-upgrade-shaped `update` events preserve state. Static guards additionally reject reintroduction of local deletion or `clearAllPendingSyncRecoveryState()` inside the install lifecycle block.

The release also adds a development-only packaging mode. The normal Firefox manifest and public ZIP retain the AMO Gecko ID `mosaicsync@xipinformatica.cat`. `python tools/package.py --firefox-dev` (also exposed as `npm run firefox:dev`) creates a separate non-release ZIP named as a temporary development build, changes only the packaged manifest name/short_name to `MosaicSync Dev`, and uses `mosaicsync-dev@xipinformatica.cat`. It does not mutate the production dist tree and is excluded from GitHub-ready source packaging. This makes routine `about:debugging` work storage/identity-isolated from the AMO installation.

This hardening cannot prevent Firefox itself from removing an installed extension or deleting the extension storage namespace; WebExtension code cannot run after that deletion. It specifically prevents MosaicSync from turning a browser install-like lifecycle signal into its own destructive reset when durable data survives. A real signed AMO 1.30.10 → 1.30.12 update on a disposable profile containing real MosaicSync data remains an explicit manual release gate and is not represented as automated coverage.

The 1.30.11 isolated Settings wallpaper/darkness preview implementation, 1.30.10 verified snapshot decode cache, Sync conflict/tombstone behavior, synchronized/profile schemas, permissions, CSP, navigation and privacy model are otherwise unchanged.

## GitHub release title

`MosaicSync 1.30.12`

## GitHub release description

MosaicSync 1.30.12 hardens update/reinstall data preservation. Browser `onInstalled(reason="install")` is no longer allowed to reset existing MosaicSync onboarding or Sync/recovery metadata; genuinely empty installs still initialize normally through the standard storage path, while surviving profiles remain intact. Firefox/Chrome lifecycle regressions cover false-install, waiting-for-Sync, fresh-install and update/downgrade-shaped transitions. A separate-ID `MosaicSync Dev` Firefox package is also available for safe `about:debugging` testing without overlaying the AMO identity. No new permissions or Sync/profile schema changes.

## GitHub Desktop commit

**Summary:** `Release MosaicSync 1.30.12`

**Description:** `Harden install/reinstall lifecycle handling so ambiguous browser install events cannot reset surviving MosaicSync layout/Sync/onboarding state; add production lifecycle regressions and a separate-ID Firefox development package while preserving 1.30.11 appearance and existing Sync/security behavior.`

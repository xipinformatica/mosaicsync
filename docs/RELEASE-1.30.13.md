# MosaicSync 1.30.13 publication notes

## Release status

MosaicSync 1.30.13 is a single-purpose data-loss-prevention release on top of 1.30.12. It protects established devices when the browser-native WebExtension Sync namespace unexpectedly disappears completely, while retaining the existing first-install, torn-delivery, conflict, tombstone and recovery behavior for every non-catastrophic case.

## Mozilla Developer Hub changelog

Added catastrophic Sync-loss containment and self-healing. An established MosaicSync device that previously observed a complete synchronized profile now treats a raw 0-byte `storage.sync` namespace as external loss: it preserves the local Personal/Work profile, enters a silent quarantine, and only after persistent confirmed absence republishes the valid local profile through the existing generation machinery and verifies the reconstructed remote copy. Recovery retains verified recent deletion tombstones and replays edits made during quarantine. MosaicSync-controlled **Clear Sync copy** now leaves a small versioned reset-intent record instead of intentionally creating a 0-byte namespace, so other 1.30.13 devices can distinguish an explicit reset from browser-side loss. Confirmed recovery status is localized in all supported UI languages. No new permissions, telemetry, backend, remote code, CSP relaxation, or change to existing shortcut/settings/profile schemas.

## Notes to Reviewer

1.30.13 is a narrow data-loss-prevention release prompted by a real Firefox incident in which MosaicSync was treated as uninstalled and its WebExtension Sync namespace later appeared as 0 bytes on other devices. The exact external AddonManager/update trigger is not claimed to be solved here. This release instead hardens the behavior of surviving MosaicSync installations when browser-managed synchronized storage is catastrophically absent.

The new detection is restricted to established devices. A local continuity record is considered established only after complete synchronized participation, or is inferred on first 1.30.13 run from surviving 1.30.12 Sync-applied/receipt metadata. A fresh installation without that evidence retains the existing `await-remote` behavior and never publishes an empty/default profile.

For an established device, `reconcileIfNewCommit()` invokes the catastrophic-loss guard before retrying any pending local Sync publication. A first exact 0-byte namespace observation enters quarantine, persists a one-shot recovery alarm and leaves local state untouched. During an active loss state, partial Sync fragments do not cancel quarantine; only a complete, validated Personal+Work remote profile or a valid reset-control record resolves the ambiguity. Non-zero partial/corrupt data that was never preceded by total loss stays in the existing torn-delivery/checksum/previous-generation path and is not auto-overwritten.

If the remote namespace remains absent until the recovery deadline, the device republishes through the existing authoritative local bootstrap/generation machinery. Recovery carries forward a bounded set of recent validated Personal/Work deletion tombstones from the continuity record. This is required because the compact working profile contains live semantic state but does not itself retain every previously synchronized deletion marker; omitting those markers after a total server wipe could allow an old offline device to resurrect deleted shortcuts. Pending normal/cross-Space local mutation journals are retained across the base recovery publication, then replayed so additions/deletions made during quarantine are also preserved. The recovered namespace is re-read and required to contain a complete Personal+Work profile before continuity is marked healthy.

Multiple survivors use a deliberately lightweight stagger rather than a second distributed-election protocol: the common quarantine is extended for stale continuity, plus deterministic device-specific jitter. If another device publishes a complete valid profile first, all waiting devices cancel recovery and reconcile normally. Existing deterministic record/generation conflict handling remains authoritative after recovery.

MosaicSync's explicit `clearSyncData()` path has changed so a user-controlled reset is never represented as `{}`. It writes a small versioned `mosaicsync:*` reset-intent record before deleting the remaining MosaicSync synchronized records, disables Sync locally and preserves the local working profile. An established 1.30.13 peer observing that valid marker records the reset and disables Sync rather than rebuilding the cloud copy. When the user later explicitly chooses the local device as the source, MosaicSync publishes a complete replacement profile first and removes the reset marker only after the authoritative publish succeeds.

Recovery UI is informational rather than blocking. No message is produced for the initial/transient quarantine. Confirmed publication writes a device-local recovery-status record consumed by New Tab to show localized restoring/restored feedback; after the bounded retry limit, a localized failure warning explicitly says the local profile remains safe. All new strings use the existing runtime localization catalogs.

The continuity/status metadata is `storage.local` only and is not included in profile export/import. The release adds no permission, host permission, developer backend, analytics/telemetry, remote code or CSP relaxation. Existing shortcut/settings/profile Sync schema versions are unchanged; only the new reset-control record has its own explicit protocol schema version. 1.30.12's non-destructive `runtime.onInstalled` handling and separate `mosaicsync-dev@xipinformatica.cat` temporary-development package remain intact.

Automated regression coverage executes the generated Firefox and Chrome background workers and covers established recovery, 1.30.12 migration before a continuity record exists, genuine fresh waiting, transient-zero cancellation, explicit non-zero reset and peer respect, partial non-zero delivery, retention of historical tombstones, local additions and deletions during quarantine, and ordering that prevents pending local publication before catastrophic-loss detection. Real Firefox multi-device uninstall propagation remains a mandatory hardware/account acceptance test before broad rollout.

## GitHub release title

`MosaicSync 1.30.13`

## GitHub release description

MosaicSync 1.30.13 adds catastrophic browser-Sync loss containment and self-healing. Established devices preserve their local profile when MosaicSync's entire synchronized namespace unexpectedly reaches 0 bytes, quarantine the loss, and can rebuild a verified complete cloud copy from a surviving profile while retaining deletion tombstones and edits made during the outage. Explicit MosaicSync Sync reset now leaves a tiny versioned reset marker so intentional clearing cannot be mistaken for catastrophic loss. No new permissions, telemetry, backend or existing profile-schema change.

## GitHub Desktop commit

**Summary:** `Release MosaicSync 1.30.13`

**Description:** `Protect established devices from catastrophic 0-byte browser Sync loss with quarantine, verified self-healing, retained deletion tombstones and a non-zero explicit reset marker; preserve all 1.30.12 lifecycle hardening and existing security/privacy boundaries.`

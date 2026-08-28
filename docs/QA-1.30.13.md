# MosaicSync 1.30.13 QA / release-candidate checklist

## Scope

1.30.13 is a single-purpose catastrophic Sync-loss containment release. It must not add unrelated features or weaken 1.30.12 lifecycle protection. A previously healthy device must preserve its local profile through a total remote namespace loss, while a genuinely new device must still wait and an explicit MosaicSync reset must never be auto-resurrected.

## Automated release gates

- [x] Full Node regression suite passes after final 1.30.13 identity/build.
- [x] Performance benchmark passes with prior trusted-state/snapshot-cache safeguards retained.
- [x] Package-size guard passes with consciously reviewed 1.30.13 baseline.
- [x] Firefox and Chrome version identity is exactly `1.30.13` everywhere.
- [x] Firefox and Chrome public package hygiene passes.
- [x] Production Firefox Gecko ID remains exactly `mosaicsync@xipinformatica.cat`.
- [x] Development Firefox package remains isolated at `mosaicsync-dev@xipinformatica.cat`.
- [x] Clean GitHub-ready extraction passes the full suite, benchmark and size report.
- [x] Clean source rebuild reproduces the public Firefox/Chrome/source and dev Firefox ZIPs byte-for-byte.

## Catastrophic-loss negative/preservation coverage

- [x] First exact 0-byte observation on an established device enters quarantine and performs no immediate Sync write.
- [x] Personal and Work local semantic state remain unchanged throughout quarantine.
- [x] A live 1.30.12 device with applied/receipt metadata but no 1.30.13 continuity key is inferred as established before its first catastrophic-zero decision.
- [x] A genuinely fresh/waiting device with no continuity evidence never interprets empty Sync as catastrophic loss and never publishes.
- [x] Complete valid remote data reappearing during quarantine cancels recovery with no user-facing recovery status.
- [x] Non-zero partial/corrupt delivery that was not preceded by total loss stays out of catastrophic recovery.
- [x] Catastrophic-loss detection runs before pending local mutation replay.
- [x] Local additions made during quarantine remain local until recovery and appear in the verified rebuilt copy.
- [x] Local deletions made during quarantine are replayed as tombstones after the base recovery publication.
- [x] Previously synchronized recent deletion tombstones are retained device-locally and included in recovery so stale devices cannot trivially resurrect deleted shortcuts.
- [x] Recovery declares success only after a complete Personal+Work remote profile validates.
- [x] Suspected/transient loss produces no recovery toast.
- [x] Confirmed restore/restored/failed messages are localized in all supported runtime locales.

## Intentional-reset coverage

- [x] MosaicSync-controlled Clear Sync copy writes the reset-intent record before removing other MosaicSync Sync keys.
- [x] MosaicSync-controlled Clear Sync copy never calls `storage.sync.clear()`.
- [x] Explicit reset leaves a non-zero namespace containing the versioned reset marker.
- [x] Explicit reset preserves the initiating device's local working profile while disabling Sync.
- [x] Another established 1.30.13 device respects the reset marker and does not automatically republish the old profile.
- [x] A later explicit **Use this device** bootstrap publishes a complete replacement profile and removes the reset marker only after the profile is complete.

## Required real Firefox/account checks — mandatory before broad rollout

- [ ] With two disposable Firefox profiles/devices signed into the same Firefox account, establish a recognizable Personal+Work MosaicSync profile and verify both are healthy.
- [ ] Uninstall MosaicSync from one profile/device and allow Firefox Extension-Storage Sync to propagate. Confirm the surviving 1.30.13 device never loses its local grid/onboarding state.
- [ ] Confirm the survivor remains silent during quarantine, then rebuilds/validates the synchronized copy after the recovery deadline if the namespace remains 0 bytes.
- [ ] Reinstall MosaicSync on the removed profile/device and confirm it can receive the repaired copy normally.
- [ ] Repeat on the Windows/macOS combination that reproduced the original incident where practical.
- [ ] Exercise **Clear Sync copy** from one 1.30.13 device and confirm another 1.30.13 device respects the explicit reset instead of reconstructing it.
- [ ] Verify a later explicit **Use this device** action recreates the cloud copy and a waiting peer receives it.
- [ ] Verify 1.30.11 live wallpaper/darkness preview remains immediate and Settings does not blank during repeated Separate Light/Dark changes.

## Important limitations

- 1.30.13 cannot prevent Firefox itself from uninstalling the extension or deleting its browser-owned storage after uninstall; WebExtension code is no longer running at that point. The protection operates on surviving MosaicSync installations.
- The exact Firefox/AMO reason the 1.30.11 incident entered an uninstall lifecycle remains unproven and is not represented as fixed by this release.
- If every MosaicSync installation is removed and no exported backup survives, no remaining extension instance exists to reconstruct the cloud copy.

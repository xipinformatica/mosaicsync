# MosaicSync 1.30.14 QA / release-candidate checklist

## Scope

1.30.14 may change only the reviewed catastrophic-loss hardening/reset-peer behavior and compact manual detected-favicon intent synchronization. Preserve 1.30.13 local-profile/tombstone protection, 1.30.12 lifecycle/dev identity, 1.30.11 Settings appearance isolation, all existing permissions/security boundaries and ordinary Sync behavior.

## Automated release gates

- [x] Full Node regression suite passes after final 1.30.14 identity/build.
- [x] Performance benchmark passes.
- [x] Package-size guard passes with consciously reviewed 1.30.14 baseline.
- [x] Firefox and Chrome version identity is exactly `1.30.14` everywhere.
- [x] Firefox and Chrome public package hygiene passes.
- [x] Production Firefox Gecko ID remains exactly `mosaicsync@xipinformatica.cat`.
- [x] Development Firefox package remains isolated at `mosaicsync-dev@xipinformatica.cat`.
- [x] Clean GitHub-ready extraction passes full tests, benchmark and size report.
- [x] Clean source rebuild reproduces Firefox/Chrome/source/dev ZIPs byte-for-byte.

Automated release candidate: **663/663 tests passed** across 88 test files on the final source tree.

## 1.30.14 catastrophic-loss hardening coverage

- [x] `getBytesInUse(null) === 0` while a full `storage.sync.get(null)` read is non-empty does not enter catastrophic-loss quarantine or publish.
- [x] Both independent observations must agree that the namespace is empty before first quarantine entry.
- [x] A persisted quarantine/recovering state whose deadline expired while the browser was closed receives a fresh startup warm-up and performs no immediate recovery publication.
- [x] A worker interrupted during an active recovery respects the persisted restart-grace deadline before another publication attempt.
- [x] Recovery attempt counts remain durable/bounded across the restart-grace path.
- [x] Reset marker validation rejects an empty initiating device ID.
- [x] A peer observing a valid reset remains Sync-enrolled in non-publishing `await-remote` state.
- [x] A later complete post-reset profile automatically rejoins that peer to healthy Sync.
- [x] The post-reset peer applies the new verified profile as authoritative and does not merge its pre-reset shortcuts back into it.
- [x] Existing 1.30.13 catastrophic-loss, tombstone, pending-mutation, partial-delivery, intentional-reset and failed-recovery regressions remain enabled.
- [x] Seeded three-device Firefox/Chrome stress performs eight repeated catastrophic wipes with intervening normal edits/random recovery winners and verifies local preservation plus full convergence every round.

## Manual detected-favicon preference coverage

- [x] Choosing a detected favicon writes a compact optional preference token to the shortcut.
- [x] The normal Sync shortcut record contains `favPref` but contains neither raw selected favicon pixels nor a raw favicon URL.
- [x] Ordinary shortcuts with no manual detected-favicon choice omit `favPref` entirely.
- [x] A different synchronized preference invalidates stale local pixels; an identical preference preserves already hydrated local pixels.
- [x] Firefox and Chrome production background workers locally rediscover and materialize the exact preferred favicon candidate.
- [x] Exact preferred-candidate reconstruction works even when automatic site-icon learning is disabled for that workspace.
- [x] Reconstructed preferred favicon pixels remain device-local unless **Sync this image** is separately enabled.
- [x] Choosing a built-in icon, uploading different local artwork, clearing artwork, selecting an explicit web image or changing the shortcut URL clears the stale preference.
- [x] Preference tokens contain no raw candidate URL/query text.
- [x] 100 manual favicon preferences remain below the reviewed small Sync-record budget threshold.

## Required real browser checks before broad rollout

- [ ] On two disposable Firefox profiles/devices, choose a non-default detected favicon on source A, allow normal Sync delivery and confirm source B reconstructs the same chosen candidate locally without **Sync this image** enabled.
- [ ] Repeat with Website Access initially unavailable on B: confirm the synchronized preference survives, then grant access and confirm local reconstruction.
- [ ] Repeat with automatic site icons disabled on B and confirm the explicit manual preference still reconstructs.
- [ ] Confirm an ordinary automatically learned favicon still remains device-local and does not create `favPref` Sync metadata.
- [ ] With two disposable Firefox profiles/devices, repeat the 1.30.13 uninstall/0-byte catastrophic-loss acceptance scenario and confirm 1.30.14 still preserves/rebuilds safely.
- [ ] Close Firefox while a simulated/persisted quarantine is overdue, restart, and confirm no immediate authoritative recovery occurs before the fresh startup warm-up.
- [ ] Exercise **Clear Sync copy** on one device, verify peer stays waiting without republishing old data, then **Use this device** on the source and confirm the peer automatically receives only the new profile.
- [ ] Verify 1.30.11 live wallpaper/darkness preview remains immediate and Settings does not blank during repeated Separate Light/Dark changes.

## Important limitations

- MosaicSync cannot prevent Firefox/Chrome itself from uninstalling the extension or deleting browser-owned extension storage after uninstall. Recovery requires at least one surviving installation with a valid local profile.
- The exact Firefox/AMO trigger behind the original 1.30.11 uninstall-like lifecycle remains unproven and is not represented as fixed by 1.30.14.
- Manual favicon preference reconstruction depends on a corresponding favicon source being available locally or through already-permitted website access. If the site permanently removes/changes the selected candidate, MosaicSync retains the preference and may use a provisional local fallback rather than synchronizing the old pixels automatically.
- The compact favicon preference is identity metadata, not a cryptographic security primitive and not a substitute for **Sync this image** when exact historical pixels must travel between devices.

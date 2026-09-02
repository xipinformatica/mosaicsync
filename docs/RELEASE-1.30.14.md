# MosaicSync 1.30.14 publication notes

## Release status

MosaicSync 1.30.14 is a focused Sync-safety hardening and favicon-intent synchronization release on top of 1.30.13. It keeps the catastrophic-loss architecture intact while making zero detection/restart behavior more conservative, and adds a compact way to synchronize which detected favicon the user explicitly selected without placing the favicon image itself in the browser's roughly 100 KB `storage.sync` budget.

## Mozilla Developer Hub changelog

Hardened catastrophic Sync-loss recovery and added compact synchronization of manual detected-favicon choices. A previously healthy device now enters catastrophic-zero quarantine only when both `getBytesInUse(null)` reports zero and a full `storage.sync.get(null)` read is also empty. Persisted loss states receive a fresh browser-startup warm-up before recovery, and an MV3 worker interrupted during recovery observes a short persisted retry grace. Peers that observe an intentional reset remain safely waiting for a later authoritative profile instead of permanently dropping out of Sync, and the first complete post-reset profile replaces rather than merges the old pre-reset local state. Reset markers now require a non-empty initiating device ID. When the user chooses a detected favicon, MosaicSync synchronizes only a compact optional preference token; raw favicon URLs and image pixels remain local unless the existing **Sync this image** option is explicitly enabled. Receiving devices locally rediscover the preferred candidate through the existing bounded favicon pipeline. No new permissions, telemetry, backend, remote code, CSP relaxation or state/Sync schema-version change.

## Notes to Reviewer

1.30.14 is intentionally narrow. It follows the 1.30.13 catastrophic Sync-loss containment release and incorporates adversarial review findings plus one small user-intent Sync addition. The exact external Firefox/AddonManager reason the earlier 1.30.11 update entered an uninstall-like lifecycle remains unproven and is not represented as fixed here.

For catastrophic-zero detection, the first transition no longer trusts the quota API alone. An established device must observe both `browser.storage.sync.getBytesInUse(null) === 0` and an independently empty `browser.storage.sync.get(null)` namespace before it can enter loss quarantine. Once a loss state exists, partial/non-zero delivery still remains quarantined until a complete Personal+Work profile validates or a valid explicit-reset control record is observed. Non-zero partial/corrupt data that was never preceded by total loss continues through the pre-existing torn-delivery/checksum/previous-generation paths.

A quarantine/recovering state persisted across browser shutdown now receives a fresh startup warm-up if its prior deadline elapsed while the browser was closed. This prevents elapsed wall time while Firefox/Chrome was not running from being treated as evidence that browser Sync had a new-session opportunity to redeliver Extension-Storage. Before each recovery publication the worker also persists a short restart-grace deadline along with the incremented bounded attempt count. The current live publication proceeds normally; if MV3 terminates it halfway through, a replacement worker sees the persisted future deadline and waits rather than immediately starting another full recovery generation.

A peer observing the versioned non-zero reset marker now stays `syncEnabled` but uninitialized in the existing safe `await-remote` mode. It preserves its local profile while waiting and is not allowed to publish it. If another device later explicitly chooses **Use this device** and publishes a complete replacement, the waiting reset observer applies that verified post-reset profile as an authoritative replacement without merging the observer's pre-reset shortcuts/settings into the new epoch. This closes the previous behavior where a reset observer could remain permanently opted out of Sync. The reset-marker validator also rejects an empty initiating device ID. MosaicSync's own reset still writes the reset marker before removing other MosaicSync Sync keys and never calls `storage.sync.clear()`.

The favicon change synchronizes intent rather than artwork. A shortcut gains one optional compact `favPref` string only when the user explicitly clicks a candidate in **Choose detected favicon**. Browser-native choices use a tiny class token; site/network candidates use fixed-size hashes of the normalized source resource and selected image. The raw favicon URL, query parameters and favicon image bytes are not added to the shortcut Sync record. Shortcuts with no manual detected-favicon choice have no `favPref` field and therefore pay zero extra bytes.

On another device, a changed `favPref` invalidates stale device-local pixels associated with a different preference. The existing bounded favicon recovery queue then attempts to reconstruct the chosen candidate locally. Network/inline preferences require the already-granted Website Access permission and never prompt automatically. If permission is unavailable, the preference remains stored for later recovery. If the site's candidate moved or changed, MosaicSync may use the best currently discoverable favicon as a provisional local fallback while retaining the original preference for bounded retry. Explicit user preference recovery is independent of the workspace's automatic-site-icon toggle; user intent is not treated as automatic learning. Selecting other artwork or changing the shortcut URL clears the stale preference. The existing **Sync this image** option remains a separate explicit path for synchronized optimized image bytes.

The optional `favPref` field is additive and uses the existing shortcut/state/Sync schema versions. Existing automatic favicons do not acquire this field. No new permission, host permission, backend, analytics/telemetry, remote code, CSP relaxation or navigation capability is introduced. The 1.30.13 continuity/tombstone recovery architecture, 1.30.12 non-destructive lifecycle handling and separate Firefox development identity, and 1.30.11 Settings appearance paint-isolation invariant remain intact.

Automated Firefox and Chrome production-worker coverage includes false-zero quota reporting while records are visible, persisted quarantine after browser restart, persisted recovering-state retry grace, reset-observer waiting/rejoin without pre-reset resurrection, exact local reconstruction of a synchronized manual favicon choice, reconstruction with automatic site icons disabled, and compact preference Sync-budget checks, in addition to all existing catastrophic-loss, torn-delivery, conflict, security, localization and appearance regressions.
A deterministic three-device stress test also performs eight repeated catastrophic namespace wipes per browser, injects a normal edit before each wipe, pseudo-randomly selects the surviving recovery publisher, and asserts that all three devices preserve every expected shortcut and return to healthy convergence after each reconstruction.

The final automated release suite passes **663/663 tests** across 88 test files. The clean GitHub-ready source extraction also passes the same suite, performance benchmark and package-size guard, and reproduces the Firefox, Chrome, source and separate-ID Firefox development ZIPs byte-for-byte.

## GitHub release title

`MosaicSync 1.30.14`

## GitHub release description

MosaicSync 1.30.14 hardens the 1.30.13 catastrophic Sync-loss guard with independent zero confirmation, fresh startup/recovery restart grace and safer reset-peer rejoin semantics. It also synchronizes the user's manually selected detected-favicon preference as a tiny optional token rather than favicon pixels or raw URLs, allowing other devices to reconstruct the same choice locally without consuming meaningful image quota. No new permissions, telemetry, backend, remote code or schema-version bump.

## GitHub Desktop

**Summary:** `Release MosaicSync 1.30.14`

**Description:** `Harden catastrophic Sync zero/restart/reset handling and synchronize compact manual detected-favicon intent without syncing favicon pixels or adding permissions.`

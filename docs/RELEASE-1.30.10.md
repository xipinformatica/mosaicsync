# MosaicSync 1.30.10 publication notes

## Release status

MosaicSync 1.30.10 is a zero-new-features background performance and regression-hardening release on top of 1.30.9. It implements the mandatory worker-local verified device/profile snapshot generation cache without changing Sync conflict behavior, durable data, profile/snapshot schemas, watchdog frequency or user-facing behavior.

## Mozilla Developer Hub changelog

Zero-new-features background performance/refinement release. Complete device/profile snapshot generations that have already passed full decode and record/settings validation are now retained in a tiny worker-local cache bounded to MosaicSync's eight retained recent devices. Every reuse still revalidates the currently visible snapshot manifest, all expected chunks, chunk metadata, assembled length and compressed-data fingerprint before the cache may bypass repeated Base64 decoding, gzip decompression, JSON parsing and record-map reconstruction. Incomplete, corrupt, malformed or validation-failing generations are never cached as failures; previous-generation torn-delivery fallback remains intact and a later-completed current generation is accepted normally. Also made a historical Cross-Space equivalence test deterministic and removed a few proven-dead internal symbols. No new permissions, synchronized/profile schema, backend, telemetry, heartbeat, remote code, transport, UI or visual changes.

## Notes to Reviewer

Corrective/performance maintenance only. 1.30.10 leaves MosaicSync's synchronization semantics unchanged: `chooseNewerRecord`, tombstone deletion dominance, explicit cross-Space revival, delivered-value evidence, pre-publication rebase, authoritative post-write ledger, dataset ordering, foreground in-flight-only single-flight, 60-second foreground throttle and five-minute semantic watchdog are untouched.

The release adds a performance-only decoded-generation cache to the existing complete Personal+Work device snapshot reader. For chunked snapshots, MosaicSync still validates the current manifest/root, requires every expected chunk, validates each chunk's schema/device/commit/slot/index/total, assembles the current compressed Base64 data, checks `dataChars`, and recomputes/compares `dataFingerprint` on every read. Only after those current-delivery checks succeed does it look up the worker-local cache. A miss follows the unchanged expensive path: Base64 decode, gzip decompression through the existing decompressed-size ceiling, `TextDecoder`, `JSON.parse`, Personal/Work Map reconstruction and record/settings fingerprint/count validation. Only a fully successful result is cached.

The cache is bounded to `DEVICE_SNAPSHOT_MAX_RECENT_DEVICES` (currently 8) and uses LRU eviction. Its identity includes the generation plus all manifest metadata that affects the returned decoded snapshot or existing validation decisions. It is never persisted to `storage.local`, `storage.session` or `storage.sync`; disabling Sync clears it, and an MV3 worker restart simply causes future cache misses. No correctness depends on the cache.

Regression coverage exercises eight-device reuse with decode-count assertions, incomplete→complete delivery, corruption after a prior cache population, validation-metadata/generation invalidation, invalid-record and malformed-gzip non-caching, previous-generation fallback followed by later current completion, and Firefox/Chrome parity. The existing Cross-Space trusted/defensive equivalence test also now uses a deterministic logical clock so wall-clock millisecond boundaries cannot create false failures.

No permissions, host permissions, CSP, network scope, synchronized/profile schema, localization, Settings layout or user-facing feature changes are introduced.

## GitHub release title

`MosaicSync 1.30.10`

## GitHub release description

MosaicSync 1.30.10 is a zero-feature background performance and regression-hardening release. It adds a bounded worker-local cache for complete verified device/profile snapshot generations so repeated Sync status/watchdog reads no longer decompress and parse unchanged generations again. Current manifest/chunk completeness and compressed-data fingerprints are still revalidated before every cache hit; incomplete/corrupt generations and previous-generation fallback retain their existing safety behavior. The release also makes one historical timing-sensitive regression deterministic and removes a few proven-dead internal symbols. Sync conflict semantics, schemas, permissions and privacy behavior are unchanged.

## GitHub Desktop commit

**Summary:** `Release MosaicSync 1.30.10`

**Description:** `Cache only complete verified device/profile snapshot decodes after current chunk/fingerprint revalidation, harden torn-delivery/cache regressions, fix a flaky clock-sensitive test, and remove tiny proven-dead internals. Preserve all Sync semantics; zero new features or permissions.`

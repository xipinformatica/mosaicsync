# MosaicSync 1.30.10 QA / release-candidate checklist

## Scope

1.30.10 is a zero-new-features background performance and regression-hardening release. It implements the mandatory verified device/profile snapshot decode cache carried forward from 1.30.9. The cache is performance-only: every current manifest/chunk set is still revalidated against its assembled compressed-data fingerprint before a cached decoded generation can be reused. Sync conflict resolution, tombstones, cross-Space semantics, evidence repair, snapshot/profile schemas, watchdog timing and permissions remain unchanged.

## Automated release gates

- [x] Full Node regression suite passes after final 1.30.10 identity/build.
- [x] Performance benchmark passes with all 1.30.7/1.30.9 guards retained.
- [x] Package-size guard passes with reviewed 1.30.10 baseline.
- [x] Firefox and Chrome version identity is exactly `1.30.10` everywhere.
- [x] Firefox and Chrome package hygiene passes.
- [x] Clean GitHub-ready extraction passes the full suite and benchmark.
- [x] Clean source rebuilds Firefox/Chrome/GitHub-ready release ZIPs byte-for-byte identically.
- [x] Exactly three release ZIPs are emitted: `mosaicsync-1.30.10-firefox.zip`, `mosaicsync-1.30.10-chrome.zip`, `mosaicsync-1.30.10-github-ready.zip`.

## Mandatory cache coverage

- [x] Cache is background-worker memory only and bounded to `DEVICE_SNAPSHOT_MAX_RECENT_DEVICES` (currently 8).
- [x] Cache lookup occurs only after current root schema, chunk completeness/metadata, assembled length and `dataFingerprint` verification.
- [x] Cache insertion occurs only after successful Base64 decode, bounded gzip decompression, JSON parse and Personal/Work record/settings validation.
- [x] Eight unchanged complete device generations decode once on the first read and perform zero additional gzip decodes on the identical second read.
- [x] Incomplete generations fail before gzip, are not cached as failures, and are accepted/cached once the missing chunk later arrives.
- [x] A changed/corrupted visible chunk cannot be hidden by an older cache entry; the current compressed fingerprint is rechecked before lookup.
- [x] Manifest metadata and commit/generation changes invalidate the cache even when compressed payload bytes are identical.
- [x] Invalid record fingerprints and malformed gzip payloads are never cached as failures and are retried on later reads.
- [x] Torn current generation continues to fall back to the previous independently complete generation; a later-completed current generation then decodes and becomes authoritative.
- [x] Cache reuse preserves merged Personal+Work item semantics.
- [x] Disabling Sync clears the performance cache; worker-cache loss is never required for correctness.
- [x] Firefox and Chrome exercise identical cache semantics.

## Additional 1.30.10 refinement coverage

- [x] The historical Cross-Space defensive-vs-trusted equivalence regression now uses a deterministic logical clock and cannot fail merely because two calls cross a `Date.now()` millisecond boundary.
- [x] Proven-dead `selectActiveSpace()`, `PLATFORM_NAME` and `ACCOUNT_PROVIDER_NAME` vocabulary is removed while normalized selection and `PLATFORM_ID` remain.
- [x] Background normalized publication parameters are named to reflect that they already crossed `normalizeState()`.
- [x] Delivered-core evidence post-insertion pruning remains unchanged; the second prune is intentionally retained because it enforces the 256-entry bound after a brand-new key is inserted.
- [x] Final persistence normalization remains unchanged and continues to be the defensive durable-storage boundary.

## Required real-hardware checks

### Cross-device Sync

- [ ] Continue normal create/edit/delete and Personal↔Work use across existing machines; confirm convergence remains normal.
- [ ] Open Sync status repeatedly on a profile with several synchronized devices and confirm no functional change in reported remote state.
- [ ] Confirm normal recovery when one device has only partially received a newer snapshot generation.

### Existing Settings hardware gate

- [ ] Windows 11 / Firefox: Separate Light/Dark Wallpapers repeated toggles leave Settings painted and interactive.
- [ ] Linux Mint 22.3 Cinnamon/X11 / Firefox: Separate Light/Dark Wallpapers and Frequently Visited repeated toggles leave Settings painted and interactive.

## Automated result

- Full working-tree regression suite: **616/616 passed**.
- Fresh GitHub-ready extraction regression suite: **616/616 passed**.
- Performance benchmark: **PASS**; trusted Cross-Space move+intent remains ~1.6 ms on the 200-shortcut image-heavy stress fixture and the 1.30.9 trusted workspace replacement remains effectively object-copy scale, while the final defensive persistence normalization is unchanged.
- Deterministic cache regression: eight complete retained device generations require **8 expensive decodes on first read and 0 additional gzip/JSON decodes on the identical second read** in both Firefox and Chrome harnesses.
- Package-size guard: **PASS**. Firefox runtime: 1,966,512 raw bytes; Chrome runtime: 1,986,976 raw bytes.
- Preliminary deterministic packages: Firefox 606,833 bytes; Chrome 621,955 bytes. Final hashes are recorded with the release artifacts after the post-documentation deterministic rebuild.
- Clean-source package rebuild and byte-for-byte release comparison: **PASS** after final packaging.


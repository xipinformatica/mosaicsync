# MosaicSync 1.27.5 QA / tile-artwork, favicon-permission and build-integrity checklist

## Release identity
- [ ] Firefox manifest version = `1.27.5`.
- [ ] Chrome manifest version + `version_name` = `1.27.5`.
- [ ] Shared `VERSION`, visible Settings label, README, CHANGELOG, build manifest and package-size baseline = `1.27.5`.

## Shortcut artwork sizing
- [ ] Default 76 px tile uses 58 px contained artwork (~76%).
- [ ] 60 px and 96 px slider endpoints remain within the intended 75–80% artwork footprint.
- [ ] Built-in top-level icons use 78% of the tile.
- [ ] Uploaded images, detected favicons, ordinary favicons and fallback letters scale with the same contain footprint.
- [ ] Cover mode remains 100% edge-to-edge and tile/grid dimensions do not change.
- [ ] First paint and authoritative render use the same artwork ratio.

## Manual favicon chooser
- [ ] Cache reads begin with a live `hasWebAccess({ refresh: true })` check.
- [ ] Revoke Website Access after caching candidates; reopening the picker must show permission-required behavior rather than cached candidates.
- [ ] Redirect-origin `/favicon.ico` and the first conventional fallback share the existing max-two batch.
- [ ] Maximum manual candidate fetch/decode concurrency remains 2.
- [ ] Automatic favicon resolver/ranking/winner/single-flight behavior remains unchanged.

## Public Suffix List
- [ ] Source semantic rules = 10,248; wildcards = 283; exceptions = 8; semantic SHA-256 matches the reviewed 1.27.5 baseline.
- [ ] Runtime PSL header records rule counts/hash and preserves MPL/upstream provenance.
- [ ] Exact, private, wildcard, exception and IDN registrable-domain vectors match between source and both browser runtime PSLs.
- [ ] Duplicate rules, embedded whitespace or implausible rule-count collapse fail the build/tests.

## Package-size/build integrity
- [ ] Total/category >15% growth guard passes against the consciously updated 1.27.5 baseline.
- [ ] Baseline categories cannot silently disappear or appear.
- [ ] Significant top-file growth triggers combined absolute/percentage guardrails.
- [ ] JavaScript and Python size-category classifiers agree.
- [ ] Category raw/deflated sums equal reported totals.
- [ ] Clean build is deterministic and runtime ZIPs reproduce byte-for-byte.

## Locales / CSS
- [ ] All 32 compact runtime catalogs exactly match readable source catalogs.
- [ ] Special-character/Unicode/newline/placeholder-like locale fuzz regression passes.
- [ ] New Tab CSS class-selector audit reports no unreferenced class selectors; remove nothing speculatively.

## Security / compatibility
- [ ] No permission/host-permission/CSP changes from 1.27.4 except version identity.
- [ ] Local state schema remains 18 and Sync record schema remains 10.
- [ ] No telemetry, remote code or new remote service.

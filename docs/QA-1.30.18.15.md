# MosaicSync 1.30.18.15 QA / release-candidate checklist

## Scope

Step 3.1 shared-background consolidation plus the pre-publication audit corrections only. Step 2 remains frozen. The only user-visible correction is named Sync receipt attribution in Settings. No schema/permission/CSP change.

## Automated gates

- [x] Full regression suite passes: 862/862 in the working source and 862/862 from the first clean GitHub-ready extraction.
- [x] Shared background core is byte-identical in generated Firefox and Chrome runtimes.
- [x] Browser entrypoints/adapters do not redeclare canonical Sync/Recovery/background semantics.
- [x] Chrome permission-free `_favicon` ordering and Firefox Website Access gating are behavioral tests rather than refactor-fragile source-slice checks.
- [x] Real Firefox/Chrome background listener topology is identical and registered once.
- [x] Firefox-only `data_collection` permission revocation remains platform-specific; the same synthetic event is ignored by Chrome.
- [x] Settings receipt attribution uses `lastRemoteReceiptOriginDeviceName` when available, short device ID when only identity is known, and the generic fallback otherwise.
- [x] All 33 UI locale catalogs contain the 432-key catalog with matching placeholders, including `receivedFromDevice:{name}`.
- [x] Benchmark completes without material regression.
- [x] Package size baseline consciously updated.
- [x] Release-contract validation passes for both browser packages.
- [x] First clean GitHub-ready source reproduction regenerates Firefox, Chrome and GitHub-ready packages byte-for-byte.

## Measured certification results

- Regression suite: 862/862.
- Firefox runtime: 2,152,061 raw bytes; 633,396 deflated bytes.
- Chrome runtime: 2,173,798 raw bytes; 648,043 deflated bytes.
- Versus the first 1.30.18.15 candidate: +257 Firefox deflated bytes and +257 Chrome deflated bytes, primarily the localized named-receipt label and its tiny UI helper.
- Browser-owned background source remains two 9-line entrypoints plus 70-line Firefox and 63-line Chrome adapters; the canonical shared background core remains approximately 6,817 lines.
- First clean reproduction SHA-256 values matched the working packages exactly before this QA document was stamped:
  - Firefox: `2745b10c4dd10de12f5d0e2e75778c0976254c57480c6f4eca9149c722a00946`
  - Chrome: `b9e26f540ae28c627c2a975b7e88737557b91ff88dab1d83df420b27443f1bb3`
  - GitHub-ready source: `f9ce741e46a474ea64d89598efc30b36e9d5cdc92a219c87e5a67db037a28d8a`

Representative working-source benchmark values:

- `normalizeState(200)`: 85.356 ms average.
- `stableStringify(200)`: 31.040 ms average.
- `projectStateToLocalAssets(200)`: 58.211 ms average.
- `createWriteBaseline(200)`: 83.350 ms average.
- active-Space hydration: 0.071 ms average.
- startup normalize with validated memo: 27.337 ms average.
- startup baseline with validated memo: 28.252 ms average.
- normalized flatten fast path: 0.605 ms average.
- normalized Settings fast path: 0.007 ms average.
- cross-Space move + intent: 1.720 ms average.

Representative first-clean-source values remained in the same range, including 88.098 ms normalize, 88.092 ms write baseline, 0.603 ms normalized flatten fast path and 1.692 ms cross-Space move + intent. No material performance regression was observed.

This QA record is frozen after the first deterministic clean-source reproduction. The exact post-QA GitHub-ready archive is independently re-extracted, tested, benchmarked, size-checked and repackaged as the final external handoff gate. That final result is reported with the release artifacts rather than written back into this file, avoiding self-referential archive-hash churn.

## Manual browser checks

- [ ] Firefox: verify the receipt card shows the real remote device name after another named MosaicSync device delivers a Sync update.
- [ ] Firefox: enable/disable Sync and verify status/Recovery behavior.
- [ ] Firefox: automatic/manual favicon behavior smoke test.
- [ ] Chrome: verify the receipt card shows the real remote device name after another named MosaicSync device delivers a Sync update.
- [ ] Chrome: enable/disable Sync and verify status/Recovery behavior.
- [ ] Chrome: native `_favicon` and Chrome Web Store favicon smoke test.

Manual checks are intentionally not claimed by automated certification.

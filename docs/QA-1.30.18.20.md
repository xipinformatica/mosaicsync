# MosaicSync 1.30.18.20 QA / release-candidate checklist

## Scope freeze

- [x] Authoritative starting source is the certified 1.30.18.19 GitHub-ready archive.
- [x] Step 4 production work begins only behind the 1.30.18.19 Recovery characterization gate.
- [x] Scope is limited to extracting immutable Recovery-generation representation/validation ownership.
- [x] No product feature, UI, permission, CSP, telemetry/backend or browser-history privacy change.
- [x] No state/meta/Sync/Recovery schema version, persisted key or payload-format change.
- [x] Step-1 first paint, Step-2 state/session/cache ownership and Step-3 browser capability boundaries remain frozen.

## Recovery-generation boundary assertions

- [x] `src/shared/background/recovery-generation-format.js` owns key derivation/classification, bounded gzip codec, manifest/chunk validation, complete-profile metadata validation, previous-generation descriptors, generation ordering descriptors and the bounded decode cache.
- [x] The new module contains no `browser.storage`, publication, quota, alarm, mutation-journal or catastrophic-continuity policy.
- [x] Generated Firefox and Chromium format modules are byte-identical.
- [x] Modern immutable root namespace/key encoding is unchanged.
- [x] Legacy fixed-root and a/b chunk readers remain available.
- [x] Legacy previous-profile descriptor fields remain unchanged.
- [x] Complete Personal+Work payload version/validation remains backward compatible.
- [x] A torn/missing chunk fails closed even after the same manifest has warmed the decode cache.
- [x] Decode-cache state remains performance-only; every visible generation revalidates its manifest/chunk/fingerprint prerequisites before cache reuse.

## Frozen orchestration assertions

- [x] `storage.sync` publication remains in `background-core.js`.
- [x] Immutable generation publication remains chunks-first and authoritative-root-last.
- [x] Post-publication verification remains in the core.
- [x] Quota-aware retirement and verified-fallback preservation remain in the core.
- [x] Stale/orphan Recovery-generation GC remains in the core.
- [x] Normal Sync merge/reconciliation policy remains in the core.
- [x] Pending local/cross-Space mutation journals remain unchanged.
- [x] Catastrophic continuity/quarantine/restart/alarm logic remains unchanged.
- [x] Browser background adapters are byte-for-byte unchanged from 1.30.18.19.

## Automated gates

- [x] Full 1.30.18.20 regression suite passes: 881/881.
- [x] Release-contract validation passes for both generated browser trees and candidate packages.
- [x] Benchmark and package-size checks pass.
- [x] Consecutive deterministic builds produce identical generated runtime hashes.
- [x] Frozen Step-1/2/3 and browser-capability surfaces are byte-for-byte compared against certified 1.30.18.19.
- [x] First clean GitHub-ready candidate extraction rebuilds/tests/packages byte-for-byte.
- [x] Exact post-QA handoff archive receives a final independent clean-extraction/reproducibility gate before external handoff; final hashes are reported outside this self-contained QA source file.

## Measured certification results

- Authoritative starting source: certified `mosaicsync-1.30.18.19-github-ready.zip`, SHA-256 `6f5040fd512282283427547e4fd7a3f064b89891a1b1e88c22b1742dc4e76390`.
- Baseline 1.30.18.19 suite before changes: 878/878 passing.
- Final 1.30.18.20 suite: 881/881 passing (three new Recovery-generation ownership/compatibility regressions).
- Shared background core reduced from 6,818 to 6,477 lines; the new representation module is 434 lines. This is ownership movement, not algorithm removal.
- Firefox runtime: 2,163,547 raw bytes; 637,546 deflated bytes (+2,986 raw / +1,647 deflated versus 1.30.18.19).
- Chrome runtime: 2,185,191 raw bytes; 652,062 deflated bytes (+2,986 raw / +1,647 deflated versus 1.30.18.19).
- `newtab-critical.css` remains byte-for-byte unchanged from 1.30.18.19 (SHA-256 `393de380f041f30669e447ff9d1b1b89375ad754904674525dbe7971c801f771`).
- Frozen production surfaces byte-for-byte unchanged from 1.30.18.19 include both browser background adapters; model/storage/profile/common permission policy; New Tab runtime/first-paint bootstraps/CSS; and Chrome platform/i18n/shim/permission capability modules.
- 1.30.18.20 shared background core SHA-256: `0364b1ed50e55c976637b2e0e2dcddefbb575317369dfa262ffd2af45c936a80`.
- Recovery-generation format module SHA-256: `d8cdd447f9d9c2e1eb964767cdd2da4f3335e2009d5dd609f942e5f08561014b`.
- Firefox adapter SHA-256 remains `31a7356175eb8ee1a8846d42a1b36f80d902a8bf4d397fc9138352606f5dd429`.
- Chrome adapter SHA-256 remains `9ffc27d49e6fdbe6c717401da2167cc170b76dfbca4542baa74ff57be6cd6940`.
- Consecutive deterministic `build-manifest.json` SHA-256: `cebf9850dc9bec64feac94c9be065b0b5fe6e41e9110a1f3612160f6020dec3f`.

Representative benchmark run completed successfully:

- `normalizeState(200)`: 87.870 ms average.
- `stableStringify(200)`: 29.580 ms average.
- `projectStateToLocalAssets(200)`: 58.961 ms average.
- `createWriteBaseline(200)`: 86.937 ms average.
- active-Space hydration: 0.075 ms average.
- startup normalize with validated memo: 30.793 ms average.
- startup baseline with validated memo: 28.377 ms average.
- normalized flatten fast path: 0.719 ms average.
- normalized Settings fast path: 0.009 ms average.
- cross-Space move + intent: 1.721 ms average.

Absolute timings are environment-sensitive; preservation evidence is the green generated-runtime Recovery suite, unchanged frozen surfaces, exact representation compatibility tests and deterministic build output.

First clean-source candidate reproduction was byte-for-byte deterministic:

- Firefox candidate/reproduction SHA-256: `a3fd4c4da6d58336baff96acb8d3a81b635189d13d8cca9ca85e23690a052c27`.
- Chrome candidate/reproduction SHA-256: `0bedae8f40d3f78a61beb03277c9390b85f2708f6bccc7c00335827d343513a0`.
- GitHub-ready candidate/reproduction SHA-256: `9ca7880c62c87ed9a52e34a4f05bf89b467f9eb1da97afd875b8d1b3b52ac871`.

This QA record is now frozen. The exact post-QA GitHub-ready archive is re-extracted, tested, contract-validated and repackaged as the final external handoff gate; final hashes are reported in the handoff to avoid self-referential source-archive churn.

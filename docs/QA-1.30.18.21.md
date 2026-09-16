# MosaicSync 1.30.18.21 QA / release-candidate checklist

## Scope freeze

- [x] Authoritative starting source is the certified 1.30.18.20 GitHub-ready archive.
- [x] Scope is limited to Recovery-generation storage/publication mechanics.
- [x] Format/validation ownership remains in `recovery-generation-format.js`.
- [x] Publication trust, normal Sync merge policy, quota retirement, fallback retention, GC, journals and catastrophic continuity remain in `background-core.js`.
- [x] No product feature, UI, permission, CSP, telemetry/backend, privacy-boundary or persisted-schema change.

## Recovery storage boundary

- [x] `recovery-generation-store.js` owns complete-profile wire-publication assembly, verified reads, own-generation selection, immutable commit/rollback and post-write verification.
- [x] New generation chunks are written before the authoritative root.
- [x] A failed root write rolls back only the new generation chunks.
- [x] The previous verified complete generation remains available throughout publication.
- [x] The 96-part ceiling is centralized as `DEVICE_SNAPSHOT_MAX_CHUNKS` without changing its value.
- [x] Generated Firefox and Chromium store modules are byte-identical.
- [x] The new module contains no browser adapter, capacity/retirement/GC, journal or catastrophic-continuity policy.

## Automated gates

- [x] Full regression suite passes.
- [x] Release-contract validation passes for generated trees and packages.
- [x] Benchmark and package-size checks pass.
- [x] Consecutive builds are deterministic.
- [x] Unified 1.30.18.21 release identity is verified everywhere.
- [x] Exact final artifacts pass independent clean-extraction/reproducibility certification.

## Certification results

- Authoritative 1.30.18.20 source archive SHA-256: `11f8ca4aeddee9460026ad20fb745a84c0d9ef687b5d096b595c4bb1dcb1ca25`.
- Baseline 1.30.18.20 suite before changes: 881/881 passing.
- Final 1.30.18.21 suite: 886/886 passing (five new direct Recovery-store regressions).
- Firefox runtime: 2,168,380 raw bytes; 639,088 deflated bytes (+4,833 raw / +1,542 deflated versus 1.30.18.20).
- Chrome runtime: 2,190,024 raw bytes; 653,604 deflated bytes (+4,833 raw / +1,542 deflated versus 1.30.18.20).
- Shared background core reduced from 6,477 to 6,407 lines. The format module is 440 lines and the new store is 204 lines.
- Shared background core SHA-256: `1a091a445114c59d9bb2a77689c40d79a98d5c97912db17d73bda31606f70948`.
- Recovery format SHA-256: `82b89bc869af9ff8044916fae980c852aca89b6e58693d3dec75a14a41353128`.
- Recovery store SHA-256: `f7ca8def13917ee7785c2bc725d5cdd8e1997d121af5e7f3e95b9d85fe6059a1`.
- Firefox adapter SHA-256 remains `31a7356175eb8ee1a8846d42a1b36f80d902a8bf4d397fc9138352606f5dd429`.
- Chrome adapter SHA-256 remains `9ffc27d49e6fdbe6c717401da2167cc170b76dfbca4542baa74ff57be6cd6940`.
- `newtab-critical.css` SHA-256 remains `393de380f041f30669e447ff9d1b1b89375ad754904674525dbe7971c801f771`.
- Consecutive deterministic `build-manifest.json` SHA-256: `24356a8834b69e9552e2969dec25fc1f5cb80d32ff663f42342236e80f7c5f06`.
- Compared with the authoritative `.20` tree, production-source differences are confined to the two versioned manifests, the Settings version label, shared constants, shared background core/format, and the new store module.

Representative benchmark run completed successfully:

- `normalizeState(200)`: 83.113 ms average.
- `stableStringify(200)`: 15.448 ms average.
- `projectStateToLocalAssets(200)`: 57.567 ms average.
- `createWriteBaseline(200)`: 79.431 ms average.
- active-Space hydration: 0.037 ms average.
- startup normalize with validated memo: 28.463 ms average.
- startup baseline with validated memo: 30.995 ms average.
- normalized flatten fast path: 0.673 ms average.
- normalized Settings fast path: 0.006 ms average.
- cross-Space move + intent: 1.502 ms average.

Absolute benchmark timings are environment-sensitive. Preservation evidence is the green generated-runtime Recovery suite, direct root-order/rollback tests, frozen unrelated production surfaces and deterministic browser output. Final artifact hashes are reported with the external handoff so this source record remains non-self-referential.

# MosaicSync 1.30.18.24 QA / release-candidate checklist

## Scope freeze

- [x] Authoritative starting source is the certified 1.30.18.23 GitHub-ready archive.
- [x] Scope is limited to the catastrophic-Recovery continuity ownership boundary.
- [x] No feature, UI, permission, CSP, telemetry/backend, privacy, normal Sync, persisted-format, or timing-policy change.
- [x] Steps 1–3 and Step-4 format/store/lifecycle boundaries remain frozen.

## Ownership and safety contract

- [x] Continuity and retained-tombstone normalization belong to the pure continuity module.
- [x] Stale penalty, device jitter, startup deferral, quarantine, attempt/restart-grace, retry/failure, healthy/recovered, and intentional-reset transition planning belong to that module.
- [x] Browser storage reads/writes, clock observation, alarms, diagnostics/status, Recovery publication/verification, pending replay, reset effects, and normal Sync remain in the core orchestrator.
- [x] The transient-zero double check still precedes quarantine, and restart grace is persisted before publication.
- [x] Recovery publication and verification still precede pending cross-Space and local mutation replay.
- [x] `.23` keys, schemas, state names, payloads, timing constants, attempt limit, and transition behavior remain unchanged.

## Automated gates

- [x] Full regression suite passes.
- [x] Direct continuity equivalence and MV3 restart tests pass.
- [x] Generated Firefox/Chromium transient-zero, partial-delivery, retry-exhaustion, reset, and pending-journal interruption scenarios pass.
- [x] Release-contract validation passes for generated trees and packages.
- [x] Benchmark and package-size checks pass.
- [x] Firefox/Chrome core, format, store, lifecycle, and continuity modules are pairwise byte-identical.
- [x] Consecutive builds are deterministic.
- [x] Unified 1.30.18.24 identity is verified everywhere.
- [x] Exactly three release ZIPs are emitted.
- [x] Final artifacts pass clean-extraction and byte-for-byte reproducibility certification.

## Certification results

- Authoritative 1.30.18.23 source archive SHA-256: `0f33a8d50da59aac25a8a29e8c71a4c50f81cc8ed01d1c52d8f001d436f66676`.
- Baseline 1.30.18.23 suite before changes: 913/913 passing.
- Final 1.30.18.24 suite: 923/923 passing (10 direct `.24` continuity regressions plus all historical Recovery and product contracts).
- Firefox runtime: 2,181,681 raw bytes; 642,937 deflated bytes (+4,613 raw / +1,632 deflated versus 1.30.18.23).
- Chrome runtime: 2,203,325 raw bytes; 657,452 deflated bytes (+4,613 raw / +1,631 deflated versus 1.30.18.23).
- Shared background core: 6,158 lines / 287,834 bytes; SHA-256 `f04f10b902377fdf13c7cfb5b287fb7bc6c0306cec563f32ba1ad01351ab186a` (105 lines / 4,607 bytes smaller than `.23`).
- Recovery continuity: 245 lines / 9,220 bytes; SHA-256 `062514d29b3edc1ebfdfac01c1c12a5c30e632eb5f0379b44fd4da9d19ea08bf`.
- Recovery format remains 440 lines / 19,900 bytes; SHA-256 `7aee2c83254cbfbebc7acaabbb40589fa3ced75ea66b030d311ea7a9f32c4a86`.
- Recovery store remains 204 lines / 8,181 bytes; SHA-256 `a86b7c82b49177b8af86d981e5f77a8914539428ca9b22991da644c7140ebd2a`.
- Recovery lifecycle remains 338 lines / 15,095 bytes; SHA-256 `6c59bc6dbb9a6797a4be99d32cec84f82c4a732cc4ebc379ba5cb56bf6853ee4`.
- Firefox and Chrome generated core, format, store, lifecycle, and continuity modules are pairwise byte-identical.
- Consecutive deterministic `build-manifest.json` SHA-256: `8a5b455d7011d5395f68168d25c7dc6fbffa05141a892fa12193b2fb2d205ab0`.
- Production-source changes from `.23` are confined to version identity and the shared Recovery core/continuity seam. Browser adapters, capabilities, permissions, schemas, timing policy, and UI behavior are unchanged.
- Representative benchmark run: `normalizeState(200)` 159.353 ms, `stableStringify(200)` 53.856 ms, validated-memo startup normalization 47.550 ms, normalized flatten fast path 1.427 ms, normalized Settings fast path 0.011 ms, and cross-Space move+intent 3.404 ms average. Absolute timings are environment-sensitive.
- A clean extraction of the GitHub-ready archive rebuilt both runtimes, passed all 923 tests, reproduced all three archives byte-for-byte, and passed package contract validation.
- Final ZIP hashes are reported with the external handoff so this source record remains non-self-referential.
- Five-step roadmap status after this release: Steps 1–3 complete and frozen; Step 4 implementation complete and awaiting the requested forensic audit before freeze; Step 5 not started. Numerical progress: Step 4 implementation 100%, overall journey 80%.

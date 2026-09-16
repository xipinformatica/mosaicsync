# MosaicSync 1.30.18.23 QA / release-candidate checklist

## Scope freeze

- [x] Authoritative starting source is the certified 1.30.18.22 GitHub-ready archive.
- [x] Scope is limited to the Recovery lifecycle ownership boundary.
- [x] No feature, UI, permission, CSP, telemetry/backend, privacy, normal Sync, or persisted-format change.
- [x] Steps 1–3 and Step-4 format/store boundaries remain frozen.

## Ownership and safety contract

- [x] Verified-generation classification belongs to the pure lifecycle module.
- [x] Quota-capacity, fallback-retirement, superseded-retention, and stale/orphan GC decisions belong to that module.
- [x] Browser Sync reads/removals, local metadata writes, and scheduling remain in the core orchestrator.
- [x] Destructive retirement requires the same proof in an initial and fresh pre-delete Sync view.
- [x] `.22` fallback readability, verified-only retention, observation aging, orphan grace, future-schema preservation, and root-last publication behavior remain unchanged.
- [x] Lifecycle decisions are deterministic across an MV3 worker restart and contain no hidden mutable state.

## Automated gates

- [x] Full regression suite passes.
- [x] Release-contract validation passes for generated trees and packages.
- [x] Benchmark and package-size checks pass.
- [x] Firefox/Chrome lifecycle modules are byte-identical.
- [x] Consecutive builds are deterministic.
- [x] Unified 1.30.18.23 identity is verified everywhere.
- [x] Final artifacts pass clean-extraction and byte-for-byte reproducibility certification.

## Certification results

- Authoritative 1.30.18.22 source archive SHA-256: `1934be51526ea71cf6dfa74bed35f6ebb4ad9e971fa743fd24afbdf30fe8e2bc`.
- Baseline 1.30.18.22 suite before changes: 904/904 passing.
- Final 1.30.18.23 suite: 913/913 passing (9 direct `.23` lifecycle regressions, with historical Recovery contracts migrated to the new owner).
- Firefox runtime: 2,177,068 raw bytes; 641,305 deflated bytes (+3,974 raw / +1,038 deflated versus 1.30.18.22).
- Chrome runtime: 2,198,712 raw bytes; 655,821 deflated bytes (+3,974 raw / +1,038 deflated versus 1.30.18.22).
- Shared background core: 6,263 lines / 292,441 bytes; SHA-256 `af3308deecd3087e994e78ade52e8a4e4c40d48eb1a14930849fae5b0dc54f45` (217 lines / 11,212 bytes smaller than `.22`).
- Recovery lifecycle: 338 lines / 15,095 bytes; SHA-256 `6c59bc6dbb9a6797a4be99d32cec84f82c4a732cc4ebc379ba5cb56bf6853ee4`.
- Recovery format remains 440 lines; its only `.23` difference is an ownership comment. SHA-256 `7aee2c83254cbfbebc7acaabbb40589fa3ced75ea66b030d311ea7a9f32c4a86`.
- Recovery store remains 204 lines; its only `.23` difference is an ownership comment. SHA-256 `a86b7c82b49177b8af86d981e5f77a8914539428ca9b22991da644c7140ebd2a`.
- Firefox and Chrome generated core, format, store, and lifecycle modules are pairwise byte-identical.
- Consecutive deterministic `build-manifest.json` SHA-256: `6c6c0eba63d9331e74df4cdf63b72da7c99abff94104e198bac2979b051674dd`.
- Production-source changes from `.22` are confined to version identity, the shared Recovery core/lifecycle seam, and ownership-only comments in the format/store modules. Adapters, capabilities, permissions, schemas, and UI behavior are unchanged.
- Representative benchmark run: `normalizeState(200)` 154.665 ms, `stableStringify(200)` 50.943 ms, validated-memo startup normalization 46.933 ms, normalized flatten fast path 1.255 ms, normalized Settings fast path 0.011 ms, and cross-Space move+intent 2.690 ms average. Absolute timings are environment-sensitive.
- A clean extraction of the GitHub-ready archive rebuilt both runtimes, passed all 913 tests, reproduced all three archives byte-for-byte, and passed package contract validation.
- Final ZIP hashes are reported with the external handoff so this source record remains non-self-referential.
- Expected five-step roadmap status after this release: Step 4 approximately 90% complete; overall journey approximately 78% complete.

# MosaicSync 1.30.18.22 QA / release-candidate checklist

## Scope freeze

- [x] Authoritative starting source is the certified 1.30.18.21 GitHub-ready archive.
- [x] Scope is limited to the audited Recovery publication/retention/cleanup weakness.
- [x] No product feature, UI, permission, CSP, telemetry/backend, privacy-boundary, normal Sync or persisted-format change.
- [x] Steps 1–3 and the 1.30.18.20–.21 Recovery module boundaries remain frozen.

## Safety contract

- [x] A new immutable generation verifies its own root and chunks before normal pruning.
- [x] A `previousProfile` fallback read cannot prove the torn carrier root or consume a verified-retention slot.
- [x] Only independently verified complete Personal+Work generations count toward retention and GC caps.
- [x] Current-schema unreadable roots receive elapsed-time and repeated-observation grace.
- [x] Unknown/future schemas are preserved.
- [x] Pruning and GC re-read and re-decode Sync immediately before deletion.
- [x] Partial multi-batch chunk-write failure removes all attempted new chunk keys and no established root.

## Automated gates

- [x] Red-first regressions reproduce the audited `.21` weakness on Firefox and Chromium.
- [x] Full regression suite passes.
- [x] Release-contract validation passes for generated trees and packages.
- [x] Benchmark and package-size checks pass.
- [x] Consecutive builds are deterministic.
- [x] Unified 1.30.18.22 release identity is verified everywhere.
- [x] Exact final artifacts pass clean-extraction and byte-for-byte reproducibility certification.

## Certification results

- Authoritative 1.30.18.21 source archive SHA-256: `f7db4d325b489dfc57ea721393f5cbbe8800f1a8b83b426c51cb9701dbed704b`.
- Baseline 1.30.18.21 suite before changes: 886/886 passing.
- The initial `.21` implementation failed the new retention/verification safety regressions as expected; the final `.22` implementation passes them on both generated browser runtimes.
- Final 1.30.18.22 suite: 904/904 passing (18 new `.22` regressions after loop expansion across both generated runtimes).
- Firefox runtime: 2,173,094 raw bytes; 640,267 deflated bytes (+4,714 raw / +1,179 deflated versus 1.30.18.21).
- Chrome runtime: 2,194,738 raw bytes; 654,783 deflated bytes (+4,714 raw / +1,179 deflated versus 1.30.18.21).
- Shared background core: 6,480 lines / 303,653 bytes; SHA-256 `c7f125d09370354915ce8a6db7896b967384a1664c81e30e2f4829142354572c`.
- Recovery format remains 440 lines and byte-identical to 1.30.18.21; SHA-256 `82b89bc869af9ff8044916fae980c852aca89b6e58693d3dec75a14a41353128`.
- Recovery store remains 204 lines; SHA-256 `297edd7610d098d468db4827e0b54521e0541213a904e0d8c89b3cdf6ad9bfde`.
- Firefox and Chrome generated core, format and store modules are pairwise byte-identical. Browser adapters and critical New Tab CSS are unchanged.
- Consecutive deterministic `build-manifest.json` SHA-256: `981a5a006448c46df409554c190c80a9278c9dcfc0fb5220ccc7712b05040287`.
- Production-source differences from 1.30.18.21 are confined to version identities plus `background-core.js` and `recovery-generation-store.js`; adapters, format, UI behavior, permissions and schemas are unchanged.
- Representative benchmark run: `normalizeState(200)` 83.013 ms, `stableStringify(200)` 15.561 ms, validated-memo startup normalization 27.310 ms, normalized flatten fast path 0.594 ms, normalized Settings fast path 0.006 ms, and cross-Space move+intent 1.374 ms average. Absolute timings are environment-sensitive.
- Final ZIP hashes are reported with the external handoff so this source record remains non-self-referential.

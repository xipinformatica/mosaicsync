# MosaicSync 1.30.18.19 QA / release-candidate checklist

## Scope freeze

- [x] Authoritative starting source is the certified 1.30.18.18 GitHub-ready archive.
- [x] Scope combines only the post-1.30.18.18 FV first-frame findings and pre-Step-4 Recovery characterization agreed after independent Claude/Mistral/source audits.
- [x] No new product feature.
- [x] No Recovery/Sync production refactor in this release.
- [x] No state/meta/Sync/Recovery schema, persisted-key, permission, CSP, telemetry/backend or automatic-favicon Sync-policy change.
- [x] Step-2 privacy/ownership remains frozen: browser-derived FV sites/titles/URLs/favicons and actual live cardinality remain session/live-only.

## Frequently Visited corrective assertions

- [x] Synchronous FV reservation occupies configured responsive geometry before shortcut first paint but the complete reservation is paint-hidden, not merely `aria-hidden`.
- [x] Reservation cards are non-interactive and cannot flash normal FV tile chrome.
- [x] Sparse authoritative results retain configured capacity through invisible layout placeholders; an enabled/10 configuration no longer collapses from two rows to one merely because only five live sites are available.
- [x] Enabled-but-empty authoritative results preserve configured geometry instead of collapsing underneath an already-painted shortcut grid.
- [x] Missing Top Sites permission reuses the reserved capacity with an absolute recovery overlay instead of adding a normal-flow row.
- [x] Disabled FV preserves the original zero-space startup behavior.
- [x] Real visible FV cards still prepare off-DOM and wait for favicon decode/fallback settlement before commit.
- [x] No new browser-history-derived information is written to persistent render-manifest/profile/Sync/Recovery state.
- [x] `newtab-critical.css` is unchanged; the fix does not grow the reviewed blocking-CSS budget.

## Recovery characterization assertions

- [x] Generated Firefox production background: a durable pending local mutation survives catastrophic remote namespace loss and remains quarantined before Recovery authority exists.
- [x] Generated Chromium production background: same invariant.
- [x] Recovery reconstructs/verifies authoritative remote state before the pending mutation may replay.
- [x] Pending local edit remains locally preserved throughout quarantine and recovery.
- [x] Existing generated-runtime worker-restart grace coverage remains present and green.
- [x] Existing failed immutable root-commit fallback, invalid snapshot/decompression and quota-aware verified-fallback guards remain present and green.
- [x] `src/shared/background/background-core.js` and both browser background adapters are byte-for-byte unchanged from 1.30.18.18.

## Automated gates

- [x] Full 1.30.18.19 regression suite passes: 878/878.
- [x] Release-contract validation passes for both generated browser trees and candidate packages.
- [x] Benchmark and package-size checks pass.
- [x] Consecutive deterministic builds produce identical generated runtime hashes.
- [x] High-risk frozen surfaces are byte-for-byte compared against certified 1.30.18.18.
- [x] First clean GitHub-ready candidate extraction rebuilds/tests/packages byte-for-byte.
- [x] Exact post-QA handoff archive receives a final independent clean-extraction/reproducibility gate before external handoff; final hashes are reported outside this self-contained QA source file.

## Measured certification results

- Authoritative starting source: certified `mosaicsync-1.30.18.18-github-ready.zip`, SHA-256 `766bf016900cfbc2f9ea29c20596134fb0945a35703c3c0a181ccbf72d5e7e42`.
- Baseline 1.30.18.18 suite before changes: 872/872 passing.
- Final 1.30.18.19 suite: 878/878 passing (six net new regressions/characterization checks).
- Firefox runtime: 2,160,561 raw bytes; 635,899 deflated bytes (+4,456 raw / +890 deflated versus 1.30.18.18).
- Chrome runtime: 2,182,205 raw bytes; 650,415 deflated bytes (+4,456 raw / +890 deflated versus 1.30.18.18).
- `newtab-critical.css` remains byte-for-byte unchanged from 1.30.18.18 (SHA-256 `393de380f041f30669e447ff9d1b1b89375ad754904674525dbe7971c801f771`) and remains below the reviewed 35,500-byte blocking-CSS budget.
- High-risk frozen production surfaces byte-for-byte unchanged from 1.30.18.18 include: shared background core; both browser background adapters; model/storage/profile/common permission policy; `render-bootstrap.js`; `session-bootstrap.js`; `local-storage-bootstrap.js`; critical CSS; secondary CSS.
- Shared background core SHA-256 remains `0fe1c65a54074c5a0cb13edb56e566412bdea5af97d40b9e9c97ad741c58565d`.
- Firefox adapter SHA-256 remains `31a7356175eb8ee1a8846d42a1b36f80d902a8bf4d397fc9138352606f5dd429`.
- Chrome adapter SHA-256 remains `9ffc27d49e6fdbe6c717401da2167cc170b76dfbca4542baa74ff57be6cd6940`.
- Consecutive deterministic `build-manifest.json` SHA-256: `2d0d3510c4860dad1ab0984867e6a6be91b3997ba0a846e0f5c04ed5ed001296`.

Representative benchmark run completed successfully:

- `normalizeState(200)`: 84.401 ms average.
- `stableStringify(200)`: 28.441 ms average.
- `projectStateToLocalAssets(200)`: 54.524 ms average.
- `createWriteBaseline(200)`: 78.792 ms average.
- active-Space hydration: 0.063 ms average.
- startup normalize with validated memo: 29.316 ms average.
- startup baseline with validated memo: 32.117 ms average.
- normalized flatten fast path: 0.664 ms average.
- normalized Settings fast path: 0.008 ms average.
- cross-Space move + intent: 1.637 ms average.

Absolute timings are environment-sensitive; preservation evidence is the unchanged state/background production code, green startup/privacy/Recovery suites and narrow runtime-size delta.

First clean-source candidate reproduction was byte-for-byte deterministic:

- Firefox candidate/reproduction SHA-256: `d26664f7b096a844fc13d1324c76b8ffe19007a73e1d7e6e510fefbf928f1103`.
- Chrome candidate/reproduction SHA-256: `70e62a8ebf57a1fb57e4d16b129e7bcb090c2c8a1ffdbd19c3bb78ad0c5151ed`.
- GitHub-ready candidate/reproduction SHA-256: `50bf026d9075bde48ca7b28c17c1865754a77ab3e9f88028b2e001406d5723ff`.

This QA record is now frozen. The exact post-QA GitHub-ready archive is re-extracted, tested, contract-validated and repackaged as the final external handoff gate; final hashes are reported in the handoff to avoid self-referential source-archive churn.

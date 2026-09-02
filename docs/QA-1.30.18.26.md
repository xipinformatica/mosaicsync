# MosaicSync 1.30.18.26 QA / release-candidate checklist

## Scope freeze

- [x] Authoritative starting source is certified 1.30.18.25 GitHub-ready source.
- [x] Starting SHA-256 is `f30badbf2bf3723078a6edbaa7b1e198e2723dd4bfa3b4bcfbb63dcb07f6dd7b`.
- [x] Steps 1–4 remain frozen; Step 5.2 adds no feature.
- [x] New Tab responsibility analysis precedes extraction; line count alone is not used as justification.

## Step-5.2 extraction contract

- [x] `appearance-color.js` owns only deterministic color clamp/conversion/normalization policy.
- [x] The extracted owner has no browser API, DOM, storage, clock, timer, async or mutable module-state dependency.
- [x] `newtab.js` retains pointer handling, Settings UI, preview/repaint sequencing, persistence and event ordering.
- [x] Startup/first-paint, Frequently Visited, artwork/favicons, Sync/Recovery and browser adapters are not modified.
- [x] Exact 1.30.18.25 helper expressions are represented by a frozen equivalence oracle.
- [x] Generated Firefox and Chromium runtimes contain and execute the same extracted module.

## Automated gates

- [x] Full regression suite passes.
- [x] Consecutive builds are deterministic.
- [x] Release-contract validation passes for generated Firefox and Chromium trees.
- [x] Benchmark and package-size reports pass.
- [x] Exactly three deterministic release ZIPs are emitted.
- [x] Clean independent packaging reproduces all three ZIPs byte-for-byte.
- [x] Unified 1.30.18.26 identity is verified everywhere.

## Certification results

- Full suite: 929/929 passing (926 inherited + 3 Step-5.2 appearance-color ownership/equivalence regressions).
- Consecutive `build-manifest.json` SHA-256: `5aaf6744d02284dfcb5306371c98a8f070e4af2a1a442d55c42c6c50612daed1`.
- Firefox runtime: 2,181,968 raw bytes / 643,241 deflated bytes.
- Chromium runtime: 2,203,612 raw bytes / 657,757 deflated bytes.
- Firefox release ZIP: 663,114 bytes; SHA-256 `b7d21918a4e9c829d85ff2f9973fbf3da9673bd45734fbf66c10723813ffe998`.
- Chromium release ZIP: SHA-256 `203c49120c9cce75993ba9c7263def2936ec458687da207ab3a369418b89c2f6`.
- Final GitHub-ready source SHA-256 is reported externally because embedding it would be self-referential.
- Clean independent re-extraction/rebuild/retest/repackage reproduced all three final ZIPs byte-for-byte.

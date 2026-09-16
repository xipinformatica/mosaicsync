# MosaicSync 1.30.18.25 QA / release-candidate checklist

## Scope freeze

- [x] Authoritative starting source is the certified/live 1.30.18.24 GitHub-ready archive.
- [x] 1.30.18.24 archive SHA-256 is `776f25374246044f6bc09b1cbe62a46c1fe850dd21ed648fc58d8bbb265f36ef`.
- [x] Step 4 is frozen at 1.30.18.24; no Recovery production code is changed.
- [x] Step 5.1 is inventory/ownership proof only: no runtime refactor and no new feature.
- [x] Steps 1–3 remain frozen.

## Step-5.1 ownership findings

- [x] `src/shared/newtab` is already the single canonical New Tab source owner; no Firefox/Chromium New Tab source copies exist.
- [x] Firefox source overlay remains only its manifest and genuine background adapter.
- [x] Chromium source overlay remains its manifest/assets, browser shim, genuine background adapter, and three intentional shared-path capability overrides (`platform`, `permission-platform`, `i18n-platform`).
- [x] Browser-specific overlays are not classified as duplication merely because shared defaults exist.
- [x] Complexity concentration is recorded without declaring code dead from size/static-import evidence alone.
- [x] No runtime source is removed in this release.

## Production/runtime change contract

- [x] Runtime-source changes from 1.30.18.24 are release identity only (`1.30.18.24` → `1.30.18.25`).
- [x] No browser adapter implementation changes.
- [x] No New Tab implementation/CSS/DOM change apart from the displayed release number.
- [x] No Sync/Recovery/model/storage algorithm change.
- [x] No permission, CSP, schema, persisted key/payload, locale, wallpaper, favicon, first-paint or privacy-boundary change.
- [x] Added Step-5.1 tooling/docs/tests are excluded from production browser packages.

## Reproducible inventory tooling

- [x] `npm run inventory` emits a deterministic source ownership/concentration report.
- [x] Permanent regressions pin the canonical shared-New-Tab contract and intentional browser overlay topology.
- [x] The tool reports concentration candidates without inferring dead code.

## Automated gates

- [x] Full regression suite passes.
- [x] Consecutive builds are deterministic.
- [x] Release-contract validation passes for generated Firefox and Chromium trees.
- [x] Benchmark and package-size reports pass.
- [x] Exactly three deterministic release ZIPs are emitted.
- [x] Clean independent packaging reproduces all three ZIPs byte-for-byte.
- [x] Unified 1.30.18.25 identity is verified everywhere.

## Certification results

- Final 1.30.18.25 suite: 926/926 passing (923 inherited + 3 Step-5.1 inventory/ownership regressions).
- Runtime-source diff versus certified 1.30.18.24 is release identity only: Firefox/Chrome manifests, shared `VERSION`, and the Settings version label.
- Deterministic source inventory SHA-256: `45c7d79f38570f7ceb207b0e8e32b1a356918ebf405a4b75c69b5bcb07911fc8`.
- Consecutive `build-manifest.json` SHA-256: `13813a600ae2314f60ccabd6ba5282c02afdd63e30548c8fbad1284afde74811`.
- Firefox runtime: 2,181,681 raw bytes / 642,937 deflated bytes (unchanged from 1.30.18.24).
- Chromium runtime: 2,203,325 raw bytes / 657,452 deflated bytes (unchanged from 1.30.18.24).
- First deterministic Firefox package: 662,681 archive bytes; SHA-256 `110681343a58c44f915caa5161e491960f2e586fd7305e4ce1a34548238cf620`.
- First deterministic Chromium package: 677,755 archive bytes; SHA-256 `c1b7bb2b5d425d051490f19f99c1e60ee49b7cdd24639157e6ce39e2a1ea3ae1`.
- Benchmark suite completed without a Step-5.1 runtime-code change; absolute timings remain environment-sensitive.
- Final GitHub-ready source SHA-256 is reported externally because embedding it inside the source archive would be self-referential.

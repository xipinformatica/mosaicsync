# MosaicSync 1.30.18.18 QA / release-candidate checklist

## Scope freeze

- [x] Authoritative starting source is the certified 1.30.18.17 GitHub-ready archive.
- [x] Scope is limited to the reported New Tab first-frame shortcut-grid movement caused by late Frequently Visited geometry insertion.
- [x] No new product feature.
- [x] No state/meta/Sync/Recovery schema, permission, CSP, background architecture, telemetry/backend or favicon-Sync-policy change.
- [x] Step-2 ownership remains frozen: browser-derived FV sites/titles/URLs/favicons remain session/live-only; persistent Web Storage receives no new browser-history data.

## Root cause

- [x] `render-bootstrap.js` could synchronously paint the shortcut grid while `#frequentSitesSection[hidden]` occupied zero space.
- [x] The warm/session or live FV renderer later committed the section above the shortcut grid after detached favicon decoding, producing a whole-grid vertical layout shift.
- [x] With desktop 5-column FV and an 8/10-item configuration, the late two-row FV insertion is close to one normal shortcut-row stride, explaining the observed one-row visual jump.

## Negative regression / fix assertions

- [x] Enabled/count=10 bootstrap reserves ten FV card geometries before `render-bootstrap.js` executes.
- [x] Reservation uses the same FV card/fallback height anchor and responsive grid CSS as the real strip.
- [x] Real decoded FV fragment replaces the reservation before the reservation's hidden state is released.
- [x] Empty/disabled and missing-permission recovery paths clear a pending reservation.

## Positive preservation assertions

- [x] Disabled FV keeps the original zero-space first frame.
- [x] Geometry bootstrap reads only existing local enabled/count compatibility hints; it does not read browser storage, Top Sites, tabs, navigation URLs or favicon pixels.
- [x] Browser-derived FV data remains session/live-only and absent from the persistent render manifest.
- [x] Existing detached favicon decode/atomic commit behavior remains intact.
- [x] Existing critical CSS remains below the reviewed blocking-CSS budget by reusing the established first-paint visibility class rather than adding a new critical rule.
- [x] Historical slow-decode, permission-recovery, first-paint/session-ownership, accessibility and Step-3 browser-boundary tests remain green.

## Automated gates

- [x] Full 1.30.18.18 regression suite passes: 872/872.
- [x] Release-contract validation passes for both generated browser trees and candidate packages.
- [x] Benchmark and package-size checks pass; runtime growth is confined to the new tiny bootstrap/generated config and New Tab reservation cleanup.
- [x] Consecutive deterministic builds produce identical generated runtime hashes.
- [x] First clean GitHub-ready candidate extraction passes full tests/contract/size checks and reproduces all three candidate archives byte-for-byte. The exact post-QA handoff archive receives one final external extraction gate after this QA file is frozen.

## Measured certification results

- Authoritative starting source: certified `mosaicsync-1.30.18.17-github-ready.zip`, SHA-256 `c44bf54a9646fe35c51ba1aa18d721b93a39e65982b8303cdcafa7b4c32b1846`.
- Baseline 1.30.18.17 suite before changes: 869/869 passing.
- Three new 1.30.18.18 regressions were added first and failed on the old runtime because no synchronous FV geometry owner existed; final suite: 872/872 passing.
- Firefox runtime: 2,156,105 raw bytes; 635,009 deflated bytes (+3,364 raw / +1,083 deflated versus 1.30.18.17).
- Chrome runtime: 2,177,749 raw bytes; 649,525 deflated bytes (+3,364 raw / +1,084 deflated versus 1.30.18.17).
- `newtab-critical.css` remains byte-for-byte unchanged from 1.30.18.17 and remains below the reviewed 35,500-byte blocking-CSS budget.
- High-risk frozen production surfaces are byte-for-byte unchanged from 1.30.18.17: shared background core, both favicon/background adapters, model/storage/profile/common permission policy, `render-bootstrap.js`, `session-bootstrap.js`, `local-storage-bootstrap.js`, critical CSS and secondary CSS.
- Consecutive deterministic `build-manifest.json` SHA-256: `dd2b75d48770e66e26fe88f47b030283daef80fdaf909238d0ba48461096532b`.

Representative benchmark run completed successfully:

- `normalizeState(200)`: 135.374 ms average.
- `stableStringify(200)`: 35.295 ms average.
- `projectStateToLocalAssets(200)`: 90.614 ms average.
- `createWriteBaseline(200)`: 128.400 ms average.
- active-Space hydration: 0.096 ms average.
- startup normalize with validated memo: 39.090 ms average.
- startup baseline with validated memo: 39.861 ms average.
- normalized flatten fast path: 1.017 ms average.
- normalized Settings fast path: 0.009 ms average.
- cross-Space move + intent: 2.849 ms average.

Absolute timings are environment-sensitive; the relevant preservation evidence is the unchanged state/background code, green startup/privacy suite and narrow runtime-size delta.

First clean-source candidate reproduction was byte-for-byte deterministic:

- Firefox candidate/reproduction SHA-256: `98896b5148a7cac803bfb77f9ddd2ecfd6cc02d24563a87a6879971ac35d6a53`.
- Chrome candidate/reproduction SHA-256: `9fa38bf83abbd447681e10bef338a7e2093d93fb292fdcd2a9841a61333c5582`.
- GitHub-ready candidate/reproduction SHA-256: `3260431cf2074317bb78f2d1acd54c7ee20be6f9ab280f04c2247de57a18b324`.

This QA record is now frozen. The exact post-QA GitHub-ready archive is re-extracted, tested, contract-validated and repackaged as the final external handoff gate; final hashes are reported in the handoff to avoid self-referential source-archive churn.

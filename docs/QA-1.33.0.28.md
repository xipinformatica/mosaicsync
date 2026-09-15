# MosaicSync 1.33.0.28 QA / release-candidate checklist

1.33.0.28 is a narrow Recovery retirement-authority corrective over 1.33.0.27. It does not change the 1.33.0.27 emergency quota retry, normal two-generation retention, remote-device cleanup authority, Sync/Recovery wire formats, permissions, schemas or browser floors.

## Canonical certification

- Unique canonical test files: **188**
- Canonical suite: **1,326 / 1,326 PASS**
- Startup: **285 / 285**
- New Tab: **522 / 522**
- Sync: **343 / 343**
- Recovery: **218 / 218**
- Security: **209 / 209**
- Browser/parity: **246 / 246**
- Core: **201 / 201**
- Release: **429 / 429**
- Reachability: **0 unreachable shared modules / 0 unused named imports / 0 unreferenced private functions**
- Browser probe: Chromium + Xvfb available; ChromeDriver, Firefox and GeckoDriver unavailable
- Certification level: **MECHANICAL_ONLY**

## Red-before-green evidence

Before the production correction, `tests/corrective-133028.test.mjs` against untouched 1.33.0.27 behavior produced **1/5 PASS, 4/5 FAIL**. The key failing case reproduced the defect directly: with A1 independently valid and newer A2 readable only through previous-generation fallback, routine capacity planning retired A1. Final 1.33.0.28 produces **5/5 PASS**.

Permanent coverage proves:

- a torn/fallback-assisted newest generation cannot authorize retirement of its independently valid predecessor;
- with three generations, an older generation remains retirable when another independently verified fallback survives;
- routine capacity planning and emergency quota reclaim share `verifiedProfileDeviceSnapshotDescriptors()` as the destructive-authority classifier;
- readable fallback-assisted Recovery remains intentionally distinct from destructive retirement authority;
- the corrective is included in Sync, Recovery, Security and Release focused certification groups.

## Mutation evidence

The final regression was challenged by restoring the former hand-written routine `profileComplete` filter and `rootKey` selection. The mutation produced **3/5 PASS, 2/5 FAIL**: both the behavioral torn-survivor case and shared-classifier contract went red. Clean source was restored and returned to 5/5 PASS.

## Historical harness normalization

Two old quota-rotation tests (`corrective-130184` and `corrective-130185`) originally supplied decoded snapshots but left `deviceRootDescriptor` as a null test stub. Once the production planner correctly reused the shared verified-generation classifier, those synthetic harnesses no longer represented a real verified root. Their test adapters were updated to provide the same root-descriptor metadata production requires; the intended historical behaviors remain unchanged and both files pass completely.

## Scope proof versus 1.33.0.27

Production source changes are limited to:

- release identity in both manifests, shared `VERSION`, and Settings version text;
- `src/shared/background/recovery-generation-lifecycle.js`, where routine capacity planning now consumes the existing independently verified-generation helper.

`background-core.js` and the entire 1.33.0.27 emergency retry state machine are byte-identical to 1.33.0.27 source. No New Tab behavior, Normal Sync journal authority, Recovery format, retention timing, cross-device deletion authority, permission or persisted schema changed.

## Clean-room requirement

The final GitHub-ready source ZIP must independently reproduce:

- 1,326 / 1,326 PASS across all 188 packaged test files;
- reachability 0/0/0;
- Firefox ZIP byte-for-byte;
- Chrome ZIP byte-for-byte;
- GitHub-ready source ZIP byte-for-byte;
- `build-manifest.json` byte-for-byte.

The sealed artifact report records the final clean-room result and SHA-256 hashes.

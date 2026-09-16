# MosaicSync 1.33.0.27 QA / release-candidate checklist

1.33.0.27 is a narrow Recovery quota-resilience release over 1.33.0.26. It does not change normal Recovery retention, remote-device cleanup authority, Sync/Recovery wire formats, permissions, schemas or browser floors.

## Canonical certification

- Unique canonical test files: **187**
- Canonical suite: **1,321 / 1,321 PASS**
- Startup: **285 / 285**
- New Tab: **522 / 522**
- Sync: **338 / 338**
- Recovery: **213 / 213**
- Security: **204 / 204**
- Browser/parity: **246 / 246**
- Core: **201 / 201**
- Release: **424 / 424**
- Reachability: **0 unreachable shared modules / 0 unused named imports / 0 unreferenced private functions**
- Browser probe: Chromium + Xvfb available; ChromeDriver, Firefox and GeckoDriver unavailable
- Certification level: **MECHANICAL_ONLY**

### 1.33.0.26 count correction

The sealed 1.33.0.26 source ZIP SHA remains authoritative and valid. A later exact per-file census resolved the earlier reporting disagreement: that source contains **186 test files / 1,307 tests**, not the 1,305 total stated in the original handoff. 1.33.0.27 adds exactly **14** permanent tests, yielding 1,321. This was a certification-counting/reporting error only; it does not indicate a source or test failure in 1.33.0.26.

## Red-before-green evidence

Before the 1.33.0.27 production implementation, `tests/corrective-133027.test.mjs` against the 1.33.0.26 behavior produced **2/11 PASS, 9/11 FAIL**. After implementation and subsequent hardening, the final file contains **14/14 PASS**.

Permanent coverage proves:

- emergency reclaim is self-only and removes at most one older independently verified generation;
- the last own verified generation is never eligible;
- `usedPreviousGeneration === true` cannot authorize predecessor retirement;
- the candidate is frozen and freshly revalidated immediately before deletion;
- destructive revalidation may only cancel/shrink the frozen decision, never expand it;
- no deletion occurs if one fallback still cannot make the exact prepared publication fit under MosaicSync's accounting model;
- retry uses the exact same prepared immutable publication object;
- failed/unsafe reclaim performs no retry and preserves the quota outcome;
- a second quota rejection stops after exactly two total commit attempts;
- a generic retry failure follows the existing non-quota error path;
- remote Recovery remains outside emergency authority;
- per-item publication overflow remains pre-excluded from this path.

## Mutation evidence

The final regression was challenged with five unsafe mutations. Each produced a red test result:

1. allow deletion of the last own Recovery generation;
2. treat a torn/previous-generation-assisted survivor as independently verified;
3. remove the self-only device filter and allow remote-device selection;
4. skip fresh destructive revalidation;
5. permit a third commit attempt after the bounded retry.

All five mutations were rejected by `tests/corrective-133027.test.mjs`; the clean source was restored and the file returned to 14/14 PASS.

## Scope proof versus 1.33.0.26

Production source changes are limited to:

- release identity in both manifests, shared `VERSION`, and Settings version text;
- `src/shared/background/recovery-generation-lifecycle.js` for the pure self-only emergency quota-reclaim planner/revalidator;
- `src/shared/background/background-core.js` for the bounded failure-path orchestration.

The root README was deliberately simplified as documentation-only work. No New Tab behavior, Normal Sync pending-journal authority, Recovery wire format, retention policy, permissions or persisted schema changed.

## Clean-room requirement

The final GitHub-ready source ZIP must independently reproduce:

- 1,321 / 1,321 PASS across all 187 packaged test files;
- reachability 0/0/0;
- Firefox ZIP byte-for-byte;
- Chrome ZIP byte-for-byte;
- GitHub-ready source ZIP byte-for-byte;
- `build-manifest.json` byte-for-byte.

The sealed artifact report records the final result and SHA-256 hashes.

# MosaicSync 1.33.0.89 QA / release-candidate checklist

**Private release candidate. Do not publish without the owner-approved release gates.**

## Baseline and scope

- Baseline: canonical 1.33.0.88 GitHub-ready source ZIP (SHA-256 f4c96ab7b19d8e1ed6c0de32711ae53bd578dc798f38d92ef8c6c76677ff50da).
- Production behavior change: `src/chrome/core/platform.js` only; recognize genuine PNG bytes even when the private Chromium favicon endpoint reports `image/bmp`.
- Extra safety: require all eight signature bytes, not only the first four.
- No changes to page HTML fetching, credentials, icon permissions, naming heuristics or Sync/Recovery.
- No Firefox production logic changes, beyond version identifiers.
- Preserves generic placeholder rejection and native favicon fail-closed sentinel.

## Acceptance criteria

- Wrongly labeled real PNG icon survives native-favicon read and model normalization as local image asset.
- False PNG prefix is not relabeled as PNG.
- Browser-generated generic placeholder is still rejected.
- Existing .88 editor regressions, whole suite, clean-room suite, ZIP reproducibility and runtime-difference audit pass.

## Outstanding before publication

- Independent .89 audit: GO on the original source/runtime ZIPs (1,702 / 1,702 full tests, 25 / 25 adversarial checks, Chrome browser scenarios and reproducible packages). A subsequent release-note-only correction changes the source ZIP hash; browser runtime ZIPs must remain bit-identical to the audited copies.
- Six exact-commit GitHub checks: pending, under owner control only.
- Real Chromium 141 simulation of blocked anonymous icon lookups: PASS (independent reviewer). Live `phonearena.com` behavior on the owner’s Chromium/Firefox installation remains unverified; Firefox runtime behavior is unchanged.
- Owner approval and confirmation of live store versions: pending.
- Real signed-in two-device Sync acceptance remains owner-waived and unverified.
- Website metadata access errors for `phonearena.com` still need diagnosis; this patch does not fix the name `Phonearena`.

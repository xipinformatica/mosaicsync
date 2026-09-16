# ADR-003 — One shared browser-neutral core with small explicit browser adapters

**Status:** Accepted / frozen

## Decision

Firefox and Chromium share canonical background, New Tab, Sync, Recovery, storage and model logic. Browser-specific source is restricted to genuine API/capability/store differences and manifests.

## Why

Maintaining two large near-identical implementations makes every future bug fix a parity risk. The Step-3 consolidation moved common behavior into shared owners while preserving explicit adapter seams for differences such as native favicon capabilities and browser permission behavior.

## Do not casually change

Do not fork a shared algorithm into separate Firefox and Chromium copies to work around a small platform difference. Prefer a narrow capability/adapter seam and keep the decision itself shared when possible.

## Evidence

- `tests/parity.test.mjs`
- `tests/corrective-1301816.test.mjs`
- `tests/release-contract-13016.test.mjs`
- `docs/STEP-5.1-COMPLEXITY-INVENTORY.md`

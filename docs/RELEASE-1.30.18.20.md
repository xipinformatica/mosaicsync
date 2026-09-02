# MosaicSync 1.30.18.20 publication notes

## Mozilla Developer Hub changelog

Begins Step 4 maintainability work by isolating the immutable Recovery-generation wire-format/validation layer into one browser-neutral module. Storage writes, chunk-first/root-last publication, quota/GC behavior, Sync reconciliation and catastrophic Recovery timing remain unchanged. Adds direct compatibility/fail-closed regressions; no features, permissions, schemas or privacy-boundary changes.

## Notes to Reviewer

This is the first production Step-4 ownership refactor, built from the certified 1.30.18.19 source after the pre-Step-4 Recovery characterization gate.

The scope is intentionally narrower than the full Recovery subsystem. Code that defines the representation of complete Personal+Work Recovery safety generations has moved from the large shared background orchestrator into `src/shared/background/recovery-generation-format.js`. That module owns modern immutable and legacy fixed-root/a-b key derivation/classification, bounded gzip encoding/decoding, manifest/chunk validation, complete-profile metadata validation, legacy previous-generation fallback descriptors, generation ordering descriptors and the bounded performance-only decode cache.

The new module is browser-neutral and contains no `browser.storage`, publication, quota, alarm, mutation-journal or catastrophic-continuity policy. Firefox and Chromium receive byte-identical generated copies. The shared core still owns every high-risk write/orchestration step: `storage.sync` reads/writes, immutable chunks-first/root-last publication, post-write verification, quota-aware retirement, verified fallback preservation, stale/orphan GC, normal Sync merge/reconcile, pending local/cross-Space journals and catastrophic loss quarantine/restart handling.

New regressions directly pin the representation boundary. They verify exact modern/legacy key compatibility, legacy previous-profile descriptor compatibility, complete Personal+Work round-trip decoding, and the critical fail-closed rule that a missing chunk invalidates a generation even after that manifest has warmed the decode cache. Existing source-contract tests were updated to follow the actual generated module graph rather than assuming all Recovery code is textually inside `background-core.js`; their original behavioral assertions remain intact.

No state/meta/Sync/Recovery schema version, persisted key, payload version, permission, CSP, manifest capability, Step-1/2/3 ownership, automatic-favicon Sync policy, telemetry/backend, browser-history privacy rule or product/UI behavior changes.

## Chrome Web Store release notes

Maintainability update that isolates Recovery generation validation/format ownership without changing Recovery behavior, permissions or user features.

## GitHub release title

`MosaicSync 1.30.18.20`

## GitHub release description

MosaicSync 1.30.18.20 begins Step 4 of the zero-new-features refinement program with a deliberately conservative Recovery ownership extraction.

The immutable Recovery-generation representation layer now has one browser-neutral source owner. Key construction/classification, bounded gzip codec, manifest/chunk and complete-profile validation, legacy previous-generation descriptors, generation ordering descriptors and the performance-only decode cache live in `recovery-generation-format.js` instead of being embedded in the shared background orchestrator.

This release does **not** move or redesign Recovery orchestration. The proven shared core still owns browser Sync reads/writes, chunks-first/root-last publication, verification, quota-aware fallback retention, GC, normal Sync reconciliation, mutation journals and catastrophic continuity/quarantine/restart behavior. Existing storage keys, schema versions, payload compatibility and browser privacy boundaries are unchanged.

New direct regressions prove modern/legacy wire compatibility and that a warmed decode cache can never hide a torn generation. The generated Firefox and Chromium format modules are required to be byte-identical and policy-free.

This creates the stable representation seam needed for later Step-4 phases while keeping the riskiest Recovery state transitions untouched in 1.30.18.20.

## GitHub Desktop commit

**Summary:** `Release MosaicSync 1.30.18.20`

**Description:** Begin Step 4 by isolating immutable Recovery-generation format and validation ownership while preserving existing publication, Sync, continuity and storage semantics.

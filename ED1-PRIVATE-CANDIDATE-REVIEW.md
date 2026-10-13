# MosaicSync ED-1 — PRIVATE, UNRELEASED REVIEW CANDIDATE

**DO NOT UPLOAD TO FIREFOX ADD-ONS, CHROME WEB STORE OR THE PUBLIC GITHUB MAIN BRANCH.**

This is a temporary stabilization working copy based on the frozen, published **1.33.0.60**. It deliberately retains the .60 version number so it cannot be mistaken for an approved .61. It has not passed independent installed-browser verification. The published .60 remains untouched.

## Targeted changes

1. **Durable recovery after a failed shortcut write:** `saveState({recoverOnFailure:true})` re-reads `storage.local`'s authoritative profile and active-Space pointer after a rejected save, hydrates the visible Space, re-adopts the compact baseline, reapplies any deliberate pending Settings draft and refreshes the UI. It does **not** restore an old whole-profile snapshot. If the recovery read also fails, subsequent writes are blocked until durable state can be re-adopted, and the attempted later mutation is discarded with an error.
2. **Stable new-shortcut operation ID:** generated once when Add Shortcut opens; retry updates the same ID even if a write landed but reported failure. A committed record is located across both Spaces and inside folders. Existing shortcuts that disappeared from storage are not silently recreated by a stale editor.
3. **Failed delete:** show the localized save error and keep the editor open; retry must ask for confirmation again when the record still exists.
4. **Cross-Space editor/drag moves:** failed writes use durable re-adoption and visual reconciliation. The Sync intent is always recomputed inside the storage write lock from the latest persisted state, not just after a rebase, preserving source-Space tombstones.
5. **No change** to Sync schemas, Recovery formats, title parsing, permissions, published ZIPs, version string, or the approved product-first Developer Guide.

## Automated evidence

- New `tests/ed1-failure-recovery.test.mjs` executes the real New Tab `saveState` and recovery functions with injected failures, plus an integration test using the **real `writeLocalStateWithBaseline` storage gateway** to verify that a stale cross-Space intent is rebuilt from durable state.
- Existing VM tests were adjusted only to provide newly required fixture globals and preserve the save-before-enrichment assertion. The historical source-code storage call-site census was adjusted for the new *conditional* durable read after failure.
- `node tools/build.mjs` regenerates both browser trees.
- See the separate reviewer evidence package for Claude's real Chromium harnesses and the stricter identity-based evaluator.

## Mandatory independent review (Claude)

Run on a fresh disposable profile with the **actual built candidate extension**, not the frozen .60. Repeat baseline cases E/A/G/B/C/D/F, ambiguous A3, concurrent D2/D3, fresh-confirmation F2, and Sync-on E/A/B/C/F. Run M0L/M1/M2L/M3, including ≥150 seconds of Sync settling and reopen. Add double failure A2, rename retry C2/C3, Escape/Cancel/backdrop, cross-Space drag and folder-child move, and a two-device receiving Sync check. Ensure no ID is live in two Spaces locally or remotely, no cancelled mutation appears in any Sync item/snapshot, and the source tombstone survives.

**Hold publication** unless all tests pass, no cross-tab data loss occurs, Firefox runs with fault injection, and the full four-browser release gate is green. Any failure is a STOP; report the reproducer rather than patching blindly.

## Commands

```bash
node tools/build.mjs
node tools/test-inventory.mjs --check
node --test --test-concurrency=6 tests/*.test.mjs
node --test tests/ed1-failure-recovery.test.mjs
```

Reviewer harness commands are in the companion ZIP. **This candidate is not store-ready.**

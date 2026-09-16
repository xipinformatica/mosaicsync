# MosaicSync Step 5.1 complexity / ownership inventory

This inventory is the evidence gate for MosaicSync 1.30.18.25. It deliberately changes no runtime behavior. Its purpose is to identify where complexity is concentrated, distinguish intentional browser overlays from accidental duplication, and prevent Step 5 from refactoring already-canonical or safety-sensitive code merely to reduce line count.

The reproducible machine-readable view is emitted by:

```bash
npm run inventory
```

## Scope and frozen boundaries

- Certified 1.30.18.24 is the runtime-behavior baseline.
- Steps 1–3 remain frozen.
- Step 4 is frozen at 1.30.18.24 after the post-release forensic audits; Recovery is not a Step-5 cleanup target without a concrete production defect.
- Step 5 adds no features and does not change permissions, CSP, schemas, Sync semantics, first-paint ownership, favicon privacy policy, Recovery timing/publication, or browser behavior.
- Size or line count alone is never evidence that code is dead or incorrectly owned.

## Source ownership inventory

| Source owner | Files | Bytes | Interpretation |
|---|---:|---:|---|
| `src/shared` | 115 | 2,621,018 | Canonical application/runtime source shared wherever browser APIs permit |
| `src/firefox` | 2 | 4,831 | Firefox manifest + genuine background capability adapter |
| `src/chrome` | 10 | 28,769 | Chromium manifest/assets + genuine platform/capability overlays |
| `src/shared/newtab` | 14 | 558,370 | Canonical New Tab source; there is no Firefox or Chromium New Tab source copy |

### Important Step-5.1 finding: New Tab is already canonical

The previously anticipated Step-5 task of merging duplicated Firefox/Chromium New Tab implementations is obsolete. Step 3.2 (1.30.18.17) already established one canonical shared New Tab DOM/source and deterministic Chromium shim injection. There is no `src/firefox/newtab` or `src/chrome/newtab` tree to consolidate.

Step 5 must therefore preserve this ownership rather than reimplement it.

## Intentional browser overlays

Firefox contains only:

- `background/background-adapter.js`
- `manifest.json`

Chromium contains:

- four product/store icon assets;
- `background/background-adapter.js`;
- `core/browser-shim.js`;
- `core/i18n-platform.js`;
- `core/permission-platform.js`;
- `core/platform.js`;
- `manifest.json`.

Only three Chromium files intentionally shadow shared relative paths:

1. `core/i18n-platform.js`
2. `core/permission-platform.js`
3. `core/platform.js`

These are not accidental duplication. They encode genuine Chromium differences: browser-brand localization adaptation, Firefox-only data-collection permission semantics versus Chromium's no-op consent contract, and Chromium-native favicon / Top Sites capabilities. The browser background adapters likewise differ intentionally.

**Step-5 rule:** do not merge these files merely for symmetry. Any future reduction must first prove that a capability difference has disappeared.

## Complexity concentration

The largest non-locale, non-asset runtime text owners are:

| File | Lines | Bytes | Step-5 interpretation |
|---|---:|---:|---|
| `src/shared/newtab/newtab.js` | 7,502 | 339,826 | Highest-priority responsibility review |
| `src/shared/background/background-core.js` | 6,158 | 287,834 | Large orchestrator; Recovery regions are frozen and line count is not an extraction mandate |
| `src/shared/core/model.js` | 1,973 | 88,427 | Central normalized-state/model owner; review only for clearly independent pure responsibilities |
| `src/shared/newtab/newtab-secondary.css` | 250 | 86,814 | Large but CSS byte size is not equivalent to architectural complexity |
| `src/shared/core/storage.js` | 1,084 | 50,012 | Persistence/session/render-cache boundary; Step-2 ownership is frozen |
| `src/shared/newtab/newtab.html` | 751 | 46,012 | Canonical DOM; already shared |
| `src/shared/newtab/newtab-critical.css` | 845 | 35,445 | First-paint critical path; frozen unless a demonstrated defect exists |

The inventory therefore changes the next Step-5 priority from "merge browser New Tab copies" to **responsibility analysis inside the already-shared New Tab implementation**.

## Candidate priority classes

### Priority A — `newtab.js` responsibility decomposition

This is the largest remaining canonical JavaScript owner. A later Step-5 phase may identify self-contained browser-neutral responsibilities that can move behind explicit modules, but only when all of the following are true:

- ownership is clear and cohesive;
- the extraction does not change event ordering, startup scheduling or DOM commit timing;
- no Step-1/2 first-paint/cache boundary is reopened;
- positive preservation and negative regression coverage run against generated Firefox and Chromium output;
- extraction reduces cognitive coupling rather than simply moving lines between files.

No such production extraction is performed in 1.30.18.25.

### Priority B — non-Recovery `background-core.js` concentration

The core remains intentionally effectful. Step 4 already extracted Recovery format/store/lifecycle/continuity responsibilities. Those seams are frozen. A later audit may identify unrelated, independently owned background responsibilities, but cross-subsystem orchestration, live browser observations and ordering-sensitive code should remain in the core.

### Priority C — `model.js` and `storage.js`

Both are sizeable but foundational and already have strong ownership. They are lower priority than `newtab.js`; no split should be attempted until a responsibility can be named precisely and its current contracts characterized behaviorally.

## Items investigated but not classified as cleanup targets

- Historical `docs/QA-*` and `docs/RELEASE-*` files increase repository size but are audit history, not runtime bloat.
- The large permanent test corpus is a safety asset. Old regression files are not dead merely because their version numbers are historical.
- Locale source catalogs are intentionally human-readable source and are compacted deterministically for runtime; source byte size is not a reason to rewrite the localization architecture.
- `background-core.js` is still large after Step 4, but remaining orchestration must be judged by responsibility and effects rather than line count.
- Chrome's platform and branding overlays are intentional capability boundaries, not source duplication.

## Proven dead-code result

**No runtime source is declared dead by Step 5.1.**

Static reachability is insufficient for WebExtension entrypoints, manifest-loaded scripts, classic New Tab bootstrap scripts, workers and MV3 event listeners. Deletion in a later Step-5 phase requires explicit production call-path evidence plus positive preservation coverage.

## Updated Step-5 direction

1. **5.1 / 1.30.18.25 — inventory and ownership proof:** this release; no runtime refactor.
2. **Next — characterize `newtab.js` responsibilities:** find one narrow, behavior-preserving ownership seam if one exists. Do not force an extraction if the code is inherently orchestration-heavy.
3. **Then — proven legacy/dead-path retirement:** only after reachability and behavioral proof.
4. **Test/build cleanup:** improve implementation-shape tests when their area is touched and keep deterministic source→runtime provenance obvious.
5. **Final whole-project audit/freeze:** end the zero-new-features refinement cycle rather than continuing architectural churn indefinitely.

The exact number of later releases is evidence-driven; Step 5 is not a quota of refactors.

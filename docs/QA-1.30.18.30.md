# MosaicSync 1.30.18.30 QA / release-candidate checklist

## Baseline / scope

- [x] Starts from the manually validated 1.30.18.29 GitHub-ready source archive.
- [x] 1.30.18.26 remains withdrawn and is used only as historical failure evidence, never as a baseline.
- [x] Scope is Step 5.4 test-architecture hardening only.
- [x] Production algorithms and Steps 1–4 / completed Step 5.1–5.3 ownership boundaries remain frozen.

## Full New Tab integration gate

- [x] Generated Firefox imports the complete `newtab.js` module graph without uncaught/caught startup errors and reaches `interactionReady`.
- [x] Generated Chromium imports the complete `newtab.js` module graph without uncaught/caught startup errors and reaches `interactionReady`.
- [x] Generated Settings click wiring actually opens the panel on both browsers.
- [x] Generated color-swatch startup attaches real click listeners on both browsers.
- [x] Generated external-state storage listener registration is reached on both browsers.
- [x] Enabled Frequently Visited calls the browser Top Sites path and completes a live render on both browsers.
- [x] The real generated Frequently Visited Settings change listener hides controls/strip when disabled and restores them after re-enable with permission.
- [x] A temporary generated-tree mutation recreating the withdrawn 1.30.18.26 injected-validator contract mismatch is rejected before `interactionReady`.

## Test-architecture review

- [x] Existing source-shape checks were reviewed by responsibility rather than deleted by regex count.
- [x] Source-shape assertions remain where literal structure is the contract (release identity, manifest/CSP/permissions, HTML/CSS/bootstrap ordering and generated ownership).
- [x] Behavioral invariants with existing generated/VM coverage retain source-shape assertions only as supplementary guardrails.
- [x] No production refactor or new dependency was introduced for testability.

## Frozen behavior boundaries

- [x] No Recovery or normal Sync algorithm change.
- [x] No first-paint/session/render-cache change.
- [x] No Frequently Visited product behavior change.
- [x] No Settings product behavior change.
- [x] No favicon retrieval/commit policy change.
- [x] No permission, CSP, schema, persisted payload, locale or browser-adapter change.

## Automated / reproducibility gates

- [x] Full final suite passes: 937/937 (934 inherited + 3 Step-5.4 regressions).
- [x] `npm run reachability` remains clean.
- [x] Firefox and Chromium release contracts pass on generated trees and packaged browser ZIPs.
- [x] Package-size baseline/report updated and compared with 1.30.18.29.
- [x] Final GitHub-ready ZIP is clean-extracted, rebuilt and retested at 937/937 before handoff.
- [x] Firefox, Chromium and GitHub-ready ZIPs reproduce byte-for-byte from the final clean extraction before handoff.

## Runtime-source boundary

Relative to 1.30.18.29, production source changes are limited to release identity:

- Firefox/Chromium manifests.
- Shared `VERSION`.
- Settings version label in `newtab.html`.

No production JavaScript algorithm or browser adapter differs.

## Final hashes / sizes

- `build-manifest.json` SHA-256: `5555f1a4fcb9b643509b899c1a52cc26559fd30c493ed878f6ba14a22e09b2d4`.
- Firefox ZIP SHA-256: `a7f8c988e4c5e0d77b579c0f08e78c35140ce41ab393ceeec7bd02ed8c0118ec`.
- Chromium ZIP SHA-256: `a4f2709f71f58a255429a8e8d2f89d3c172752b9d578d1edd44476d1559974cb`.
- Firefox runtime: 2,181,757 raw bytes / 643,224 deflated bytes (same raw / −1 deflated versus 1.30.18.29).
- Chromium runtime: 2,203,401 raw bytes / 657,740 deflated bytes (unchanged versus 1.30.18.29).
- The GitHub-ready source SHA-256 is reported externally because embedding its own archive hash would be self-referential.

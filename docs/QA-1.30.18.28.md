# MosaicSync 1.30.18.28 QA / release-candidate checklist

## Baseline / scope

- [x] Built from the certified 1.30.18.25 production implementation, which the user restored unchanged as live 1.30.18.27 apart from release identity.
- [x] 1.30.18.26 is treated as withdrawn forensic evidence only and is never used as the source baseline.
- [x] Scope is limited to the corrected Step-5.2 pure appearance-color ownership extraction plus regression coverage and release identity/docs.
- [x] Steps 1–4 remain frozen.

## Corrective proof

- [x] The new 1.30.18.28 regression was executed against withdrawn 1.30.18.26 before certification and failed 4/4.
- [x] The same regression passes 4/4 on the corrected implementation.
- [x] `normalizeHexColor` and `hexToRgb` preserve their historical one-argument callable contracts.
- [x] `appearance-color.js` imports the existing pure `validHex` dependency internally rather than requiring any caller rewrite.
- [x] Every existing production `normalizeHexColor(...)` / `hexToRgb(...)` call in `newtab.js` retains the 1.30.18.25 call shape.
- [x] The exact generated Firefox and Chromium color-swatch startup block completes without throwing before Settings click wiring and final `loadState()` startup.
- [x] Generated Firefox and Chromium copies of `appearance-color.js` are byte-identical to the canonical shared source.

## Runtime-source boundary

Relative to the safe 1.30.18.25/1.30.18.27 implementation, the only production-source differences are:

- `src/firefox/manifest.json` — release identity only.
- `src/chrome/manifest.json` — release identity only.
- `src/shared/core/constants.js` — release identity only.
- `src/shared/newtab/newtab.html` — displayed release identity only.
- `src/shared/newtab/newtab.js` — one import plus removal of the five unchanged inline pure helper bodies; caller expressions are unchanged.
- `src/shared/newtab/appearance-color.js` — new pure owner containing the frozen helper bodies and the existing pure `validHex` dependency.

No other production source file differs from the safe baseline.

## Frozen behavior boundaries

- [x] No Settings DOM/event, live-preview, persistence/debounce or repaint-order change.
- [x] No Frequently Visited implementation change.
- [x] No startup/first-paint/session/render-cache implementation change.
- [x] No favicon implementation/privacy-policy change.
- [x] No Sync, Recovery, state/model/storage schema or algorithm change.
- [x] No browser adapter, permission, CSP or locale change.

## Automated gates

- [x] Safe-baseline suite passed before modification: 926/926.
- [x] Corrected final suite passes: 930/930 (926 inherited + 4 corrective Step-5.2 regressions).
- [x] Release-contract validation passes for generated Firefox and Chromium trees.
- [x] Release-contract validation passes for packaged Firefox and Chromium ZIPs.
- [x] Benchmark suite completes without a new hot-path policy or browser effect.
- [x] Package-size baseline consciously updated for the explicit module boundary.

## Size / build results

- `build-manifest.json` SHA-256 before final clean-room packaging: `5810ce1347b612d610b9391dc47ebc8f359a6bd22764bd915d9f00784fe97412`.
- Firefox runtime: 2,181,973 raw bytes / 643,253 deflated bytes.
- Chromium runtime: 2,203,617 raw bytes / 657,769 deflated bytes.
- Versus the safe 1.30.18.25/1.30.18.27 runtime this is +292 raw bytes on each browser, +316 deflated bytes on Firefox, and +317 deflated bytes on Chromium; the increase is explicit module/import overhead, not new product behavior.

## First deterministic package pass

- Firefox ZIP SHA-256: `4adb9c96b70c793d1f368742faddc754476d19356b9e4e9ae184da13f908bf64`.
- Chromium ZIP SHA-256: `5daccd5dccd8c40cc0f92b577141cf5d2fe6527800c2874d436f77b663bc7def`.

## Final clean-room certification

A final GitHub-ready ZIP was re-extracted into a clean directory, rebuilt and retested at 930/930. The clean tree reproduced the same `build-manifest.json` SHA-256 (`5810ce1347b612d610b9391dc47ebc8f359a6bd22764bd915d9f00784fe97412`) and reproduced the Firefox and Chromium package hashes above byte-for-byte. A second GitHub-ready source package was also byte-identical to the package it was extracted from. The final source-archive SHA-256 is reported externally because embedding it inside the archive would be self-referential.

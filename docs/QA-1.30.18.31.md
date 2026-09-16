# MosaicSync 1.30.18.31 QA / release-candidate checklist

## Baseline / scope

- [x] Starts from the manually validated/live 1.30.18.30 GitHub-ready source archive.
- [x] Scope is Step 5.5 build/package simplification only.
- [x] Production algorithms and Steps 1–4 / completed Step 5.1–5.4 ownership boundaries remain frozen.

## Build/package ownership

- [x] Public Firefox, public Chromium, GitHub-ready source and Firefox dev ZIPs use one deterministic ZIP writer.
- [x] `tools/package.py` rebuilds `dist/` before packaging and cannot silently consume a stale same-version generated tree.
- [x] `tools/release_contract.py` derives its expected version from the canonical shared VERSION.
- [x] Browser manifest/version_name checks remain enforced.
- [x] Source exclusions, production/dev Gecko identity separation, package-size reporting and independent release-contract ZIP scanning remain intact.
- [x] Pre-version-bump preservation probe reproduced the live 1.30.18.30 Firefox and Chromium ZIPs byte-for-byte with the refactored tooling.

## Frozen behavior boundaries

- [x] No Recovery or normal Sync algorithm change.
- [x] No New Tab, first-paint/session/render-cache, Settings or Frequently Visited product behavior change.
- [x] No favicon retrieval/commit policy change.
- [x] No storage schema, permission, CSP, locale or browser-adapter change.

## Automated / reproducibility gates

- [x] Full final suite passes: 940/940 (937 inherited + 3 Step-5.5 regressions).
- [x] `npm run reachability` remains clean with zero unreachable shared modules, unused named imports or unreferenced private functions.
- [x] Firefox and Chromium release contracts pass on generated trees and packaged ZIPs.
- [x] Package-size baseline/report updated; runtime size is unchanged from 1.30.18.30 in both browsers.
- [x] Final GitHub-ready ZIP is clean-extracted, rebuilt and retested at 940/940 before handoff.
- [x] Firefox, Chromium and GitHub-ready ZIPs reproduce byte-for-byte from the final clean extraction.

## Runtime-source boundary

Relative to 1.30.18.30, production source changes are release identity only: Firefox/Chromium manifests, shared `VERSION`, and the Settings version label in `newtab.html`. The only non-test/non-documentation implementation changes are confined to `tools/package.py`, `tools/release_contract.py`, and `package.json`.

## Final hashes / sizes

- `build-manifest.json` SHA-256: `a1849555760559617fd83c793f8cdd06ae60a17a9a76d084063056b4c2836803`.
- Firefox ZIP SHA-256: `40d42210517415e6ae759a8791f01b74f4f66d07400567c171e7e9dc2d52a1c2`.
- Chromium ZIP SHA-256: `6c284868934778557f4ed5e5e42ad56b4ddcf15bcb86889815e9d6c2d1d58ce2`.
- Firefox runtime: 2,181,757 raw bytes / 643,224 deterministic deflated bytes (unchanged versus 1.30.18.30).
- Chromium runtime: 2,203,401 raw bytes / 657,740 deterministic deflated bytes (unchanged versus 1.30.18.30).
- The GitHub-ready source SHA-256 is reported externally because embedding its own archive hash would be self-referential.

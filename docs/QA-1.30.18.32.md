# MosaicSync 1.30.18.32 QA / release-candidate checklist

## Baseline / scope

- [x] Starts from the manually validated/live 1.30.18.31 GitHub-ready source archive.
- [x] 1.30.18.31 GitHub-ready SHA-256 re-verified before audit.
- [x] Scope is Step 5.6 final whole-project forensic audit/freeze.
- [x] No architectural/product-code change is planned or justified by the audit.

## Final forensic audit

- [x] Cumulative Step-5 production diff reviewed against the Step-5.1 baseline.
- [x] Startup/first-paint/session/render-cache ownership reviewed.
- [x] New Tab, Settings, Spaces, folders/drag and Frequently Visited reviewed.
- [x] Favicon/artwork ownership and device-local privacy policy reviewed.
- [x] Storage/model/profile/import-export boundaries reviewed.
- [x] Normal Sync conflict/concurrency coverage reviewed.
- [x] Recovery format/store/lifecycle/continuity owners and MV3 interruption coverage reviewed.
- [x] Firefox/Chromium adapter topology and generated shared-owner parity reviewed.
- [x] Permissions, privacy, CSP and release-contract surface reviewed.
- [x] Reachability/dead-code status reviewed.
- [x] Build/package/reproducibility pipeline reviewed.

## Pre-version-bump evidence

- [x] Untouched 1.30.18.31 full suite: 940/940.
- [x] Focused final cross-subsystem run: 258/258.
- [x] Reachability: zero high-confidence leftovers.
- [x] Benchmark completes.
- [x] Generated release contracts pass.
- [x] Packaged Firefox and Chromium release contracts pass.
- [x] Shared generated owners are byte-identical across Firefox and Chromium where browser-neutral ownership requires it.

## Final .32 gates

- [x] Full final suite passes after 1.30.18.32 identity/docs update: 940/940.
- [x] Reachability remains clean: zero unreachable shared modules, unused named imports or unreferenced private functions.
- [x] Benchmark completes.
- [x] Generated Firefox/Chromium release contracts pass.
- [x] Packaged Firefox/Chromium release contracts pass.
- [x] Package-size baseline/report updated; raw runtime size is unchanged from 1.30.18.31.
- [x] Candidate GitHub-ready ZIP clean-extracted, rebuilt and retested at 940/940; the exact final documented source ZIP is re-verified again before handoff.
- [x] Candidate Firefox, Chromium and GitHub-ready ZIPs reproduced byte-for-byte; the exact final documented source ZIP is re-verified again before handoff.

## Freeze decision

No production defect was found by Step 5.6. The final .32 mechanical/reproducibility gates are complete, so Step 5 and the complete zero-new-features/full-code-refinement program are frozen at MosaicSync 1.30.18.32.

## Final deterministic values

- `build-manifest.json` SHA-256: `efcbfa82dda421fba5fc30759e84639ed155c5e2edd5f1770e2b5bd94dc794e9`.
- Firefox ZIP SHA-256: `de24e31d698c2b2df55b7784888661b036164d485f4ef16fef2fb6d986fc3312`.
- Chromium ZIP SHA-256: `8df388abe8dd585f8606faff40b26b142bf688405d9fcca7e86901bbca19a9ef`.
- Firefox runtime: 2,181,757 raw bytes / 643,226 deterministic deflated bytes.
- Chromium runtime: 2,203,401 raw bytes / 657,742 deterministic deflated bytes.
- The GitHub-ready source SHA-256 is reported externally because embedding an archive's own final hash would be self-referential.

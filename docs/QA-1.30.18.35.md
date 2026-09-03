# MosaicSync 1.30.18.35 QA / release-candidate checklist

## Scope

Maintenance Infrastructure M3 only: permanent architecture knowledge, decision records and regression catalogue. Production runtime remains frozen apart from release identity.

## Starting evidence

- [x] Authoritative starting archive: `mosaicsync-1.30.18.34-github-ready.zip`.
- [x] Starting SHA-256: `cdc5b06d6cf7c4423c18b88aaa88390d0071abc748d850206c1573574a60dd10`.
- [x] Clean extraction rebuilt successfully.
- [x] Untouched baseline full suite: 950/950 passing.
- [x] Untouched baseline reachability: zero high-confidence leftovers.

## M3 knowledge boundary

- [x] `docs/ARCHITECTURE.md` remains the single ownership map; no competing architecture specification is introduced.
- [x] Architecture map links to the ADR index and regression catalogue and includes a short plain-English map.
- [x] Nine accepted/frozen ADRs record only non-obvious, high-value decisions and their evidence.
- [x] Regression catalogue records ten high-value historical failure families and references permanent tests that exist in the source tree.
- [x] Documentation is explicitly prevented from becoming another technical version/runtime constant authority.
- [x] No production source change beyond release identity.

## Regression / release gates

- [x] Full suite passes after final `.35` identity/docs/tests: 954/954.
- [x] Reachability remains clean: zero unreachable shared modules, unused named production imports or unreferenced private functions.
- [x] Benchmark completes with the frozen runtime behavior; M3 adds no benchmarked production code.
- [x] Generated Firefox/Chromium release contracts pass.
- [x] Runtime raw size is unchanged from `.34`: Firefox 2,181,757 B; Chromium 2,203,401 B. Deterministic deflated totals are 643,224 B and 657,739 B.
- [x] Packaged Firefox/Chromium release contracts pass.
- [x] Candidate GitHub-ready source clean-extracts, rebuilds and retests at 954/954; final documented archive is rechecked after this QA record is frozen.
- [x] Candidate Firefox, Chromium, GitHub-ready ZIPs and build manifest reproduce byte-for-byte; final documented archive is rechecked after this QA record is frozen.

## Decision

M3 is approved for final packaging. No production algorithm diff exists: the only `src/` differences from 1.30.18.34 are the four unified release-identity files. The final handoff archive must reproduce after this QA record is included; any mismatch is a release blocker.

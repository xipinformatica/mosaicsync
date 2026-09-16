# MosaicSync 1.30.18.36 QA / release-candidate checklist

## Scope

Maintenance Infrastructure M4+M5 only: targeted test workflow plus bounded deterministic property/fuzz testing. Production runtime remains frozen apart from release identity.

## Starting evidence

- [x] Authoritative starting archive: `mosaicsync-1.30.18.35-github-ready.zip`.
- [x] Starting SHA-256: `1dbffc13b8bcc6952236ebca1f1c4ac1a2564b17e21255f990139b40fa8557fe`.
- [x] Clean extraction rebuilt successfully.
- [x] Untouched baseline full suite: 954/954 passing.

## M4 test organization

- [x] `npm test` remains the unchanged authoritative full-suite command.
- [x] Eight dependency-free targeted groups exist: startup, New Tab, Sync, Recovery, security, browser, core and release.
- [x] Every permanent `.test.mjs` file belongs to at least one group.
- [x] Group membership is deterministic, sorted and regression-tested.
- [x] Targeted commands rebuild from canonical source before execution and use explicit test-file arguments for Windows/Linux/macOS portability.
- [x] All eight targeted group commands execute successfully on the candidate tree.

## M5 deterministic property/fuzz boundary

- [x] No external fuzzing dependency or production test hook is introduced.
- [x] Fixed seeded generator reports seed and case number for exact reproduction.
- [x] 600 hostile JSON-like state cases exercise normalization/idempotence/prototype-pollution safety.
- [x] 240 profile-import cases mix arbitrary malformed shapes with checksum-valid mutated package bodies and require controlled errors or normalized accepted state.
- [x] 800 Recovery continuity cases assert deterministic bounded loss-state, numeric and tombstone invariants.
- [x] 1,000 navigation cases assert that only HTTP(S) destinations can ever be returned.
- [x] Total permanent generated cases per full suite: 2,640; bounded and deterministic.

## Regression / release gates

- [x] Full candidate suite passes at 960/960.
- [x] Reachability remains clean: zero unreachable shared modules, unused named production imports or unreferenced private functions.
- [x] Benchmark completes and reports the frozen runtime performance surfaces; M4+M5 add no benchmarked production code.
- [x] Generated Firefox/Chromium release contracts pass.
- [x] Runtime raw size remains unchanged from `.35`: Firefox 2,181,757 B; Chromium 2,203,401 B.
- [x] Packaged Firefox/Chromium release contracts pass.
- [x] Candidate GitHub-ready source clean-extracts, rebuilds and retests at 960/960; final documented archive is rechecked after this QA record is frozen.
- [x] Candidate Firefox, Chromium, GitHub-ready ZIPs and build manifest reproduce byte-for-byte; final documented archive is rechecked after this QA record is frozen.

## Decision

M4+M5 are approved for final packaging. No production algorithm diff exists: the only `src/` differences from 1.30.18.35 are the four unified release-identity files. The final handoff archive must reproduce after this QA record is included; any mismatch remains a release blocker.

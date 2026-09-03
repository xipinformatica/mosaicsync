# MosaicSync 1.30.18.37 QA / release-candidate checklist

**Final Maintenance Infrastructure M6 freeze audit.**

## Scope

Maintenance Infrastructure M6 only: final browser/API compatibility, dependency, permission/privacy/CSP, maintenance-infrastructure audit and freeze. Production architecture/runtime remains frozen apart from release identity.

## Pre-M6 evidence

- [x] Authoritative starting archive: `mosaicsync-1.30.18.36-github-ready.zip`.
- [x] Starting SHA-256: `0832f038fa4697b956ff2a9b4a597a22d20eb33e23ff5b2ca0b993ea72b2f56b`.
- [x] Clean extraction rebuilt successfully.
- [x] Untouched baseline full suite: 960/960 passing.
- [x] Untouched baseline reachability: zero unreachable shared modules, unused named production imports or unreferenced private functions.
- [x] Generated Firefox/Chromium release contract passed.
- [x] 1.30.18.36 production `src/` compared with frozen 1.30.18.32: no added/removed/changed runtime source outside the four release-identity files.
- [x] Pre-M6 forensic report recorded in `docs/PRE-M6-AUDIT-1.30.18.36.md`.

## Browser/API compatibility audit

- [x] Firefox minimum remains `140.0`, justified by Firefox 140 adding `browser_specific_settings.gecko.data_collection_permissions` used by the production manifest.
- [x] Chromium minimum remains `104`, justified by Chrome 104 introducing the Manifest V3 `_favicon` URL used by MosaicSync; audited `storage.session` and Promise Top Sites floors are lower.
- [x] Required permissions remain exactly Firefox `storage` + `alarms`, Chromium `storage` + `alarms` + `favicon`.
- [x] `topSites`, `bookmarks` and HTTP(S) hosts remain optional.
- [x] No broad `tabs`, `history`, `cookies`, `webRequest`, `scripting`, `downloads`, `management`, `nativeMessaging` or `unlimitedStorage` permission.
- [x] No content scripts, web-accessible runtime resources or externally-connectable surface.
- [x] CSP remains self-script-only with no `unsafe-eval` / inline-script relaxation.

## Dependency / maintenance-system audit

- [x] `package.json` contains no runtime/dev/optional/peer package dependencies.
- [x] Maintenance/test/benchmark ESM uses only local modules and Node built-ins.
- [x] M1 real-browser smoke remains a justified response to the withdrawn .26 startup failure class.
- [x] M2 full certification remains fail-closed; mechanical mode remains explicitly non-full certification.
- [x] M3 knowledge layer remains one architecture map + concise ADR/regression records, not a second implementation.
- [x] M4 test groups remain convenience subsets; `npm test` remains authoritative.
- [x] M5 fuzzing remains bounded, deterministic, seeded and dependency-free.
- [x] Permanent post-freeze rules are recorded in `docs/MAINTENANCE-POLICY.md`.

## Candidate regression / release gates

- [x] Four M6 integrity tests cover compatibility floors/permission budget, dependency-free maintenance tooling, freeze policy and architecture-document navigation.
- [x] Full candidate suite passes at 964/964.
- [x] Reachability remains clean: zero unreachable shared modules, unused named production imports or unreferenced private functions.
- [x] Generated Firefox/Chromium release contracts pass.
- [x] Benchmark completes; no M6 production hot path was added.
- [x] Runtime raw size remains unchanged from `.36`: Firefox 2,181,757 B; Chromium 2,203,401 B.
- [x] Candidate packaged Firefox/Chromium release contracts pass.
- [x] Documented candidate GitHub-ready source clean-extracts, rebuilds and retests at 964/964; the exact final handoff archive is rechecked after this QA record is frozen.
- [x] Documented candidate Firefox, Chromium, GitHub-ready ZIPs and build manifest reproduce byte-for-byte; the exact final handoff archive is rechecked after this QA record is frozen.

## Freeze decision

All M6 implementation/audit gates are green. Freeze the Maintenance Infrastructure program at 1.30.18.37 once the exact final handoff archive reproduces after this QA record is included. There is no planned M7 / 1.30.18.38 infrastructure release. Future production architecture work requires one of the concrete triggers in `docs/MAINTENANCE-POLICY.md`.

# M6 final forensic audit — MosaicSync 1.30.18.37

> **Post-audit status:** This document records the M6 audit as performed at 1.30.18.37. Subsequent independent code-first review found one inherited LOW Chromium Top Sites adapter leak plus maintenance-tool compatibility/portability defects. They are corrected narrowly in 1.30.18.38. The M6 architecture conclusions remain valid, but the original statement that no LOW production defect existed is superseded by the 1.30.18.38 corrective record.

## Verdict

**PASS — Maintenance Infrastructure M1–M6 is complete and the application architecture remains frozen.**

No CRITICAL, HIGH, MEDIUM or LOW production defect was found by the M6 pre-change or post-change audit. No production algorithm, permission, CSP rule, persisted schema, Sync/Recovery rule, first-paint owner, Frequently Visited behavior, favicon policy or browser adapter was changed by 1.30.18.37.

## 1. Audit method

M6 used two explicit evidence phases.

### Before M6

The authoritative 1.30.18.36 GitHub-ready source (`0832f038fa4697b956ff2a9b4a597a22d20eb33e23ff5b2ca0b993ea72b2f56b`) was clean-extracted separately from the M6 working tree. The untouched baseline was rebuilt and audited before any `.37` change.

The pre-change audit established:

- 960/960 tests passing;
- clean runtime reachability;
- generated Firefox/Chromium release-contract pass;
- zero npm package dependencies;
- no eval/unsafe-inline/content-script/externally-connectable expansion;
- exact manifest permission allow-lists;
- exact application-source equivalence with the frozen 1.30.18.32 architecture baseline outside release identity.

The detailed pre-change record is `docs/PRE-M6-AUDIT-1.30.18.36.md`.

### After M6

The `.37` candidate was rebuilt and audited again after adding only compatibility/security documentation, permanent maintenance policy, four M6 integrity tests, release documentation and release identity.

Post-change application `src/` diff versus `.36`:

```text
changed only:
  src/firefox/manifest.json
  src/chrome/manifest.json
  src/shared/core/constants.js
  src/shared/newtab/newtab.html

added runtime source:   0
removed runtime source: 0
other changed runtime source: 0
```

Those four files contain release identity only.

## 2. Browser/API compatibility audit

### Firefox 140+

The existing `strict_min_version: 140.0` is not an arbitrary modern-browser floor. Firefox 140 introduced `browser_specific_settings.gecko.data_collection_permissions`, which the production MosaicSync manifest declares for Mozilla's built-in consent model. The audited Firefox capability surface did not reveal a need for a higher floor.

The Firefox adapter's native open-tab favicon lookup remains least-privilege: it performs URL-filtered `tabs.query()` only after MosaicSync confirms matching HTTP(S) host access, avoiding a required broad `tabs` permission.

### Chromium / Chrome 104+

The existing `minimum_chrome_version: 104` is also directly justified. Chrome 104 introduced the Manifest V3 `chrome-extension://<extension-id>/_favicon/` URL used by MosaicSync's Chromium-native favicon capability. Other material audited floors are lower (`storage.session` Chrome 102+, Promise Top Sites Chrome 96+, Manifest V3/action earlier).

Therefore neither browser minimum should be raised or lowered as part of M6.

## 3. Permission/privacy audit

### Firefox required

- `storage`
- `alarms`

### Chromium required

- `storage`
- `alarms`
- `favicon`

### Optional on both

- `topSites`
- `bookmarks`
- `http://*/*`
- `https://*/*`

The audit found no manifest request for broad `tabs`, `history`, `cookies`, `webRequest`, `scripting`, `downloads`, `management`, `nativeMessaging` or `unlimitedStorage` access.

No content scripts, web-accessible runtime resources or externally-connectable surface are declared.

Frequently Visited/history-derived data and automatic/browser-derived favicon pixels retain their frozen device-local ownership. M6 introduces no new persistence or transmission surface.

## 4. CSP / remote-code audit

The production release contract continues to pin:

```text
default-src 'none'; script-src 'self'; style-src 'self'; style-src-attr 'none'; img-src 'self' data:; connect-src http: https:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; worker-src 'self'
```

Static source review found no `eval`, `new Function`, `unsafe-eval`, or script `unsafe-inline` addition. Network fetch capability remains limited to the already-designed image/favicon and bundled-resource paths; it does not load executable remote code.

`tools/release_contract.py` continues to reject unapproved fixed external runtime host literals and development identities/endpoints in production packages.

## 5. Dependency/supply-chain audit

`package.json` has no `dependencies`, `devDependencies`, `optionalDependencies` or `peerDependencies` entries.

The JavaScript maintenance/test/benchmark layer statically imports local modules and Node built-ins only. Python packaging/release validation uses the standard library. Real-browser smoke talks to WebDriver through its standard HTTP protocol instead of adding Selenium/Playwright/Puppeteer as a project dependency.

**Decision:** preserve this dependency-free default. A dependency must demonstrate lower total maintenance/security cost than the built-in solution it replaces.

## 6. Maintenance-infrastructure complexity audit

M6 explicitly challenged whether M1–M5 had become overengineering.

### M1 — real-browser smoke

Retain. It directly addresses the real withdrawn 1.30.18.26 failure class where unit/generated tests passed but New Tab initialization failed in Firefox.

### M2 — one-command certification

Retain. It consolidates existing release gates and fails closed when real-browser evidence is unavailable. Mechanical mode is clearly distinguished from full certification.

### M3 — architecture/ADR/regression knowledge

Retain. It is intentionally small and prevents future cleanup from removing non-obvious safety/privacy boundaries whose reasons would otherwise be forgotten.

### M4 — targeted test groups

Retain. They are simple convenience subsets and do not replace or weaken the full suite.

### M5 — deterministic fuzzing

Retain at its current bounded scope. It uses no dependency, fixed seeds and bounded cases at four genuine trust boundaries. Do not expand it into UI/browser random fuzzing without a concrete need.

**Conclusion:** the infrastructure remains proportionate to demonstrated risks. No extra framework or M7 phase is justified.

## 7. Reachability / dead-code boundary

Post-M6 reachability remains:

- unreachable shared runtime modules: 0
- unused named production imports: 0
- unreferenced private functions: 0

The known exported test/reference surfaces remain explicitly classified rather than auto-deleted.

## 8. Regression evidence

The final `.37` suite contains 964 passing tests: the 960 inherited `.36` tests plus four M6 integrity regressions for:

1. browser floors and least-privilege permission budget;
2. dependency-free maintenance tooling;
3. compatibility/maintenance freeze policy;
4. architecture navigation to the permanent post-freeze references.

The existing generated Firefox/Chromium New Tab, background, Sync, Recovery, favicon, import/security, fuzz/property, release-contract and packaging regressions remain green.

## 9. Performance / size

No production algorithm changed, so M6 does not introduce a new benchmarked hot path. The benchmark completed successfully on the final candidate.

Runtime raw size remains exactly unchanged from 1.30.18.36:

- Firefox: 2,181,757 bytes
- Chromium: 2,203,401 bytes

The deterministic compressed payload changes only at the release-identity compression level.

## 10. Freeze policy

`docs/MAINTENANCE-POLICY.md` is now the permanent gate for reopening application architecture.

A future production architecture change requires one of:

- demonstrated bug;
- browser/platform/API compatibility requirement;
- security/privacy requirement;
- measurable maintenance problem;
- separately approved product objective.

File size, aesthetics, line count, fashion or a desire to continue refactoring are not enough.

## Final decision

**Maintenance Infrastructure is safe to freeze at MosaicSync 1.30.18.37. There is no planned M7 / 1.30.18.38 infrastructure release.**

Future MosaicSync releases return to normal maintenance/product work driven by concrete needs.

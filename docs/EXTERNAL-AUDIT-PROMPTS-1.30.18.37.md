# External audit prompts — MosaicSync 1.30.18.37

These prompts are intentionally different. They ask three reviewers to challenge the same release from complementary angles rather than producing three copies of the same audit.

---

## Mistral — broad adversarial maintainability / security / compatibility audit

You are auditing the final Maintenance Infrastructure freeze release of a production Firefox + Chromium Manifest V3 extension.

### Authoritative artifact

- `mosaicsync-1.30.18.37-github-ready.zip`
- Treat the uploaded ZIP as authoritative. Work from a clean local extraction.
- Do not use or modify GitHub.
- Do not implement fixes unless separately asked.

### Historical/freeze context

MosaicSync completed a five-step zero-new-features/full-code-refinement program at 1.30.18.32. Versions .33–.37 add maintenance guardrails around that frozen runtime. M6 / .37 is intended to be the final infrastructure audit/freeze release.

The claimed `.36 → .37` production `src/` diff is release identity only:

- `src/firefox/manifest.json`
- `src/chrome/manifest.json`
- `src/shared/core/constants.js`
- `src/shared/newtab/newtab.html`

M6 adds documentation/tests only: compatibility/security watchpoints, maintenance policy, pre/final audit records and four integrity tests.

### Audit objective

Try to disprove the claim that MosaicSync is now in a healthy, proportionate maintenance state. Look for real defects, hidden complexity, incorrect compatibility assumptions, security/privacy drift or maintenance infrastructure that creates more risk than it removes.

Audit at minimum:

1. **Browser compatibility**
   - Is Firefox `strict_min_version: 140.0` actually justified by the APIs/manifest keys used?
   - Is Chromium `minimum_chrome_version: 104` sufficient for every production API used, especially MV3 `_favicon`, `storage.session`, Top Sites, action/service worker semantics?
   - Are any browser-specific options accidentally passed to the other browser?
   - Are any APIs used without the permission/capability needed on either browser?

2. **Permissions / privacy**
   - Required vs optional permissions.
   - HTTP(S) optional host access.
   - Firefox data-collection declarations.
   - Device-local Frequently Visited/favicon policy.
   - Look for any runtime path that persists/transmits browser-history-derived data contrary to policy.
   - Look for unnecessary `tabs`, history, cookies, content-script, webRequest or similar power hidden in generated manifests.

3. **CSP / remote code / injection**
   - CSP correctness.
   - Remote executable code, eval-like mechanisms, HTML injection, unsafe URL handling.
   - External fixed hosts and favicon/image fetch boundaries.
   - Profile import / prototype-pollution / checksum validation boundaries.

4. **Dependency / supply chain**
   - Confirm whether the repository is genuinely dependency-free.
   - Challenge whether WebDriver/browser smoke and packaging tooling import undeclared third-party packages.
   - Look for bundled generated dependencies that evade `package.json`.

5. **Maintenance infrastructure proportionality**
   - M1 real-browser smoke.
   - M2 `npm run certify` vs mechanical mode.
   - M3 architecture/ADR/regression docs.
   - M4 targeted test groups.
   - M5 deterministic fuzzing.
   - M6 compatibility/maintenance policy.
   - Identify duplicated gates, misleading certification claims, or tools likely to rot.

6. **Frozen runtime integrity**
   - Verify no product algorithm was accidentally changed in .37.
   - If a .32 or .36 archive is also supplied, independently diff them; otherwise do not pretend you performed that comparison.
   - Challenge release-identity-only claims against source and generated output.

7. **Tests**
   - Run the full suite.
   - Inspect tests for circular/self-fulfilling claims.
   - Distinguish structural assertions from behavioral proof.
   - Challenge whether 964 passing tests could still miss high-impact browser behavior.
   - Examine the .26 permanent startup regression and whether M1/M2 genuinely improve protection.

8. **Build / package / reproducibility**
   - Build from a clean source extraction.
   - Run reachability, release contracts and package creation.
   - Re-extract the new source package and attempt independent byte reproduction.
   - Report exact hashes/results.

### Reporting standard

Lead with one decision:

- SAFE TO FREEZE
- SAFE WITH NON-BLOCKING HARDENING
- NARROW CORRECTIVE RELEASE REQUIRED
- NOT READY TO FREEZE

Then report findings by CRITICAL / HIGH / MEDIUM / LOW / INFORMATIONAL. For each real finding include exact file/function, harmful sequence, whether it is introduced by M6 or inherited, confidence, and the smallest corrective/test direction.

Do **not** invent defects to make the audit look productive. Do **not** recommend refactoring merely because a file is large. Explicitly list suspicious things you investigated and dismissed.

Finish by answering: **Has MosaicSync reached the point where further generic maintainability work would be more likely to add churn than value?**

---

## Claude — forensic ownership / invariants / semantic-equivalence audit

Conduct a forensic, evidence-driven audit of MosaicSync 1.30.18.37 as the final Maintenance Infrastructure freeze release.

### Artifact and restrictions

- Authoritative source: `mosaicsync-1.30.18.37-github-ready.zip`
- Work only from clean local extraction(s).
- Do not modify production source during diagnosis.
- Do not interact with GitHub.
- Do not implement fixes.
- Distinguish what you directly prove from what release documents merely claim.

### Central claim to verify

MosaicSync's application architecture froze at 1.30.18.32. M1–M6 (.33–.37) should add only guardrails around that runtime. For `.36 → .37`, the only production `src/` changes should be release identity in four files. M6 should improve documentation/test evidence without changing product behavior.

### Phase A — establish a clean evidence ledger

1. Hash the supplied archive.
2. Clean-extract it.
3. Inventory all source/test/tool/doc files changed or introduced for M6 if a `.36` comparison is available.
4. Build deterministically.
5. Run all tests, reachability, release contracts, size report and benchmark.
6. Package Firefox/Chromium/source.
7. Validate packaged contracts.
8. Re-extract the produced source ZIP into a second clean tree, rebuild/retest/repackage and compare artifacts byte-for-byte.
9. Record exact failures rather than working around them.

### Phase B — ownership/invariant audit

Reconstruct and verify the frozen ownership model rather than judging line counts:

- authoritative local state vs disposable first-paint/session caches;
- New Tab orchestration vs pure helpers;
- browser-derived Frequently Visited/favicon data vs synchronized/user artwork;
- shared browser-neutral background core vs Firefox/Chromium adapters;
- normal Sync vs catastrophic Recovery;
- Recovery Format / Store / Lifecycle / Continuity / orchestrator responsibilities;
- reset authority and pending-journal quarantine;
- build/package/release-contract authority.

For each boundary answer:

- Who is the canonical owner?
- What data/effects must never cross it?
- Which tests prove it behaviorally?
- Which assertions are only structural/source-shape?
- Did M1–M6 accidentally create a second owner?

### Phase C — compatibility semantics

Directly inspect every browser API family used by production source and compare it with the declared floors and permissions.

Pay special attention to:

- Firefox 140 `data_collection_permissions` rationale;
- Firefox optional host permission + `tabs.query({url})` favicon behavior without broad `tabs` permission;
- Firefox Top Sites options;
- Chromium 104 MV3 `_favicon` support and `favicon` permission;
- Chromium `storage.session`, service-worker lifetime assumptions, Top Sites and optional permission semantics;
- `theme.getCurrent`/theme events;
- storage.sync quotas and MV3 restart safety.

If external browser documentation is unavailable, state that limit rather than guessing.

### Phase D — security/privacy trust boundaries

Trace concrete flows for:

- profile import and hostile object keys;
- URL navigation validation;
- website/favicon fetches and host permission gates;
- automatic favicon durability/sync exclusion;
- Frequently Visited history data;
- Recovery malformed/torn/future-schema data;
- CSP and remote-code exclusion;
- fixed external URL allow-listing.

Look for a sequence that can cause data loss, stale-state resurrection, privacy leakage, remote-code execution, permission escalation or browser-parity divergence.

### Phase E — maintenance-infrastructure quality

Assess M1–M6 as a system.

- Does `npm run certify` actually compose independent gates or merely re-run self-referential checks?
- Can mechanical-only mode be mistaken for full certification?
- Can browser-smoke silently skip unavailable browsers?
- Are test groups only convenience views while full tests remain authoritative?
- Is fuzzing deterministic/bounded/reproducible?
- Can ADR/regression docs silently drift from code/tests?
- Does the new maintenance policy meaningfully prevent refactor churn without blocking real fixes?

### Required report

1. Actual verdict.
2. Confirmed findings by severity.
3. Evidence ledger with hashes/test/build/reproduction results.
4. Ownership map.
5. Browser compatibility/permission matrix.
6. Security/privacy trust-boundary assessment.
7. Maintenance-infrastructure assessment.
8. Tests that can pass while wiring is wrong.
9. Findings investigated and dismissed.
10. Freeze recommendation.

For every finding include confidence, exact evidence, harmful sequence, introduced-vs-inherited status, narrow corrective direction and required regression.

Do not equate a green suite with correctness, but do not manufacture theoretical blockers without a credible reachable sequence.

End with exactly one decision:

- Maintenance Infrastructure is safe to freeze at 1.30.18.37.
- Maintenance Infrastructure is complete but needs audit-only hardening.
- A narrow corrective release is required before freeze.
- The maintenance design is overengineered or incomplete and needs redesign.

---

## Grok Code — code-first adversarial build/runtime/tooling audit

Act as a senior extension/release engineer reviewing MosaicSync 1.30.18.37. Be code-first and command-driven. Do not rely on release notes when the repository can answer the question.

### Input

`mosaicsync-1.30.18.37-github-ready.zip`

Do not modify GitHub. Extract locally. Do not fix code during the audit.

### Mission

Try to break the final freeze claim with static analysis, generated-runtime execution, malformed inputs, packaging checks and tool-chain inspection.

### 1. Source graph / dead code

- Enumerate runtime roots from manifests/HTML.
- Independently identify unreachable shared JS modules, unused named imports, unreferenced private functions and suspicious exported-but-production-unused helpers.
- Compare your result with `npm run reachability` rather than trusting it.
- Flag false positives caused by MV3 events/dynamic imports/test hooks.

### 2. Browser build parity

- Inspect `tools/build.mjs` and generated Firefox/Chrome trees.
- Verify shared files are truly generated from one owner where claimed.
- Verify browser overlays are limited to real capability differences.
- Check that Chrome's browser shim/injected New Tab ordering is deterministic.
- Verify generated manifests have exactly the intended capabilities.

### 3. API/permission static audit

Extract every `browser.*` / `chrome.*` API family and map it to:

- browser(s) where it executes;
- manifest permission/optional permission/host permission;
- minimum browser version assumption;
- fallback behavior when absent/rejected.

Specifically challenge Firefox 140 and Chrome 104 floors, Chrome `_favicon`, storage.session, Firefox URL-filtered tabs queries, Top Sites, bookmarks, permissions events, alarms and theme APIs.

### 4. Security-oriented code scan

Search for and inspect:

- `eval`, `Function`, inline executable code;
- `innerHTML`/HTML parsing sinks;
- dangerous URL schemes;
- remote scripts/styles;
- `fetch` call sites and credential/referrer/cache policy;
- profile/import parsing and prototype-pollution controls;
- object construction from untrusted keys;
- data URLs/SVG/image decoding limits;
- Sync/Recovery decompression/chunk limits;
- fixed external host literals.

Do not stop at grep: trace reachable inputs into each suspicious sink.

### 5. MV3 lifecycle / concurrency

Use existing generated-background harnesses and add temporary audit-only tests if needed. Challenge:

- worker restart during writes;
- alarm loss/restart;
- storage.onChanged races;
- pending local/cross-Space journal replay;
- catastrophic Recovery vs normal Sync;
- root-last Recovery generation publication;
- delayed storage.sync visibility;
- device-local favicon learning vs synchronized state.

Do not modify certified production source to make tests pass.

### 6. Test-suite quality

Run all tests. Then inspect whether important checks are:

- pure unit;
- generated Firefox;
- generated Chromium;
- full New Tab integration;
- real-browser WebDriver contract;
- structural regex/source-shape;
- packaging/reproducibility.

Find high-impact invariants that still rely only on weak mocks/source regex. Attempt at least one mutation test against an important integration boundary and record whether the suite catches it.

### 7. M1–M6 tooling attack

Review `browser-smoke.mjs`, `certify-release.mjs`, packaging, test groups and deterministic fuzz helper for bugs in the tools themselves.

Challenge:

- browser unavailable behavior;
- false full-certification state;
- stale `dist/` leakage;
- ZIP path traversal during clean extraction;
- non-deterministic ZIP metadata/order;
- source ZIP recursively packaging generated artifacts;
- hash comparison errors;
- platform path/Windows handling;
- fuzz seed reproducibility;
- test-file group omissions.

### 8. Reproducibility

From a clean extraction:

- build;
- test;
- reachability;
- release contracts;
- package;
- hash all artifacts;
- extract the newly produced source archive elsewhere;
- repeat;
- require byte equality of Firefox ZIP, Chrome ZIP, source ZIP and build-manifest.

### Output

Start with `PASS`, `PASS WITH HARDENING`, or `FAIL`.

Then provide a compact findings table with severity, file/function, reachability, reproduction, harmful impact, introduced/inherited, and smallest fix/test.

Separate:

- proven production defects;
- test/tooling defects;
- maintainability concerns;
- false alarms/dismissed items.

Finally answer two questions:

1. Is 1.30.18.37 safe to freeze as the final Maintenance Infrastructure release?
2. Is there any concrete reason to create a generic maintenance 1.30.18.38, or should future versions wait for a real bug/platform/security/product need?

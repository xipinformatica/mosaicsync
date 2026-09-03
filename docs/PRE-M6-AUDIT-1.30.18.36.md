# Pre-M6 forensic audit — MosaicSync 1.30.18.36

**Purpose:** establish whether the validated 1.30.18.36 source needs any production change before the final Maintenance Infrastructure freeze.

**Authoritative source SHA-256:** `0832f038fa4697b956ff2a9b4a597a22d20eb33e23ff5b2ca0b993ea72b2f56b`

## Verdict before M6 implementation

**No production defect or compatibility blocker was found. M6 should remain audit/documentation/test-infrastructure only.**

## Evidence established

- Clean extraction of the certified 1.30.18.36 GitHub-ready source.
- Canonical deterministic build succeeded.
- Full regression suite: **960 / 960 passing**.
- Runtime reachability: zero unreachable shared modules, zero unused named production imports, zero unreferenced private functions.
- Generated Firefox and Chromium release contract: pass.
- Production `src/` compared with the frozen 1.30.18.32 architecture baseline: **no changed/added/removed runtime source file outside the four release-identity files**.
- `package.json`: zero dependencies/devDependencies/optionalDependencies/peerDependencies.
- Static runtime scan: no `eval`, `new Function`, `unsafe-eval`, `unsafe-inline`, content scripts, `web_accessible_resources`, or `externally_connectable` surface.
- Required/optional permission sets match the frozen release contract.

## Browser compatibility findings

### Firefox

- `strict_min_version: 140.0` is justified exactly by Firefox 140 introducing `browser_specific_settings.gecko.data_collection_permissions`, which MosaicSync declares.
- Optional `topSites` and `bookmarks` remain correctly user-controlled.
- Matching optional HTTP(S) host permissions can expose matching tab URL/title/favicon metadata without adding the broad `tabs` permission; MosaicSync's Firefox favicon adapter checks granted web access before its URL-filtered `tabs.query()` lookup.
- No Firefox-specific API usage found that requires a higher floor than the declared 140.

### Chromium

- `minimum_chrome_version: 104` is justified exactly by Chrome 104 introducing the Manifest V3 `chrome-extension://<id>/_favicon/` API MosaicSync uses.
- Other audited key floors are lower (`storage.session` Chrome 102+, Promise `topSites.get()` Chrome 96+, Manifest V3/action earlier), so the current 104 floor remains appropriate.
- The required `favicon` permission is therefore intentional, browser-specific and correctly absent from Firefox.

## Permissions / privacy / CSP

- Firefox required: `storage`, `alarms`.
- Chromium required: `storage`, `alarms`, `favicon`.
- Both optional: `topSites`, `bookmarks`, HTTP(S) host access.
- No broad `tabs`, `history`, `cookies`, `webRequest`, `scripting`, `downloads`, `management`, `nativeMessaging` or `unlimitedStorage` permission.
- CSP remains self-script-only with no eval/inline-script relaxation.
- No content-script injection surface exists.
- Frequently Visited/browser-history and automatic favicon privacy ownership remains frozen and unchanged.

## Maintenance-infrastructure assessment

M1–M5 add useful guardrails without changing the frozen application runtime:

- M1 catches real-browser startup/interaction failures.
- M2 turns release certification into one fail-closed canonical workflow.
- M3 preserves architectural reasons and regression history.
- M4 provides simple targeted test subsets without weakening the full suite.
- M5 adds bounded, deterministic fuzzing to four real trust boundaries without dependencies or UI randomness.

No evidence was found that the infrastructure has become more complex than the maintenance problems it solves.

## Pre-M6 decision

Proceed with M6 as a **freeze release**. Add only compatibility/security/dependency documentation, permanent maintenance policy, integrity tests, release identity and final audit evidence. Do not change production algorithms.

# MosaicSync 1.30.18.37 publication notes

## Mozilla Developer Hub changelog

Completes the Maintenance Infrastructure roadmap with a final browser/API compatibility, dependency, permission/privacy/CSP and maintenance-system audit. The frozen MosaicSync application runtime is unchanged apart from release identity.

## Notes to Reviewer

MosaicSync 1.30.18.37 begins from the validated 1.30.18.36 runtime and completes Maintenance Infrastructure M6 as an audit/freeze release, not another production refactor.

The pre-change audit re-established the complete 1.30.18.36 regression/reachability/release-contract baseline and compared its application source with the frozen 1.30.18.32 architecture baseline. Outside release identity, the Maintenance Infrastructure releases have not changed the extension runtime.

M6 records the reviewed browser/API assumptions in `docs/COMPATIBILITY.md`. Firefox remains 140+ because Firefox 140 introduced the `browser_specific_settings.gecko.data_collection_permissions` manifest capability MosaicSync declares. Chromium remains 104+ because Chrome 104 introduced the Manifest V3 `_favicon` endpoint used by the Chromium browser-local favicon adapter; other audited key capability floors are lower.

The permission budget remains unchanged and least-privilege: Firefox requires only `storage` and `alarms`; Chromium additionally requires its browser-local `favicon` capability. `topSites`, `bookmarks` and HTTP(S) hosts remain optional. No content-script surface or broad tabs/history/cookies/webRequest/scripting/native-messaging permission is introduced, and the existing strict CSP is unchanged.

M6 also records the permanent post-freeze change policy in `docs/MAINTENANCE-POLICY.md`. Production architecture should only be reopened for a demonstrated bug, browser/API requirement, security/privacy requirement, measurable maintenance problem, or separately approved product objective—not aesthetics, file size or continued refactoring momentum.

The repository remains dependency-free for npm runtime/development tooling. M1–M5 are retained because each addresses a demonstrated maintenance risk while remaining outside the frozen application runtime.

No product feature, UI behavior, permission, CSP, schema, persisted payload, locale, first-paint/cache, Frequently Visited, favicon, Sync, Recovery, storage or browser-adapter behavior changes.

## Chrome Web Store release notes

Final Maintenance Infrastructure audit/freeze release. Confirms browser compatibility, least-privilege permissions, dependency-free maintenance tooling and permanent change policy around the frozen runtime. No feature, permission or synchronized-data-format change.

## GitHub release title

`MosaicSync 1.30.18.37`

## GitHub release description

MosaicSync 1.30.18.37 completes and freezes the post-refinement Maintenance Infrastructure roadmap.

The release performs the final browser/API compatibility, dependency, permission/privacy/CSP and maintenance-system audit, records the reviewed Firefox 140 / Chromium 104 support floors, and formalizes the rule that future production architecture work requires a concrete demonstrated reason.

Application behavior and architecture remain frozen apart from release identity. There is no planned Maintenance Infrastructure M7 release.

## GitHub Desktop commit

**Summary:** `Release MosaicSync 1.30.18.37`

**Description:** Complete M6 final compatibility/security/dependency audit and freeze the Maintenance Infrastructure roadmap; no product behavior change.

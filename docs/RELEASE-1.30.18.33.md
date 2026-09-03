# MosaicSync 1.30.18.33 publication notes

## Mozilla Add-ons changelog

Begins the post-refinement Maintenance Infrastructure phase with automated real-browser smoke tooling. Product behavior, permissions and data formats are unchanged.

## Notes to Reviewer

MosaicSync 1.30.18.33 begins from the frozen, manually validated 1.30.18.32 runtime and does not reopen the completed production-architecture refinement program.

M1 adds dependency-free WebDriver tooling outside the extension runtime. The smoke creates fresh disposable browser profiles and exercises the actual New Tab override: it seeds an isolated onboarded profile through extension storage, requires the production `interactionReady` boundary, opens Settings, switches Personal/Work Spaces, checks the disabled Frequently Visited surface and follows a real shortcut navigation.

Firefox smoke uses the isolated `mosaicsync-dev@xipinformatica.cat` temporary development package. Chromium smoke uses the generated Chromium runtime in an isolated automation profile. Optional Top Sites, Bookmarks and host permissions are deliberately not granted by this smoke.

The only extension-runtime source edits are the unified 1.30.18.33 release identity. Startup/first-paint, New Tab algorithms, Settings behavior, Frequently Visited semantics, favicon/artwork policy, storage, Sync, Recovery, permissions, CSP, schemas, locales and browser adapters are unchanged.

## Chrome Web Store release notes

Maintenance tooling only: adds an automated real-browser smoke lane around the frozen runtime. No feature, permission or synchronized-data-format change.

## GitHub release title

`MosaicSync 1.30.18.33`

## GitHub release description

MosaicSync 1.30.18.33 begins the Maintenance Infrastructure roadmap after the completed 1.30.18.32 architecture freeze.

M1 adds portable real-browser smoke automation for Firefox and Chromium/Chrome-for-Testing using fresh isolated profiles. The lane checks the browser's real New Tab override, interaction readiness, Settings, Space switching, Frequently Visited's disabled state and shortcut navigation without changing the extension runtime or granting optional permissions.

No product algorithm, permission, CSP, schema, persisted payload, locale, first-paint/cache, favicon, Sync, Recovery or browser-adapter behavior changes.

## GitHub Desktop

**Summary:** `Release MosaicSync 1.30.18.33`

**Description:** Begin Maintenance Infrastructure M1 with isolated real-browser smoke automation around the frozen 1.30.18.32 runtime.

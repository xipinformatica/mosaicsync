# MosaicSync

**Your browser start page, organized your way.**

MosaicSync is an open-source start page and shortcut manager for Firefox and Chromium-based browsers. It provides Spaces, folders, flexible layouts, wallpapers, automatic favicon handling, bookmark integration, Frequently Visited suggestions, profile backup/transfer, and browser-native synchronization.

**Current source release: 1.30.18.42**

- Website: https://xipinformatica.cat/mosaicsync/
- Firefox Add-ons: https://addons.mozilla.org/addon/mosaicsync/
- Chrome Web Store: https://chromewebstore.google.com/detail/mosaicsync/adoedheeaigmimommakojmmlahcckjkh
- License: [Mozilla Public License 2.0](LICENSE)
- Privacy: [PRIVACY.md](PRIVACY.md)
- Security: [SECURITY.md](SECURITY.md)
- Contributing: [CONTRIBUTING.md](CONTRIBUTING.md)
- Development notes: [README-DEVELOPMENT.md](README-DEVELOPMENT.md)
- Release history: [CHANGELOG.md](CHANGELOG.md)

### Maintenance Infrastructure

The five-step production-code refinement program is frozen at 1.30.18.32. Maintenance Infrastructure releases improve guardrails around that frozen runtime rather than continuing architectural churn. M1 added dependency-free real-browser smoke automation; M2 added one fail-closed end-to-end release-certification command, `npm run certify`; M3 made the accumulated architecture knowledge permanent; M4+M5 now organize the regression suite into simple targeted commands and add a small deterministic property/fuzz layer at high-value data trust boundaries. See [docs/MAINTENANCE-INFRASTRUCTURE.md](docs/MAINTENANCE-INFRASTRUCTURE.md) and [README-DEVELOPMENT.md](README-DEVELOPMENT.md).

## Why the source is here

MosaicSync handles personal browser data such as shortcuts and, when the user enables the relevant optional features, browser-derived information such as Frequently Visited sites or bookmarks. The repository is public so those behaviors can be inspected rather than taken on trust.

MosaicSync does not operate its own synchronization or analytics backend. Synchronization uses the browser's native sync storage where supported. The extension contains no MosaicSync analytics or telemetry service.

See [PRIVACY.md](PRIVACY.md) for the data-flow details and [SECURITY.md](SECURITY.md) for reporting security issues.

## Repository layout

```text
src/
  shared/      Browser-neutral application source
  firefox/     Firefox-specific overlay and manifest
  chrome/      Chromium-specific overlay and manifest

dist/
  firefox/     Generated Firefox runtime tree
  chrome/      Generated Chromium runtime tree

tests/         Permanent regression and security/correctness tests
tools/         Deterministic build and packaging tools
docs/          Architecture, QA and historical engineering documentation
fixtures/      Test fixtures
bench/         Reproducible performance benchmark
```

`src/` is the canonical source. `dist/` is generated from the shared source plus browser overlays and is intentionally included so reviewers can inspect the exact generated browser trees. `build-manifest.json` records SHA-256 hashes for generated runtime files.

## Build and test

Requires **Node.js 22+**.

```bash
npm run build
npm test
npm run bench
npm run size
```

For fast local feedback, the same suite is also grouped by subsystem:

```bash
npm run test:groups
npm run test:startup
npm run test:newtab
npm run test:sync
npm run test:recovery
npm run test:security
npm run test:browser
npm run test:core
npm run test:release
```

These are convenience subsets only. `npm test` remains the release-authoritative regression suite.

To create deterministic Firefox and Chrome runtime ZIPs:

```bash
python tools/package.py
```

`npm test` rebuilds both browser trees before running the regression suite.

## Current release identity

The active source release is **1.30.18.42** across both browser manifests, Chrome `version_name`, the shared runtime `VERSION`, the Settings version label, package filenames and current release tests. `build-manifest.json` records the same technical version for both generated browser trees.

Older version numbers appearing in `CHANGELOG.md`, `docs/QA-*.md`, tests named after earlier regressions, or historical sections of `README-DEVELOPMENT.md` are intentional historical references. They are not the current runtime version.

1.30.18.42 is a corrective Sync-safety release for failures demonstrated during a Firefox/CachyOS ↔ Windows dual-boot investigation. Exact own-write echo suppression no longer depends on wall-clock expiry, Sync storage-event bursts are coalesced, immutable device/profile snapshots are selected as one atomic Recovery generation instead of being merged across devices, automatic live Sync waits for coherent shared ledgers, and named “Received from …” attribution is shown only when the source is exact. Catastrophic-loss detection now judges the live shared Sync core rather than stale Recovery metadata/snapshot bytes. No permission, CSP or Sync/Recovery wire-schema version changes are introduced.

1.30.18.41 removes the last small first-frame movement beneath a two-row Frequently Visited strip. Hidden reservation cards and live cards share one explicit critical-CSS row height; the synchronous bootstrap, favicon decode/commit path and startup speed architecture remain unchanged.

1.30.18.38 is the **post-M6 external-audit corrective endpoint** that fixed the demonstrated Chromium Top Sites adapter leak and maintenance-tool portability findings without reopening generic refactoring.

1.30.18.24 is the frozen **Step 4 Recovery ownership endpoint**. Its post-release forensic audits found no corrective production defect requiring another Recovery release.

1.30.18.22 hardens **Step 4 Recovery retention and cleanup**. A newly published immutable generation must now verify its own root and chunks before older verified copies may be pruned; a torn root decoded only through its embedded previous-generation fallback remains usable for Recovery but cannot count as a newly verified copy. Retention and stale-generation GC count only independently verified complete Personal+Work generations, current-schema unreadable roots receive conservative repeated-observation grace, and every destructive cleanup re-reads and revalidates browser Sync immediately before deletion. No Recovery/Sync schema, persisted key, permission, CSP, privacy boundary, product feature or normal Sync behavior changes.

1.30.18.21 advanced **Step 4 Recovery ownership refinement** with a browser-neutral generation store. Complete-profile payload/chunk assembly, verified generation reads, own-generation selection, immutable chunks-first/root-last commit with failed-chunk rollback and post-write verification moved into `src/shared/background/recovery-generation-store.js`; policy remained in the shared core.

1.30.18.20 began Step 4 by isolating immutable Recovery-generation representation and validation in `recovery-generation-format.js` without moving storage orchestration.

1.30.18.19 is the certified **pre-Step-4 hardening release** that closed the final Frequently Visited first-frame geometry gaps and added generated-runtime catastrophic-Sync characterization before Recovery production code was touched.

1.30.18.17 completes **Step 3.2 browser-boundary consolidation**. The identical background entrypoint and New Tab DOM now have one shared source owner; manifest locale wrappers are generated deterministically from one reviewed 33-locale registry; and common Top Sites/web-origin permission policy is shared while Firefox data-collection consent and Chromium's no-op Sync-permission behavior remain isolated behind a tiny permission capability module. The generated New Tab shell/locales/background entrypoint were proven byte-for-byte identical to the live 1.30.18.16 runtime before the version bump, and the permission seam is covered behaviorally on both browsers. No product feature, state/meta/Sync/Recovery schema, permission grant, CSP, Step-2 ownership, privacy boundary or UI behavior changes.

1.30.18.16 is the Step 3 adapter-boundary hardening release that added production-runtime regressions around Firefox open-tab/tab-update favicon learning and Chromium protected `_favicon` behavior.

1.30.18.14 completes **Step 2.3 and Step 2** of the staged maintainability program. The persistent `localStorage` render manifest is now a presentation-only cold-start accelerator instead of a second structural/profile representation: it may retain an inert Personal-grid visual projection, tiny artwork previews and Space labels, but no shortcut URLs, mutation clocks, Frequently Visited state or duplicated semantic First-Paint Contract. Work shortcut structure is no longer persisted in that cache at all. Warm structural truth remains owned by `storage.session`, authoritative navigation is installed only after validated state arrives, and cache adoption compares visual equivalence rather than revision clocks. The disposable render-manifest schema advances from v4 to v5; profile/state/meta/Sync/Recovery schemas, permissions, CSP, product features and backend-free operation are unchanged.

1.30.18.13 temporarily pauses the maintainability roadmap to add **device naming and synchronized-change attribution** only. A MosaicSync installation can be named during Welcome when Sync is chosen and renamed later in Settings. The friendly name is tied to the existing stable random device ID and synchronized as a tiny attribution-only record, while existing layout datasets continue carrying their existing origin device ID. Settings shows which named device produced the latest synchronized change using the source dataset timestamp and, when relevant, a separate local receipt time. Existing installations receive a browser/OS fallback name after first paint. All 33 UI languages are updated; permissions, CSP, layout/Sync/Recovery schemas, telemetry and backend-free operation remain unchanged.

1.30.18.12 is a **post-audit Step 2.2 corrective release**. It closes the concrete edge cases found after 1.30.18.11 was published: an older slow Frequently Visited favicon decode can no longer resurrect a strip after the feature is disabled/emptied; rich live FV artwork is now independent from its bounded session-only first-paint derivative; stale full-record Sync/status metadata writes preserve newer onboarding intent; and manually selected detected favicons synchronize a compact exact-choice identity rather than image bytes. Legacy manual Browser-choice tokens are upgraded from the originating device's selected local pixels when possible, so another browser can re-discover the exact chosen candidate without consuming Sync image quota. No Step 2.3 work, schema expansion, permission change, telemetry, backend or new product feature is introduced.

1.30.18.11 is a **Step 2.2 ownership/concurrency corrective release**. It closes the remaining ownership side doors found in the certified 1.30.18.10 audit: generic structural warming can no longer write Frequently Visited session data; ordinary structural profile persistence no longer writes the device active-Space pointer; startup active-Space/meta repair re-reads authority under the shared persistence lock; and independent setup/UI meta changes use field-intent updates so unrelated newer fields cannot be lost. Frequently Visited favicons now receive bounded session-only first-paint derivatives and are decoded while detached before an FV strip is atomically committed, eliminating the intermediate missing-favicon frame without persisting browser-history artwork. While Settings is open, Light/Dark preview changes also update canvas text/shadow treatment immediately while the expensive full-page wallpaper/dim repaint remains deferred. No Sync/Recovery/profile schema, permission, CSP, telemetry, backend or product-feature expansion is introduced.

1.30.18.10 is **Step 2.2** of the maintainability transition: shared startup ownership is now enforced under real cross-context concurrency. Structural `storage.session` publication happens inside the same Web Lock transaction as authoritative `storage.local` persistence, active-Space persistence uses that same ordered boundary and republishes from the persisted pointer, and browser-derived Frequently Visited candidates physically own a separate session-only key so they cannot overwrite Space/grid/artwork state. New adversarial interleaving tests pause older writers at the exact previously unsafe boundaries. On a true cold browser start, live Frequently Visited acquisition begins immediately after authoritative startup instead of waiting the generic 250 ms maintenance delay, without persisting browsing-history candidates. Existing shortcut-grid behavior, artwork architecture, appearance/wallpaper paths, normal Sync, Recovery, permissions, CSP, privacy boundaries, telemetry policy and backend-free operation remain unchanged.

1.30.18.6 is the first **maintainability-foundation / first-paint consistency** release. The disposable render-manifest and browser.session acceleration layers now share one small first-paint contract for active Space state, personalized Space names and Frequently Visited, so Work can paint its cached Frequently Visited cards continuously from frame one without weakening the stricter Work-grid authorization gate. Sync-storage reporting now separates Layout & settings, Recovery safety copies, Shortcut images and Metadata / cleanup, with progressive storage-pressure warnings before the browser quota is exhausted. First-paint cache creation/refresh is centralized, the disposable cache format is explicitly versioned with a one-release 1.30.18.5 bridge, and docs/ARCHITECTURE.md records the authoritative-state, Sync, Recovery, Artwork, First Paint and browser-adapter boundaries that future consolidation work must preserve. Ordinary Sync/state/profile schemas, permissions, CSP, privacy boundaries, telemetry policy and backend-free architecture remain unchanged.

1.30.18.5 is a focused **first-paint continuity and recovery-observation hardening** release. The browser.session acceleration layer now carries both personalized Space names, so it cannot briefly overwrite an already-correct first frame with the built-in Personal/Work labels before authoritative state arrives. Recovery-device retirement is now based on this installation's own repeated observations rather than the publishing computer's wall clock, and root-less fragment cleanup requires multiple GC observations in addition to elapsed time so a single clock jump cannot turn a fresh in-flight publication into garbage. The near-quota failure path is also covered end-to-end: if the oldest verified recovery is retired to make room and the replacement then fails, one verified fallback must remain. Ordinary Sync/state/profile schemas, permissions, CSP, privacy boundaries, telemetry policy and backend-free architecture remain unchanged.

1.30.18.3 is a focused **recovery-snapshot identity hardening** release. Browser profiles that were cloned or restored from the same source can legitimately share MosaicSync's stable `deviceId`; their complete Personal+Work recovery snapshots now publish under immutable commit-scoped roots and chunk namespaces instead of overwriting one fixed per-device root. Legacy fixed-root `a/b` snapshots remain readable, failed root commits roll back only their new chunks, and cleanup keeps recovery storage bounded. Ordinary Sync record identity, conflict semantics and Sync/state/meta schema versions are unchanged, with no new permission, UI, telemetry or backend behavior.

1.30.18.2 is the focused **Frequently Visited permission-recovery** follow-up. If the synchronized Show preference is ON but this browser installation no longer has the optional Top Sites permission, the New Tab exposes a localized one-click **Grant permission** recovery state where the sites normally appear; Settings highlights the same prerequisite. Normal updates with an intact permission do not prompt again, and granting/restoring permission refreshes the sites automatically without forcing an OFF → ON toggle.

1.30.18.1 is the focused **first-paint cache authority hardening** release. Disposable session and localStorage launcher caches remain visual accelerators only: non-Personal session state is cross-checked against the already-running authoritative local read, synchronous boot manifests never expose Work, cached shortcut/Frequently-Visited content stays inert until its own authoritative handoff, and failed startup verification discards rather than unlocks stale cached targets. The boot-manifest writer also projects Personal while Multiple Spaces is disabled and folder adoption validates cached child titles/URLs before reuse.

1.30.18 is a focused **state-consistency and performance refinement** release. When Multiple Spaces is disabled, session first-paint state is forced to Personal; external state changes skip a full grid rebuild only when a conservative exact Manual-grid comparison proves the visible grid and its interaction wiring are unchanged; and inactive-Space wallpaper preloading is skipped while Spaces are off. Sync/state schemas, permissions, telemetry and backend behavior are unchanged.

1.30.16 is a focused **browser/store contract hardening** release. Firefox declares desktop-only support by removing the accidental `gecko_android` compatibility block, while Chrome explicitly declares its real API floor with `minimum_chrome_version: 104`. Release-contract checks pin the exact approved manifest properties, required/optional/host permissions, browser-specific New Tab/Home behavior, production identity, Firefox data-collection categories and their documented browser-native-Sync rationale, plus final-package checks that reject unapproved capabilities, development IDs and unexpected fixed external endpoints. Privacy wording distinguishes synchronized shortcut URLs/settings from device-local Firefox history/Top Sites and from developer telemetry.

1.30.15 introduced compact per-logical-setting Sync clocks so independent Settings changes from different devices converge without stale-field clobbering; same-setting conflicts remain deterministic and reset/recovery authority remains unchanged.

1.30.14 is a focused **Sync recovery hardening + manual favicon-intent synchronization** release on top of 1.30.13. Catastrophic-zero detection now requires both the quota API and a full namespace read to agree that Sync is empty; a persisted loss state gets a fresh startup warm-up before any recovery publication; a worker interrupted during recovery observes a persisted retry grace; and peers that observe an intentional reset remain safely enrolled in `await-remote` so they can automatically accept a later authoritative replacement without merging pre-reset data back into it. Reset markers now require a non-empty initiating device ID.

When the user explicitly chooses one of MosaicSync's detected favicon candidates, 1.30.14 synchronizes only a compact optional preference token, never the favicon pixels or raw favicon URL. Receiving devices reconstruct the chosen candidate locally through the existing bounded favicon discovery/recovery pipeline when permission is available. The preference is preserved if the local browser cannot currently fetch it, manual intent outranks automatic favicon selection, and ordinary shortcuts that never use the chooser pay zero additional Sync bytes. The existing **Sync this image** option remains the only path that deliberately synchronizes optimized image bytes.

1.30.13 remains the foundation for catastrophic Sync-loss containment: established devices preserve their local Personal/Work profile through a confirmed raw zero namespace, retain bounded verified deletion tombstones, replay pending edits after safe recovery, and distinguish MosaicSync-controlled reset through a non-zero reset marker. 1.30.12's non-destructive lifecycle handling and separate Firefox development identity remain intact.

1.30.11 is a focused **Settings appearance regression fix** on top of 1.30.10. Wallpaper selection, normal background darkness, separate Light/Dark wallpaper selection and the active Light/Dark darkness slider again update visually in real time while Settings is open. The Firefox/Linux compositor safeguard remains intact: MosaicSync does not repaint the authoritative full-screen `.page` wallpaper or root darkness variables under the open Settings surface. Instead, Settings-only secondary CSS provides an isolated paint-contained preview layer backed by a plain `<img>` and its own dim overlay; closing Settings commits the same appearance once to the real page on the existing next-frame deferred path and clears the preview. Sync, storage/profile schemas, permissions, snapshot caching, CSP, navigation and privacy behavior are unchanged.

The Firefox and Chrome New Tab runtime continues to come from one canonical shared source at build time, preventing browser drift without runtime imports. Runtime CSS consists only of launcher-critical CSS plus idempotent on-demand secondary CSS; the obsolete monolithic reference stylesheet has been removed from the source tree entirely. The mascot remains critical-only, logo hover does not request secondary CSS, Light mode is correct from the first frame, and reduced-motion behavior is preserved.

All 33 UI locales and both browsers' 33 manifest locale sets are validated for exact key/placeholder parity and runtime loading. No new permissions, storage/Sync/profile schema changes, CSP relaxation, telemetry, remote code or security-boundary reductions are introduced.

1.27.4 is a package-efficiency and favicon-picker lifecycle/performance release. The reviewed source remains fully readable, while the deterministic build now emits a rules-only Public Suffix List runtime artifact and compact generated locale modules that preserve all 32 catalogs exactly while removing repeated runtime key/comment bulk. A package-size baseline/report makes category growth visible and fails tests on unexpected >15% growth until the baseline is consciously updated. The manual favicon chooser now clears/invalidate candidates when the editor closes, uses at most two concurrent candidate image jobs, keeps a tiny bounded 30-second in-memory result cache for immediate repeats, and exposes localized source/dimension metadata to assistive technology/tooltips. Site-declared inline favicon support, all image/SVG bounds, and the automatic favicon resolver remain unchanged. Obsolete shortcut-editor CSS was removed. No permissions, schemas, CSP relaxation, telemetry or remote code changed.

1.27.3 adds a manual **Choose detected favicon** picker without changing MosaicSync's automatic favicon resolver. The picker exposes up to eight safely validated favicon/site-icon alternatives so users can choose the exact look they prefer; an explicit choice is treated as user artwork and is not later replaced by automatic favicon recovery. Open folder popovers now follow page scrolling as well as resize through an rAF-throttled reposition path, ordinary same-tab Recent-mode opens avoid a wasted pre-navigation grid render while still recording usage locally, and the Recent no-drop boundary is defensively completed. All five new chooser strings are localized across the existing 32 languages. No new permissions, schemas, CSP relaxation, telemetry or remote code.

1.27.2 is a focused production hardening/UI refinement release. Recent mode is now explicitly presentation-only at the top-level grid: visual-slot drops are blocked so Frequently Visited or folder-child drags cannot mutate synchronized Manual positions, while normal Add shortcut still chooses the next canonical free Manual position. The shortcut editor is vertically tightened on normal desktop-height viewports to avoid its internal scrollbar while retaining overflow safety on genuinely short screens. Render-manifest icon/color metadata now receives the same allow-list projection hardening as session snapshots, malformed `imageSourceKind: "builtin"` records without a valid built-in icon recover to `none`, and new integration/property tests cover folder positioning plus first-paint/authoritative Recent ordering parity. No new permissions, schemas, CSP relaxation, telemetry or remote code.

1.27.1 is a focused UI correction to 1.27.0. Folder popovers now position from the bottom of the **actually rendered folder-title text** rather than the label element's reserved two-line height, with a 3 px nominal visual gap. This removes the remaining empty space below one-line folder names while preserving two-line labels and the existing viewport collision/clamping behavior. No feature, permission, storage/Sync/profile schema, favicon, CSP, telemetry or remote-code behavior changes in this patch.

1.27.0 is the first feature release after the 1.26 stability/hardening series. Folders now open visually closer to their originating tile and include a compact **Open all in background** action. Shortcuts can use synchronized color accents and one of 13 bundled MosaicSync icons without consuming image-storage quota. A new optional **Recently opened** view uses device-local usage timestamps to reorder only the presentation layer; the synchronized/manual layout remains untouched and returns immediately when Manual order is selected. The state/Sync schemas advance additively to carry built-in icon and color metadata. All new UI is localized across the same 32 languages. Permissions, CSP, favicon retrieval quality, profile format, telemetry and remote-code behavior are unchanged.

## Privacy and permissions

MosaicSync is designed around browser-local storage and browser-native synchronization. Optional browser permissions are requested for features that need them, such as bookmarks, Frequently Visited sites, or direct website access for favicon discovery.

For a more precise description of what is stored, synchronized and fetched, see [PRIVACY.md](PRIVACY.md).

## License

MosaicSync is licensed under the **Mozilla Public License 2.0 (MPL-2.0)**. See [LICENSE](LICENSE).

Copyright XIP Informàtica / XIP Telecom S.L.

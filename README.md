# MosaicSync

**Your browser start page, organized your way.**

MosaicSync is an open-source start page and shortcut manager for Firefox and Chromium-based browsers. It provides Spaces, folders, flexible layouts, wallpapers, automatic favicon handling, bookmark integration, Frequently Visited suggestions, profile backup/transfer, and browser-native synchronization.

**Current source release: 1.30.15**

- Website: https://xipinformatica.cat/mosaicsync/
- Firefox Add-ons: https://addons.mozilla.org/addon/mosaicsync/
- License: [Mozilla Public License 2.0](LICENSE)
- Privacy: [PRIVACY.md](PRIVACY.md)
- Security: [SECURITY.md](SECURITY.md)
- Contributing: [CONTRIBUTING.md](CONTRIBUTING.md)
- Development notes: [README-DEVELOPMENT.md](README-DEVELOPMENT.md)
- Release history: [CHANGELOG.md](CHANGELOG.md)

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

To create deterministic Firefox and Chrome runtime ZIPs:

```bash
python tools/package.py
```

`npm test` rebuilds both browser trees before running the regression suite.

## Current release identity

The active source release is **1.30.15** across both browser manifests, Chrome `version_name`, the shared runtime `VERSION`, the Settings version label, package filenames and current release tests. `build-manifest.json` records the same technical version for both generated browser trees.

Older version numbers appearing in `CHANGELOG.md`, `docs/QA-*.md`, tests named after earlier regressions, or historical sections of `README-DEVELOPMENT.md` are intentional historical references. They are not the current runtime version.

1.30.15 is a focused **synchronized Settings correctness** release. Independent user settings now carry compact logical clocks, so a stale value on one computer cannot become newer merely because that computer changed a different Settings control. Same-setting conflicts remain deterministic, while unrelated controls such as Frequently Visited, grid geometry, theme and Light/Dark wallpaper choices can converge independently. Existing 1.30.14/older Settings migrate from their whole-record clock, snapshots/recovery preserve the fine clocks, and explicit reset / **Use this device** remains whole-profile authoritative. State schema is 19 and Sync schema is 11; there are no new permissions, telemetry, backend, remote code or UI controls.

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

# MosaicSync

**Your browser start page, organized your way.**

MosaicSync is an open-source start page and shortcut manager for Firefox and Chromium-based browsers. It provides Spaces, folders, flexible layouts, wallpapers, automatic favicon handling, bookmark integration, Frequently Visited suggestions, profile backup/transfer, and browser-native synchronization.

**Current source release: 1.27.1**

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
```

To create deterministic Firefox and Chrome runtime ZIPs:

```bash
python tools/package.py
```

`npm test` rebuilds both browser trees before running the regression suite.

## Current release identity

The active public release is **1.27.1** across both browser manifests, Chrome `version_name`, the shared runtime `VERSION`, the Settings version label, package filenames and current release tests. `build-manifest.json` records the same technical version for both generated browser trees.

Older version numbers appearing in `CHANGELOG.md`, `docs/QA-*.md`, tests named after earlier regressions, or historical sections of `README-DEVELOPMENT.md` are intentional historical references. They are not the current runtime version.

1.27.1 is a focused UI correction to 1.27.0. Folder popovers now position from the bottom of the **actually rendered folder-title text** rather than the label element's reserved two-line height, with a 3 px nominal visual gap. This removes the remaining empty space below one-line folder names while preserving two-line labels and the existing viewport collision/clamping behavior. No feature, permission, storage/Sync/profile schema, favicon, CSP, telemetry or remote-code behavior changes in this patch.

1.27.0 is the first feature release after the 1.26 stability/hardening series. Folders now open visually closer to their originating tile and include a compact **Open all in background** action. Shortcuts can use synchronized color accents and one of 13 bundled MosaicSync icons without consuming image-storage quota. A new optional **Recently opened** view uses device-local usage timestamps to reorder only the presentation layer; the synchronized/manual layout remains untouched and returns immediately when Manual order is selected. The state/Sync schemas advance additively to carry built-in icon and color metadata. All new UI is localized across the same 32 languages. Permissions, CSP, favicon retrieval quality, profile format, telemetry and remote-code behavior are unchanged.

## Privacy and permissions

MosaicSync is designed around browser-local storage and browser-native synchronization. Optional browser permissions are requested for features that need them, such as bookmarks, Frequently Visited sites, or direct website access for favicon discovery.

For a more precise description of what is stored, synchronized and fetched, see [PRIVACY.md](PRIVACY.md).

## License

MosaicSync is licensed under the **Mozilla Public License 2.0 (MPL-2.0)**. See [LICENSE](LICENSE).

Copyright XIP Informàtica / XIP Telecom S.L.

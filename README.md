# MosaicSync

**Your browser start page, organized your way.**

MosaicSync is an open-source New Tab/start-page extension for Firefox and Chromium-based desktop browsers. It keeps shortcuts, folders and Spaces easy to reach while using browser-native synchronization instead of a MosaicSync account or analytics backend.

**Current source release: 1.33.0.29**

- Website: https://xipinformatica.cat/mosaicsync/
- Firefox Add-ons: https://addons.mozilla.org/addon/mosaicsync/
- Chrome Web Store: https://chromewebstore.google.com/detail/mosaicsync/adoedheeaigmimommakojmmlahcckjkh
- License: [Mozilla Public License 2.0](LICENSE)
- Privacy: [PRIVACY.md](PRIVACY.md)
- Security: [SECURITY.md](SECURITY.md)
- Contributing: [CONTRIBUTING.md](CONTRIBUTING.md)
- **New developer? Start here: [DEVELOPER-GUIDE.md](DEVELOPER-GUIDE.md)**
- Development history: [README-DEVELOPMENT.md](README-DEVELOPMENT.md)
- Release history: [CHANGELOG.md](CHANGELOG.md)

## What MosaicSync does

- Organizes shortcuts into a configurable grid, folders and Personal/Work Spaces.
- Synchronizes the intended profile state through the browser's native Sync storage.
- Keeps bounded Recovery safety copies around normal Sync and provides profile backup/transfer.
- Supports wallpapers, themes, built-in icons, custom shortcut artwork and device-local favicon discovery.
- Includes a browser Bookmarks reader; bookmarks remain browser-owned unless you explicitly drag one onto MosaicSync to create a shortcut.
- Provides optional Frequently Visited suggestions without turning browser history/Top Sites into synchronized shortcuts.
- Supports optional device-local Custom Branding.
- Contains no MosaicSync telemetry or analytics service.

## Privacy model

MosaicSync is privacy-first by design. User-supplied eligible profile data can synchronize according to the extension's normal Sync policy, while learned/native/site favicon pixels, browser history/Top Sites data and Custom Branding stay device-local unless an explicit profile export/import rule says otherwise.

MosaicSync does not run its own synchronization backend. See [PRIVACY.md](PRIVACY.md) for the precise data-flow rules.

## Browser support

MosaicSync is designed for desktop Firefox and Chromium-based browsers. The source tree contains one shared implementation plus small browser-specific overlays so both packages are generated from the same reviewed code.

## Repository layout

```text
src/            Canonical shared/browser-specific source
dist/           Generated Firefox and Chromium runtime trees
tests/          Permanent regression, security and correctness tests
tools/          Deterministic build, audit and packaging tools
docs/           Architecture, QA, ADRs and engineering history
fixtures/       Test fixtures
bench/          Reproducible performance benchmark
```

`src/` is authoritative. `dist/` is generated so reviewers can inspect the exact packaged browser code. `build-manifest.json` records hashes for generated runtime files.

## Build and test

Requires **Node.js 22+** and Python 3 for deterministic packaging.

```bash
npm run build
npm test
npm run reachability
python tools/package.py
```

Focused regression groups are also available:

```bash
npm run test:startup
npm run test:newtab
npm run test:sync
npm run test:recovery
npm run test:security
npm run test:browser
npm run test:core
npm run test:release
```

For architecture, correctness invariants and development workflow, use [DEVELOPER-GUIDE.md](DEVELOPER-GUIDE.md). Chronological implementation detail belongs in [CHANGELOG.md](CHANGELOG.md), [README-DEVELOPMENT.md](README-DEVELOPMENT.md), ADRs and the regression catalogue rather than this README.

## License

MosaicSync is licensed under the **Mozilla Public License 2.0 (MPL-2.0)**. See [LICENSE](LICENSE).

Copyright XIP Informàtica / XIP Telecom S.L.

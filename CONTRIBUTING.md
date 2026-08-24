# Contributing to MosaicSync

Thanks for taking the time to inspect or contribute to MosaicSync.

## Development requirements

- Node.js 22+
- Python 3 for deterministic package creation
- Firefox and/or a Chromium-based browser for manual extension testing

## Build

```bash
npm run build
```

This generates `dist/firefox` and `dist/chrome` from the canonical shared source and browser overlays.

## Test

```bash
npm test
```

The test command rebuilds the browser trees and runs the permanent regression suite.

For the reproducible worst-case benchmark:

```bash
npm run bench
```

To create deterministic runtime ZIPs:

```bash
python tools/package.py
```

## Source structure

- `src/shared/` — browser-neutral application code and shared UI/assets
- `src/firefox/` — Firefox-specific overlay and manifest
- `src/chrome/` — Chromium-specific overlay and manifest
- `tests/` — regression, security/correctness and parity tests
- `tools/` — build and packaging scripts
- `docs/` — architecture, QA and historical engineering notes
- `dist/` — generated browser runtime trees

## Generated runtime artifacts

`src/` is the authoritative reviewed source. `dist/firefox` and `dist/chrome` are disposable deterministic build products and must **not** be edited directly. In particular:

- `src/shared/core/public_suffix_list.dat` is the complete reviewed upstream Public Suffix List; `dist/*/core/public_suffix_list.dat` is the generated rules-only runtime representation.
- `src/shared/core/i18n-locales/*.js` are the readable translation catalogs; `dist/*/core/i18n-locales/*.js` and `dist/*/core/i18n-runtime-catalog.js` are compact generated runtime catalogs.
- `build-manifest.json` records the SHA-256 identity of every generated runtime file.
- `package-size-baseline.json` is updated consciously for each release after reviewing intentional runtime-size changes.

Always run `npm run build` (or `npm test`, which rebuilds first) after editing authoritative source. If a generated runtime file looks wrong, fix the generator or source rather than patching `dist/`.

## Contribution rules

Please keep these project invariants in mind:

1. **Firefox and Chromium parity**  
   Shared behavior belongs in `src/shared` unless a browser API genuinely requires an overlay.

2. **No hardcoded new user-facing English**  
   New UI text must go through MosaicSync's localization system and be supplied for every supported UI locale.

3. **Preserve data compatibility**  
   Changes to persisted, synchronized or profile data require explicit migration/backward-compatibility consideration and focused tests.

4. **Security-sensitive changes need tests**  
   Storage, Sync, profile import, image/SVG handling, messaging, favicon/network and concurrency changes should include regression coverage.

5. **Keep version identity unified**  
   For a release, Firefox/Chrome manifests, Chrome `version_name`, shared `VERSION`, visible Settings version, generated build metadata and release tests must agree.

6. **Do not weaken privacy boundaries casually**  
   New remote services, analytics, telemetry or permissions require explicit review and documentation.

## Before opening a pull request

Please run:

```bash
npm test
```

If your change affects performance-sensitive code, also run:

```bash
npm run bench
```

Describe what changed, why it changed, and what was tested.

## Security issues

Do not publish exploitable vulnerability details as an ordinary issue. See [SECURITY.md](SECURITY.md).

## License

By contributing source to this repository, you agree that your contribution is made available under the repository's [Mozilla Public License 2.0](LICENSE).

# MosaicSync

**Your shortcuts. Finally in sync across Firefox.**

MosaicSync is a privacy-first Firefox start page that keeps your shortcuts, folders, Spaces and supported settings synchronized across your Firefox installations using Firefox Sync.

It replaces Firefox New Tab and the new-window/homepage experience with a clean, customizable shortcut dashboard.

## Features

- **Firefox Sync** — synchronize supported shortcut layouts through Firefox's own `storage.sync` transport.
- **Multiple Spaces** — keep two independent, renameable shortcut layouts and switch between them instantly.
- **Cross-Space moves** — drag shortcuts between Spaces or move them from the shortcut editor.
- **Folders** — group related shortcuts without cluttering the start page.
- **Custom appearance** — wallpapers, custom backgrounds, shortcut sizing, grid controls and light/dark/system appearance.
- **Firefox bookmarks** — optional, read-only bookmark browsing.
- **Firefox shortcut import** — optionally import existing Firefox shortcuts.
- **Automatic site icons** — optional website access can reconstruct shortcut favicons locally.
- **New tabs + new windows** — MosaicSync can provide the start page for both.
- **21 interface languages**.

## Privacy

MosaicSync is designed to work without a MosaicSync account or developer-operated sync service.

- No telemetry or analytics.
- No advertising or tracking SDKs.
- No MosaicSync-operated backend.
- No remote executable code.
- Optional permissions are requested only for the features that need them.
- Firefox Sync is used only when the user explicitly enables synchronization.

See [PRIVACY.md](PRIVACY.md) for details.

## Source and development

MosaicSync is a Firefox Manifest V3 extension written as readable, unminified ES modules. There is no compilation, bundling, transpilation or minification step for the extension runtime.

The repository includes the runtime source, automated tests, engineering audits and original artwork sources.

Run the automated test suite with:

```bash
npm test
```

Before submitting a release to Mozilla Add-ons, also run Mozilla's extension linter from the extension root:

```bash
npx web-ext lint
```

## Current release

**MosaicSync 1.23.1**

This release includes Multiple Spaces, cross-Space shortcut movement, new-window integration, synchronization hardening and recovery for interrupted cross-Space Sync operations, extensive localization improvements, and the Aether Flow wallpaper.

See [CHANGELOG.md](CHANGELOG.md) for release history.

## Security

Please see [SECURITY.md](SECURITY.md) for security information and reporting guidance.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MosaicSync is released under the **Mozilla Public License 2.0 (MPL-2.0)**. See [LICENSE](LICENSE).

## Website

https://xipinformatica.cat/mosaicsync/

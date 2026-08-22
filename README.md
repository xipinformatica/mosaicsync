# MosaicSync

**Your browser start page, organized your way.**

MosaicSync is a privacy-first start page and shortcut manager with Spaces, folders, customizable layouts, wallpapers, automatic favicon handling, profile backup/transfer, and browser-native synchronization.

The project currently targets **Firefox and Chromium-based browsers** with browser-specific sync integration while keeping the profile/data format as browser-neutral as possible.

## Repository status

> **Source restoration in progress.**
>
> This GitHub repository was found to be incomplete on 22 August 2026. The `main` branch did not contain the extension source tree. A preserved `source-bootstrap` branch contains a staged recovery payload for the older MosaicSync 1.23.1 source, but it is **not** being promoted as the current source because development has moved beyond that version.

Until the current Firefox and Chrome source packages are imported and verified, **do not treat `main` as a complete source distribution**.

## Current development line

The current development line is **MosaicSync 1.24.x**, with Firefox and Chrome builds maintained together.

## Core principles

- Privacy first: no MosaicSync-operated tracking or analytics backend.
- Browser-native synchronization where supported.
- Readable extension source; no remote executable code.
- Browser-neutral profile export/import for transfers between supported MosaicSync installations.
- New user-facing text goes through MosaicSync's localization system.
- Firefox and Chrome builds should keep feature parity unless a browser API requires a deliberate difference.

## License

MosaicSync is released under the **Mozilla Public License 2.0 (MPL-2.0)**. See [LICENSE](LICENSE).

## Website

https://xipinformatica.cat/mosaicsync/

## Recovery tracking

The repository recovery audit is recorded in GitHub issue #1. Once the current source tree is restored, this README will be replaced with the normal installation, development, testing, security and release documentation.

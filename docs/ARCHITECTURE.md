# MosaicSync architecture (1.24.9)

MosaicSync is built from one canonical source tree. `src/shared` contains browser-neutral runtime code; `src/firefox` and `src/chrome` are deliberately small overlays for APIs, manifests, browser branding, and the few CSS/HTML differences that cannot be shared safely.

## Main runtime layers

- **New Tab UI** — rendering, Spaces, dialogs, drag/drop, Frequently Visited, settings.
- **Core model/storage** — canonical state, migrations, content-addressed local assets, profile backup format.
- **Background worker** — Sync reconciliation, favicon discovery/recovery, alarms and event-driven maintenance.
- **Browser overlay** — Firefox/Chrome API differences only.

Heavy image bytes are local content-addressed assets and are not part of the small synchronized layout core. `.mosaicsync` format v2 includes the compact profile plus its deduplicated assets and remains browser-neutral.

## Development safety rules

1. User-facing strings go through the 21-language localization catalog.
2. Runtime data-format changes require migration + backward-compatibility tests.
3. Firefox and Chrome are built together from this tree.
4. Favicon, Sync and storage changes require focused regression tests before packaging.
5. Development timing marks are local-only and disabled by default; MosaicSync contains no telemetry.

# QA — MosaicSync 1.24.14m3

## Scope

Link-only maintenance release on top of 1.24.14m2.

- Privacy links: `https://xipinformatica.cat/mosaicsync/#privacy`
- MPL 2.0 links: `https://xipinformatica.cat/mosaicsync/#license`
- Surfaces: shared Welcome, Firefox New Tab/Settings footer, Chrome New Tab/Settings footer.
- Technical browser version: `1.24.14.15`.
- Chrome display version: `1.24.14m3`.

No permissions, CSP, state schema, Sync schema, profile format, storage architecture, favicon architecture, localization catalog, or UI geometry changes.

## Verification

- Full automated suite: **139/139 passing**.
- Retired runtime URLs `/mosaicsync/privacy/` and `/mosaicsync/license/`: **0 occurrences** in generated Firefox/Chrome runtime trees.
- Unified `#privacy` / `#license` URLs are present in Welcome and New Tab/Settings for both browsers.
- Runtime source diff versus 1.24.14m2 is limited to legal-link updates, version metadata, and favicon-upgrade continuity metadata.
- Performance benchmark remains in the same architecture/performance envelope; no hot-path code changed.

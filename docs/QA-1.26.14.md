# MosaicSync 1.26.14 QA contract

1. Version identity: Firefox manifest, Chrome manifest/version_name, shared `VERSION`, Settings labels, build manifest and package filenames must all report `1.26.14`.
2. Treat 1.26.14 as the next public release after 1.26.12. 1.26.13/1.26.13b were development candidates and were not published.
3. Frequently Visited: when enabled, the cached device-local snapshot may render in the first frame without delaying New Tab; live Top Sites refresh must remain asynchronous. Drag-to-empty-grid, whole-site Hide, and optional Website Access reminder must work in Firefox and Chrome.
4. Favicon compatibility: actual raster signatures override inaccurate HTTP MIME labels before geometry parsing. Keep unknown/oversized remote geometry fail-closed before `createImageBitmap`.
5. Inline favicon metadata: bounded `data:image/...` values declared by recognized `<link rel=icon>` metadata may be learned through the existing safe raster/SVG pipeline; never permit generic data-URL navigation/fetch handling.
6. Native visit fallback: clicking/visiting a shortcut may learn the browser-provided favicon with automatic icon learning enabled even when optional Website Access is absent. Independent remote HTML/icon discovery must remain host-permission gated.
7. Manual favicon smoke test with Website Access granted: add `https://xipinformatica.cat/mosaicsync`, `https://www.elperiodico.com/`, and `https://gencat.cat/`; each should obtain useful artwork without any hostname-specific mapping. Reopen/click as needed to verify the native fallback as a second path.
8. Manual permission smoke test: revoke Website Access, visit a shortcut whose browser tab exposes a favicon, and verify the native fallback can still learn it while remote quality discovery stays disabled.
9. Run `npm test`, `npm run bench`, `node --check` for both modified background scripts, and `python tools/package.py`. Runtime ZIPs must contain only generated extension files; GitHub-ready source must include full changelog, docs, tests, build tooling and generated `dist`, with no nested release artifacts.

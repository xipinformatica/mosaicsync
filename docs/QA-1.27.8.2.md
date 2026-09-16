> **INTERNAL CANDIDATE — not a public MosaicSync release.** Superseded by public 1.27.8.8.

# MosaicSync 1.27.8.2 QA / New Tab startup-performance checklist

## Release identity
- [x] Firefox manifest version = `1.27.8.2`.
- [x] Chrome manifest version + `version_name` = `1.27.8.2`.
- [x] Shared `VERSION`, visible Settings label, README, CHANGELOG, tests and build manifest = `1.27.8.2`.

## Artwork handoff / perceived startup
- [x] A matching 48×48 bootstrap preview remains visible while authoritative full artwork loads/decodes.
- [x] Preview reuse is gated by the current content-addressed artwork identity; changed or cleared artwork cannot reuse a stale preview.
- [x] Full artwork remains hidden until it is decodable, then replaces the preview without degrading the tile to a fallback letter in between.
- [x] Preview→full swap works even when decode completes while the tile is still inside a detached `DocumentFragment`.
- [x] Bootstrap, authoritative shortcut, folder and Frequently Visited artwork request asynchronous image decoding where applicable.

## Startup CPU reduction
- [x] `storage.local` still performs the existing local-asset validation/hash trust-boundary check.
- [x] The validated `dataUrl → assetId` result is carried forward transiently through startup normalization and write-baseline construction.
- [x] No persisted validation bypass or weakened SVG/image safety path was introduced.
- [x] Permanent 200-artwork stress benchmark records both memo and no-memo paths.
- [x] Final build-host benchmark: startup normalization ~98.5 ms without memo vs ~31.1 ms with memo; startup baseline ~104.8 ms without memo vs ~30.8 ms with memo. These are synthetic build-host measurements, not target i7-4710HQ timings.

## Wallpaper priority
- [x] First authoritative active-Space asset batch hydrates shortcut artwork but excludes the heavyweight custom wallpaper bytes.
- [x] The authoritative content-addressed wallpaper reference remains present while pixels are deferred.
- [x] Full wallpaper hydration runs after the shortcut grid has had a frame to paint.
- [x] Deferred wallpaper upgrade reads exactly the referenced wallpaper asset and does not reread shortcut pixels.
- [x] Invalid/missing wallpaper bytes preserve the existing safe preview/fallback behavior.

## Closed-folder first-frame work
- [x] Synchronous render manifest projects only the first four children of a closed folder, matching the maximum visible mosaic cells.
- [x] Preview-generation work likewise limits closed-folder first-frame artwork to those four children.
- [x] Authoritative folder state/items remain complete and unchanged.

## Scope / safety
- [x] No Sync logic, record conflict semantics, tombstones, profile recovery, cross-Space atomicity or storage rollback rules changed.
- [x] No URL/navigation-safety, import-hardening, CSP, SVG/image trust-boundary or prototype-pollution protection changed.
- [x] No image-quality reduction, new permissions, host permissions, telemetry, remote code or new user-facing/localized strings.
- [x] Firefox and Chrome New Tab source remain feature-equivalent for the performance changes.

## Final validation
- [x] Full Node test suite passes.
- [x] Performance benchmark completes successfully.
- [x] Package-size baseline regenerated from the final runtime.
- [x] Deterministic Firefox/Chrome runtime packages generated.
- [x] Complete GitHub-ready source archive generated from the final tree.
- [x] Clean source extraction rebuilds byte-identical Firefox/Chrome runtime ZIPs.

## Automated result
- Full regression suite: **430/430 passing**.
- New 1.27.8.2 startup-performance regressions: **7/7 passing** within the full suite.
- Performance benchmark completed successfully.

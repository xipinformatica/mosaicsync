# MosaicSync 1.33.0.35 QA / release-candidate checklist

1.33.0.35 is a narrow device-local artwork retention/compatibility refinement over 1.33.0.34. Production scope is limited to F-2 verified-cache pruning and F-3 native-favicon format acceptance.

## Acceptance

- A complete persisted-state hydration retains cached verified values only for asset IDs still referenced anywhere in that incoming profile.
- Partial Space/folder/background hydration never prunes the whole-profile verified cache.
- Reintroducing an asset ID that was superseded by a previously adopted complete profile crosses `storage.local` and validation again rather than being served from stale in-memory retention.
- Cache pruning does not alter durable local-asset storage, the persisted asset index, GC retry state, content IDs or write-path collision/corruption handling.
- Browser-native/favicon-cache fallback accepts the same raster data-URL formats recognized by `parseImageDataUrl()`.
- Unsupported SVG/native image formats cause no shortcut mutation and no local-cache save.
- Supported raster native favicons retain the existing `imageSourceKind="firefox"`, device-local persistence, visible-artwork patch and quality-upgrade request.
- No Sync/Recovery, permission, CSP, profile-schema, browser-floor, telemetry or network changes.
- `DEVELOPER-GUIDE.md` records only evergreen cache/artwork ownership rules; no release-history section is added.

## Red-before-green evidence

`tests/optimization-133035.test.mjs` was added against untouched 1.33.0.34 before production changes.

- F-2 failed because an asset ID superseded by the next complete state remained in `verifiedLocalAssetValues`; reintroducing that old ID performed zero reads instead of revalidating it.
- F-3 failed because a `data:image/svg+xml` native favicon was adopted and triggered a local-cache save.
- The supported PNG control already passed.

After the implementation all four 1.33.0.35 tests pass. Deliberately removing the prune call or restoring the old broad `data:image/` filter makes its corresponding regression fail again.

## Final mechanical evidence

- Full unique suite: 1370/1370 PASS across 195/195 test files, completed in four non-overlapping chunks (315 + 379 + 315 + 361).
- Canonical groups: Startup 285/285; New Tab 564/564; Sync 350/350; Recovery 225/225; Security 219/219; Browser/parity 286/286; Core 208/208; Release 473/473. The Release wrapper reached 465 green tests before the environment execution ceiling; its final two Snow Leopard files completed independently at 8/8.
- Test-group coverage: 195/195 files belong to at least one canonical group; 0 ungrouped.
- Reachability: 0 unreachable shared modules; 0 unused named imports; 0 unreferenced private functions.
- Syntax/data/docs: 495 JS/MJS files pass `node --check`; 93 JSON files parse; 38 relative Markdown links resolve.
- Focused storage/favicon compatibility run: 82/82 PASS before release identity changes.
- Deliberate-break checks: removing F-2 pruning makes its reintroduction test fail; restoring broad `data:image/` native-favicon acceptance makes the SVG test fail.

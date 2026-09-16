# Step 5.3 — dead-code / runtime-reachability audit

## Baseline and rule

The audit starts from the manually validated MosaicSync 1.30.18.28 source. Deletion is allowed only for high-confidence implementation leftovers. A zero text reference by itself is not sufficient evidence for exported helpers, persisted migrations, WebExtension entrypoints, classic scripts, workers, browser overlays or test/reference seams.

## High-confidence findings removed

### `workspaceAllowsAutoIcons()`

- Owner before removal: `src/shared/background/background-core.js`.
- Production callers: none.
- It only looked up a shortcut location and returned the workspace `autoSiteIcons` preference.
- The canonical live policy is `shortcutAllowsFaviconRecovery()`, immediately adjacent in the same owner. That helper includes the same workspace automatic-icon decision plus the later explicit-manual-favicon-intent exception.
- Generated Firefox and Chromium preservation tests cover an inactive Work-space recovery and explicit preference rehydration with automatic icons disabled.

### unused `settingsRecordEqual` import

- Owner before removal: `src/shared/core/concurrency.js` import list.
- Uses inside the module: none.
- The actual `settingsRecordEqual()` implementation remains in `model.js` and remains used by Sync/background/model code. Only the unused concurrency import is removed.

## Retained review surfaces

The reachability audit intentionally reports, but does not delete, exported helpers with no production importer:

- `moveShortcutBetweenSpaces`
- `collectLocalAssets`
- `flattenState`
- `makeSettingsRecord`
- `hostnameMatchesRegistrableDomain`
- `clearCanonicalHostCacheForTests`
- `getCanonicalHostCacheSizeForTests`

The first four are defensive/reference counterparts to normalized fast paths and remain exercised by tests/benchmarks. `hostnameMatchesRegistrableDomain` remains a small direct reference for the suffix-matching rule associated with registrable-domain hiding. The final two are explicitly named test hooks used to bound/reset the canonical-host cache during deterministic tests. None is a high-confidence production deletion candidate.

## Runtime graph result after retirement

`npm run reachability` reports:

- zero unreachable shared JavaScript modules;
- zero unused named imports;
- zero unreferenced private function declarations.

The runtime roots include the background entrypoint plus every script declared by New Tab and Welcome HTML. Literal static imports, bare imports, dynamic imports and `new URL(..., import.meta.url)` JavaScript worker/module edges are followed.

## Explicit non-targets

No deletion or refactor was attempted in Recovery, Sync, pending journals, first-paint/session/render-cache ownership, Frequently Visited, Settings appearance orchestration, browser adapters, permissions, CSP, persisted schemas or locale/catalog ownership.

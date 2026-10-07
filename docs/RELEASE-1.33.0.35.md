# MosaicSync 1.33.0.35 publication notes

## AMO / Chrome Web Store changelog

Keeps long-lived New Tabs lighter by dropping verified artwork that the current profile no longer references. Also prevents unsupported browser-cached image formats from causing repeated no-progress favicon work on later New Tabs.

## Mozilla Notes to Reviewer

1.33.0.35 is a narrow device-local artwork refinement over 1.33.0.34. It contains two related changes only.

First, the per-JavaScript-context `verifiedLocalAssetValues` cache introduced/used by the local-asset hydration path is now pruned when `hydratePersistedState()` adopts a complete persisted profile. Only asset IDs still referenced anywhere in that incoming profile remain cached. Partial Space, background, folder and deferred-folder hydration helpers deliberately do not prune because they operate on partial projections and therefore do not own the complete retention set. This changes only in-memory retention; it does not delete `storage.local` assets or change the existing durable asset GC/index protocol.

Second, New Tab browser-native/Firefox-history favicon hydration now filters candidate favicon data URLs through the existing shared `parseImageDataUrl()` raster acceptance boundary. Unsupported formats such as `data:image/svg+xml` are ignored before mutation/save. This prevents a no-progress loop where a native SVG fallback could be assigned, stripped again by authoritative normalization, and retried on a later New Tab. Supported PNG/JPEG/WebP/GIF/ICO data URLs retain the existing device-local fallback behavior and still request a background quality upgrade.

No Sync, Recovery, permission, CSP, profile-schema, asset-ID, durable local-asset format, telemetry, network or browser-floor changes are introduced.

Permanent behavioral protection is in `tests/optimization-133035.test.mjs`. Red-before-green against 1.33.0.34 proves (1) a superseded verified asset remained cached and skipped validation when reintroduced, and (2) an unsupported native SVG caused a local-cache save. Both are green after the refinement. Deliberately removing cache pruning or restoring broad `data:image/` acceptance makes the corresponding regression fail again.

## GitHub release title

`MosaicSync 1.33.0.35`

## GitHub release description

MosaicSync 1.33.0.35 is a focused device-local artwork refinement.

- Long-lived New Tabs now discard verified artwork cache entries once the complete incoming profile no longer references those asset IDs.
- Browser-native favicon fallback now accepts only raster formats MosaicSync can preserve, preventing unsupported formats from causing repeated no-progress work on later New Tabs.
- Supported native raster favicons keep the same device-local fallback and quality-upgrade behavior.

No new feature, permission, Sync/Recovery-format, profile-schema or privacy change is included.

## Final certification

Full unique suite: 1370/1370 PASS across 195/195 test files. Canonical groups: Startup 285/285; New Tab 564/564; Sync 350/350; Recovery 225/225; Security 219/219; Browser/parity 286/286; Core 208/208; Release 473/473 (465 completed in the group wrapper before the environment ceiling, plus the final two Snow Leopard files 8/8 independently). Reachability is 0 unreachable shared modules / 0 unused named imports / 0 unreferenced private functions. 495 JS/MJS files pass syntax checks; 93 JSON files parse; 38 relative Markdown links resolve. Deterministic packaging is verified in the sealed artifacts.

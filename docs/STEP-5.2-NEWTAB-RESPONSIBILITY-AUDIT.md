# MosaicSync Step 5.2 New Tab responsibility audit

## Goal

Review the 1.30.18.25 canonical `src/shared/newtab/newtab.js` by responsibility rather than line count and extract at most one seam whose ownership is cohesive, browser-neutral and behavior-preserving. Steps 1–4 remain frozen.

## Baseline

- Certified starting release: 1.30.18.25.
- Certified source SHA-256: `f30badbf2bf3723078a6edbaa7b1e198e2723dd4bfa3b4bcfbb63dcb07f6dd7b`.
- `newtab.js` baseline: approximately 7,502 lines / 339,826 bytes.
- Canonical ownership already shared across Firefox and Chromium since Step 3.2.

## Responsibility regions reviewed

| Region | Approximate source area | Decision | Reason |
|---|---:|---|---|
| Startup/session/first-paint adoption | 109–1068 | Keep in orchestrator | Timing-sensitive Step-1/2 boundary; coordinates session caches, deferred hydration, authoritative local reads and DOM adoption. |
| Frequently Visited | 1077–1834 | Keep in orchestrator | Mixes local preferences, permissions, Top Sites, session-only favicon preparation, DOM commit/decode ordering and context-menu effects. Recently hardened behavior; extraction would require a controller abstraction rather than isolate policy. |
| Spaces/cross-Space dragging/persistence | 2206–2599 | Keep in orchestrator | Coordinates live drag DOM, state mutation, persistence and cross-Space Sync intent. Effect ordering is the responsibility. |
| Appearance/theme/page repaint | 2600–2951 | Mostly keep; extract pure color math only | Theme resolution and page/Settings preview painting are timing-sensitive. The color clamp/RGB/HSV/hex helpers are deterministic and independent of DOM/event sequencing. |
| Grid/tile/folder interactions | 2960–4190 | Keep in orchestrator | Direct DOM creation, focus, drag/drop, navigation and folder-popover positioning. |
| Import/favicon hydration | 4684–4831 | Keep in orchestrator | Coordinates lazy modules, storage, device-local artwork and visual refresh; favicon ownership is frozen. |
| Background/wallpaper controls | 4832–4962, 5315–5852 | Keep in orchestrator | UI state, deferred paint, persistence debounce and Settings-compositor safety are tightly coupled. |
| Bookmarks | 5022–5301 | Keep in orchestrator for now | Cohesive feature but closure-heavy DOM/controller code. A module extraction would require extensive dependency injection and would not yet reduce cognitive coupling. |
| Sync status/actions | 6233–6832 | Keep in orchestrator | Presentation helpers are mixed with localized state interpretation, runtime messages, permissions, remote-image hydration and explicit authoritative actions. Recovery/Sync boundary remains frozen. |
| External state/artwork patching | 7249 onward | Keep in orchestrator | Handles live DOM patching and external storage-change convergence; ordering is behaviorally significant. |

## Extracted owner

`src/shared/newtab/appearance-color.js` owns exactly five deterministic helpers previously embedded in `newtab.js`:

- `clampUnit`
- `hexToRgb`
- `rgbToHsv`
- `hsvToHex`
- `normalizeHexColor`

The module has no browser API, DOM, storage, clock/timer, async work or mutable cross-call state. Validation remains explicit: callers supply the existing canonical `validHex` predicate rather than duplicating model policy.

## Preserved orchestration

The following remain in `newtab.js` and therefore retain their existing event/paint order:

- `updateColorPickerVisuals`
- `setColorPickerFromHex`
- `applyColorPickerLive`
- `closeBackgroundColorPicker`
- `toggleBackgroundColorPicker`
- `updateColorPlaneFromPointer`
- all theme resolution and Settings preview/page repaint code
- all persistence/debounce calls

## Equivalence proof

`tests/newtab-appearance-color-1301826.test.mjs` contains frozen 1.30.18.25 helper expressions and compares the extracted owner across valid, malformed and boundary inputs. It separately asserts purity/ownership and executes the copied module from both generated browser trees.

## Step-5.2 conclusion

The extraction is justified because it creates a real pure owner without introducing a controller/factory layer or modifying any effect order. No larger New Tab subsystem should be extracted merely to reduce line count. The next Step-5 decision should again begin with evidence and may legitimately conclude that another extraction is not warranted.

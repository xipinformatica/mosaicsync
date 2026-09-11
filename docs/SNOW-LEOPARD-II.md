# Snow Leopard II — Performance & Frugality

Snow Leopard II begins from frozen correctness baseline **1.32.1.8**. Its rule is simple: no optimization is accepted without a measured cost, a measured improvement, and a correctness argument showing that MosaicSync's Sync/Recovery/concurrency/privacy invariants remain intact.

## Journey tracker

- **Step 0 — Instrumentation and immutable baseline: DONE in 1.33.0.1.** Adds local-only performance tooling, machine-readable benchmark distributions, deterministic New Tab structural budgets, package-size capture, storage API call-site inventory, and richer real-browser startup snapshots when drivers are available. No product telemetry or persistence is added.
- **Step 1 — New Tab critical-path census: DONE in 1.33.0.2.** Freezes parser/bootstrap, static-module, eager DOM-binding and startup-phase ownership into `docs/SNOW-LEOPARD-II-CENSUS-1.33.0.2.json`. The census confirms that 534/642 initial elements and 165/200 eager ID bindings belong to secondary Settings/dialog UI, while 24 static modules / ~654 KB are evaluated before the main module body runs.
- **Step 2 — State computation and serialization: DONE in 1.33.0.3.** Exact persisted compact state now becomes the optimistic-write baseline by detached clone instead of normalize+projection, and persistence/Sync/rebase carry normalized-state proof into Settings-clock stamping rather than revalidating the same intended tree. External/persisted trust boundaries remain defensive.
- **Step 3 — DOM/CSS/lazy secondary UI: IN PROGRESS through 1.33.0.6.** Step 3A (1.33.0.4) moved Wallpaper Gallery behind first use; 1.33.0.5 hardened focused coverage/census accounting; Step 3B (1.33.0.6) moves the Bookmarks dialog shell and dedicated controller out of ordinary startup while preserving the same controller ownership and lazy browser-Bookmarks API boundary. Continue one natural UI boundary at a time; do not move the full Settings surface in one release.
- **Step 4 — Asset/image/network frugality.** Reduce unnecessary decode/allocation/preload work without first-frame regressions.
- **Step 5 — Storage/background frugality.** Remove only I/O proven redundant without weakening freshness or concurrency revalidation.
- **Step 6 — Lifetime and memory.** Stress repeated New Tab/UI cycles and fix demonstrated retention.
- **Step 7 — Runtime loading/dead work.** Remove or defer code only when reachability and runtime traces prove it does not earn startup cost.
- **Step 8 — Freeze and adversarial performance audit.** Re-run correctness, browser, memory, startup and concurrency certification and look specifically for safety shortcuts introduced by optimization.

## Step 0 immutable baseline

The canonical machine-readable snapshot is `docs/SNOW-LEOPARD-II-BASELINE-1.33.0.1.json`.

Deterministic structural measurements in 1.33.0.1:

- New Tab source HTML: **52,905 bytes**, **642 elements**, **217 ids**, **6 dialogs**.
- Primary launcher elements: **108**.
- Secondary Settings/dialog elements: **534** (~83% of initial elements).
- Settings subtree: **349 elements**; dialog subtrees: **185 elements**.
- Static New Tab ES-module closure: **24 modules / 653,457 raw source bytes**.
- Static browser-storage call sites in shared runtime: **117**.
- Firefox runtime package: **2,407,212 raw / 702,996 deflated bytes**.
- Chromium runtime package: **2,428,854 raw / 717,511 deflated bytes**.

Host-sensitive synthetic benchmark medians from the Step-0 build environment (Node v22.16.0, Linux x64, 5 logical CPUs):

- `normalizeState(200)`: **86.254 ms** (p95 88.069 ms)
- `stableStringify(200)`: **31.462 ms** (p95 34.166 ms)
- `projectStateToLocalAssets(200)`: **58.001 ms** (p95 60.010 ms)
- `createWriteBaseline(200)`: **83.468 ms** (p95 87.261 ms)
- `flattenState` trust-boundary: **81.276 ms** vs normalized fast path **0.613 ms**
- Settings record trust-boundary: **82.826 ms** vs normalized fast path **0.008 ms**
- Legacy defensive workspace-setting chain: **241.329 ms** vs trusted normalized replacement effectively below timer resolution in this benchmark.

These timings are not universal performance targets; compare timings only on comparable hardware/runtime conditions. Structural counts and package bytes are suitable for deterministic release-to-release comparison.

Real-browser startup collection is built into the lab, but this Step-0 environment lacked Firefox/GeckoDriver and Chromium/ChromeDriver pairs, so the immutable baseline records browser startup as unavailable rather than inventing numbers.

## Permanent commands

```bash
npm run perf:baseline
node tools/performance-baseline.mjs --quick --no-browser
node bench/performance.mjs --json
```

`perf:baseline` is local developer/release tooling. It performs no network submission and persists no product telemetry.

## Step 1 critical-path census

Canonical snapshot: `docs/SNOW-LEOPARD-II-CENSUS-1.33.0.2.json`. Run `npm run perf:critical-path` for the current tree.

Deterministic findings in 1.33.0.2:

- Initial DOM remains **642 elements**: **108 primary** and **534 secondary Settings/dialog** elements.
- The New Tab module eagerly binds **200 element IDs** during module setup: **35 primary** and **165 secondary** (101 Settings, 64 dialog-owned).
- The static ES-module closure is **24 modules / 653,646 raw source bytes** before `newtab.js` can execute its module body.
- Interaction/language work already deferred behind dynamic imports totals **40 modules / 1,096,737 raw source bytes** in the current build, so those bytes must not be misclassified as first-paint cost.
- HTML parsing encounters **9 parser-blocking classic bootstraps / 28,892 raw bytes** plus the critical stylesheet. Their jobs include starting storage reads early, restoring appearance/Space geometry and painting the disposable first-frame grid; they are not deletion candidates without browser timing evidence.
- Startup timing now separates `shellLocalized`, `uiBindingsReady`, `moduleSetupReady`, `sessionCacheReady` and `localStateMaterialized` in addition to the existing authoritative/paint milestones. This stays local in `__mosaicsyncStartupTiming`; no telemetry or extension-storage persistence is added.

Ranked follow-up from the census:

1. **Step 2 first:** state trust-boundary normalization/baseline work, because Step-0 synthetic measurements show ~80 ms-class defensive paths versus sub-millisecond normalized fast paths on the 200-item fixture.
2. **Step 3 next:** secondary Settings/dialog DOM and eager wiring, because ~83% of initial elements and ~82.5% of eager ID bindings are secondary UI.
3. Static module evaluation remains a later target; large source size alone is not evidence that a split is beneficial.
4. Storage/bootstrap work remains instrumented but protected until real-browser timing can distinguish useful overlap from actual startup blocking.

Step 1 deliberately changes measurement granularity, not launcher behavior.


Canonical Step-2 snapshot: `docs/SNOW-LEOPARD-II-STEP2-1.33.0.3.json`.

## Step 2 state-computation result

1.33.0.3 converts two measured duplicate-defensive paths into explicit trusted-state fast paths while keeping every raw/persisted boundary defensive.

- A `storage.local` state-change event is itself the authoritative compact payload that was persisted. New Tab now takes a detached `createPersistedWriteBaseline()` clone for optimistic concurrency instead of paying `normalizeState()` + local-asset projection merely to reconstruct the same baseline.
- `writeLocalStateResult()` still performs the single required defensive normalization of a live mutation before persistence. The resulting normalized intended state is then carried into Settings-clock stamping.
- Background `pushLocalMutation()` and `rebaseConcurrentState()` likewise normalize raw inputs once and use the trusted normalized stamping path; raw/public callers keep `stampSettingsMutationClocks()` as the defensive API.
- The 200-item stress fixture in this build environment measured the old defensive baseline at roughly 82–84 ms versus roughly 0.4–0.5 ms for the exact compact clone, and defensive Settings-clock stamping at roughly 80 ms versus about 1 ms when both state inputs are already normalized. Host-sensitive timings are directional evidence only; correctness tests own the trust-boundary contract.

Negative optimization control: `writeLocalStateResult()` still normalizes the live state before persistence, and the persisted/base side still crosses normalization before trusted Settings-clock stamping. Step 2 does not turn caches or caller promises into authority.


Canonical Step-3A snapshot: `docs/SNOW-LEOPARD-II-STEP3A-1.33.0.4.json`.

## Step 3A lazy-UI pilot

1.33.0.4 validates the lazy-secondary-UI pattern on the small Settings-owned Wallpaper Gallery before attempting larger surfaces.

- Initial live New Tab DOM falls from **642 → 631 elements**.
- Secondary Settings/dialog live elements fall from **534 → 523**.
- Eager ID bindings fall from **200 → 198**, with secondary bindings **165 → 163**.
- The gallery shell moves to `newtab/wallpaper-gallery-shell.js`, dynamically imported on first use; it is therefore absent from the static startup module closure.
- The new asynchronous open boundary captures the Settings ownership generation and refuses to show if Settings closed or reopened while styles/module construction were pending.
- Close-button and backdrop wiring is installed at mount time because startup's `[data-close-dialog]` scan intentionally cannot see lazily-created controls.

This is a pilot, not Step-3 completion. The next slice should use the same measured-before/measured-after discipline and preserve first-use UX.

### 1.33.0.5 process hardening

No production Step-3B change is introduced. Canonical Step-3A remains the dynamic Wallpaper Gallery module from 1.33.0.4. Focused Startup/New Tab groups now include `optimization-13304.test.mjs`, and structural census parsing masks raw `<script>`/`<style>` contents before tag counting so raw-text strings cannot inflate live-DOM metrics.


Canonical Step-3B snapshot: `docs/SNOW-LEOPARD-II-STEP3B-1.33.0.6.json`.

## Step 3B lazy Bookmarks UI

1.33.0.6 applies the Step-3A pattern to the next low-risk interaction-only surface: Bookmarks.

- Initial live DOM falls from **631 → 598 elements**; secondary live elements fall **523 → 490**.
- Eager ID bindings fall **198 → 186**; secondary eager bindings fall **163 → 151**.
- The static New Tab module closure falls **24 → 23 modules / 655,718 → 640,462 raw bytes**.
- Startup HTML falls **52,027 → 49,564 bytes**. Combined startup HTML + static-module source falls by **17,719 raw bytes**.
- `bookmarks-controller.js` and the new safe `bookmarks-shell.js` are dynamically loaded on first Bookmarks use; `core/bookmarks.js` remains lazy as before.
- The persistent Bookmarks launcher button installs only the first-use loader. Once loaded, the historical dedicated Bookmarks controller resumes ownership of its button, permission control, search, close/reset lifecycle and folder-color menu.
- The dialog shell is constructed only with DOM APIs (`createElement`/`createElementNS`/`textContent`/attributes). Executable HTML sinks remain prohibited.
- Package payload grows modestly because the deferred programmatic shell still ships: roughly **+5.6 KB raw / +1.7 KB deflated** per browser versus 1.33.0.5. Step 3 optimizes startup work, not archive size.

No wall-clock startup claim is made until compatible real-browser driver pairs are available.

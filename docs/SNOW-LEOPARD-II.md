# Snow Leopard II — Performance & Frugality

Snow Leopard II begins from frozen correctness baseline **1.32.1.8**. Its rule is simple: no optimization is accepted without a measured cost, a measured improvement, and a correctness argument showing that MosaicSync's Sync/Recovery/concurrency/privacy invariants remain intact.

## Journey tracker

- **Step 0 — Instrumentation and immutable baseline: DONE in 1.33.0.1.** Adds local-only performance tooling, machine-readable benchmark distributions, deterministic New Tab structural budgets, package-size capture, storage API call-site inventory, and richer real-browser startup snapshots when drivers are available. No product telemetry or persistence is added.
- **Step 1 — New Tab critical-path census: DONE in 1.33.0.2.** Freezes parser/bootstrap, static-module, eager DOM-binding and startup-phase ownership into `docs/SNOW-LEOPARD-II-CENSUS-1.33.0.2.json`. The census confirms that 534/642 initial elements and 165/200 eager ID bindings belong to secondary Settings/dialog UI, while 24 static modules / ~654 KB are evaluated before the main module body runs.
- **Step 2 — State computation and serialization: DONE in 1.33.0.3.** Exact persisted compact state now becomes the optimistic-write baseline by detached clone instead of normalize+projection, and persistence/Sync/rebase carry normalized-state proof into Settings-clock stamping rather than revalidating the same intended tree. External/persisted trust boundaries remain defensive.
- **Step 3 — DOM/CSS/lazy secondary UI: DONE in 1.33.0.6.** Step 3A (1.33.0.4) moved Wallpaper Gallery behind first use; 1.33.0.5 hardened focused coverage/census accounting; Step 3B (1.33.0.6) moved the Bookmarks dialog shell and dedicated controller out of ordinary startup. The remaining untouched surfaces are either too small to justify another ownership boundary or materially more lifecycle-sensitive, so Step 3 stops rather than forcing risk for diminishing returns.
- **Step 4 — Asset/image/network frugality: DONE in 1.33.0.9.** Step 4A removes unconditional inactive-Space background warming from ordinary New Tab/post-mutation maintenance. Step 4B narrows destination-Space intent/switch warming to the single currently effective background. Step 4C keeps the historical delayed Top Sites permission recheck but skips a duplicate full Frequently Visited render/favicon-preparation pass after a healthy verified startup. Failed/unverified starts and permission loss still use the full recovery path.
- **Step 5 — Storage/background frugality: DONE in 1.33.0.12.** Step 5A froze storage/wake measurements; Step 5B removed the routine pre-GC metadata reread; Step 5C reuses queue-owned Sync continuity within the same serialized reconciliation turn. Routine alarms are now 5 local reads / 2 full Sync reads, GC-due alarms 7 / 3, and established Sync-on startup 11 / 2. The remaining reads cross authority, journal, semantic-state, diagnostics or Sync freshness boundaries, so Step 5 closes rather than forcing risk.
- **Step 6 — Lifetime and memory: IN PROGRESS in 1.33.0.14.** Step 6A releases the Wallpaper Gallery choice payload on close; Step 6B releases generated Recovery-manager device/generation controls and suppresses late hidden renders after close while preserving background cleanup authority. Deterministic repeated-cycle tests converge to shell/list-only bounds. Broader lifetime stress continues before Step 6 can close.
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


## Step 4A intent-driven inactive-Space background warming

1.33.0.7 closes Step 3 after two measured low-risk extractions and begins asset/decode frugality with a narrow background-preload change.

- 1.33.0.6 automatically called `preloadOtherSpaceBackgrounds()` from four broad lifecycle paths: ordinary post-paint maintenance, enabling Spaces, successful Space switching and profile import. Those calls could allocate/decode the inactive Space background even if the user never switched Spaces.
- 1.33.0.7 removes that broad helper. `preloadSpaceBackgroundOnIntent(spaceId)` targets only one valid inactive destination Space.
- Pointer hover, pointer down, keyboard focus, cross-Space drag intent and the Alt+Shift keyboard shortcut issue a best-effort destination warm hint. The bounded preload cache deduplicates overlapping hints.
- `switchActiveSpace()` still calls `hydrateSpaceForOwnedOperation(spaceId, isCurrentSwitch, true)`, so the authoritative switch path itself continues to await destination background readiness and preserves the no-white-frame ownership rule even when no earlier hint ran.
- The active Space's existing post-paint `preloadBackgroundForSettings(state.settings)` call remains as a negative control; Step 4A does not change current-background continuity or Settings preview behavior.

Canonical evidence: `docs/SNOW-LEOPARD-II-STEP4A-1.33.0.7.json`.


Canonical Step-4B snapshot: `docs/SNOW-LEOPARD-II-STEP4B-1.33.0.8.json`.

## Step 4B effective-only destination background readiness

1.33.0.8 removes another piece of speculative image work from Space switching without weakening the switch correctness owner.

- `preloadEffectiveBackgroundForSettings(settings)` warms exactly the background that `effectiveBackgroundPresetId()` / `effectiveBackgroundImageValue()` can paint under the current resolved appearance.
- Space hover/focus/drag/keyboard intent now calls that effective-only primitive instead of the broader active-Space theme warmer.
- `hydrateSpaceForOwnedOperation(..., true)` likewise waits only for the effective destination background before committing the Space. A destination workspace with Separate Light/Dark Wallpapers no longer makes the switch wait for the inactive appearance variant.
- The broader `preloadBackgroundForSettings(state.settings)` remains on the active Space after paint. It warms the current background plus only the alternate theme preset, preserving smooth later Light/Dark appearance changes as an explicit negative control.
- The bounded preload cache remains the deduplication owner; no new image cache, persistence, network path or authority is introduced.

Step 4 remained in progress after this slice.


Canonical Step-5A snapshot: `docs/SNOW-LEOPARD-II-STEP5A-1.33.0.10.json`.

## Step 5A storage/background census

1.33.0.10 begins Step 5 without changing production storage behavior. The new local-only `npm run perf:storage-background` census records both static storage ownership and representative cold MV3-worker paths.

- Shared runtime contains **117 direct extension-storage API call sites**: 24 `local.get`, 21 `local.set`, 7 `local.remove`, 30 `sync.get`, 10 `sync.getBytesInUse`, 1 `sync.set`, 1 `sync.remove`, 13 `session.get`, 9 `session.set` and 1 `session.remove`.
- There are **27 direct full `storage.sync.get(null)` sites** and one full `storage.local.get(null)` site. These are inventory counts, not deletion targets.
- The shared background core installs **10 event-listener wake surfaces**.
- In the deterministic cold-worker harness, an established Sync-off startup performs **7 local reads / 0 Sync reads**. An established Sync-on startup performs **13 local reads / 2 full Sync reads**. The periodic Sync-watch alarm performs **8 local reads / 3 full Sync reads**. Firefox and Chromium generated runtimes produce the same counts.
- The apparently adjacent full Sync reads are not yet proven redundant. Catastrophic-loss detection intentionally establishes fresh namespace evidence before normal reconciliation; pending durable journals and delivered-core repair may mutate authority between that guard and the later merge read; device-snapshot garbage collection performs a separate fresh pre-delete revalidation.

Therefore Step 5A is intentionally **measurement-only**. No production storage read has been removed. The next Step-5 slice must target one concrete call path and prove, with a red-before-green regression, that the reused/elided read observes the exact same semantic snapshot and cannot weaken loss detection, pending-journal authority, Web-Lock revalidation, crash safety or destructive cleanup freshness.


Canonical Step-5B snapshot: `docs/SNOW-LEOPARD-II-STEP5B-1.33.0.11.json`.

## Step 5B routine Sync-watch maintenance gate

1.33.0.11 makes the first production optimization in Step 5 and deliberately avoids all full Sync-namespace reads. The five-minute `SYNC_WATCH_ALARM` already reads local metadata before catastrophic-loss/reconciliation work. Device-snapshot garbage collection is scheduled at most once every 24 hours, so that alarm-entry snapshot can safely prove only the negative maintenance case.

- On routine alarms where `lastDeviceSnapshotGcAt` proves GC is not due, MosaicSync skips the second `readLocalMeta()` that existed solely before the GC helper. Deterministic cost moves **7 → 6 local reads** while full Sync reads remain **2 → 2** in Firefox and Chromium.
- When GC can be due, MosaicSync still performs the historical fresh `readLocalMeta()` immediately before `maybeGarbageCollectStaleDeviceSnapshots()`. The control remains **8 local reads / 3 full Sync reads**.
- The GC helper still performs its own fresh full Sync read and, when stale/orphan candidates exist, a second pre-delete Sync revalidation. No destructive-cleanup freshness boundary is reused or removed.
- Catastrophic-loss detection, pending-journal retry, normal reconciliation, Recovery authority, Sync wire formats and persisted schemas are unchanged.
- Permanent regression: `tests/optimization-133011.test.mjs`, proven **2/4 red on untouched 1.33.0.10 → 4/4 green** after the implementation. The test consumes the caller-built runtime and never rebuilds `dist/` inside parallel test execution.

Step 5B remains the GC maintenance-boundary correction; later Step-5 releases may reduce other local reads only if the fresh pre-GC metadata and full Sync revalidation counts remain protected.


Canonical Step-5C snapshot: `docs/SNOW-LEOPARD-II-STEP5C-1.33.0.12.json`.

## Step 5C queue-owned Sync-continuity reuse

1.33.0.12 closes Step 5 with one final storage-local optimization that does not weaken any freshness boundary. `LOCAL_SYNC_CONTINUITY_KEY` is written only by the shared background orchestrator, whose stateful operations are serialized through the module-level promise queue. A reconciliation that has already read and normalized continuity in that queue turn can therefore carry that exact snapshot into the later healthy transition instead of immediately reading the same local key again.

- Routine five-minute Sync-watch alarm: **6 → 5 local reads**, while local writes stay **2 → 2** and full Sync reads stay **2 → 2**.
- Device-snapshot-GC-due alarm: **8 → 7 local reads**, while the fresh pre-GC metadata read remains and full Sync reads stay **3 → 3**.
- Established Sync-on browser startup: **13 → 11 local reads** by carrying the continuity value returned by startup recovery deferral into the immediately following queued reconciliation; local writes remain **3 → 3** and full Sync reads **2 → 2**.
- `markSyncContinuityHealthy()` remains defensive for callers without queue-owned proof and still persists every healthy transition. No heartbeat throttling was introduced.
- Durable pending journals, reset intent, catastrophic-loss quarantine/recovery timing, Normal Sync reconciliation, Recovery generations and destructive cleanup pre-delete revalidation are unchanged.
- Permanent optimization regression was **0/4 on untouched 1.33.0.11 → 4/4** after implementation; the final Step-5C file adds a fifth single-writer ownership guard and is **5/5 green**.

After reassessment, the remaining periodic local reads are current metadata authority, catastrophic-loss continuity, durable pending-journal authority, local semantic state comparison and device-local diagnostics. The remaining full Sync reads intentionally separate catastrophic-loss detection from normal reconciliation and destructive cleanup. There is no clear Step 5D that meets Snow Leopard II's risk/reward rule, so Step 5 is **DONE** and Step 6 lifetime/memory analysis is next.


Canonical Step-4C snapshot: `docs/SNOW-LEOPARD-II-STEP4C-1.33.0.9.json`.

## Step 4C Frequently Visited delayed-reconciliation fast path

1.33.0.9 closes Step 4 with one final measured image/DOM frugality correction in the device-local Frequently Visited startup path.

- The historical ~1.4 s startup reconciliation remains. It still rechecks the installation-local Top Sites permission so browser permission rehydration after an update can self-heal the feature.
- A successful full live refresh now records only an ephemeral New-Tab-local verification bit, and only after the live cards and session projection both commit.
- When the delayed permission check confirms permission is still granted and that verified live refresh already completed, MosaicSync stops there instead of rebuilding the same cached candidate cards, waiting for the same favicon decodes and preparing the same session-only derivatives again.
- If the initial live refresh did not complete, or if permission is missing at reconciliation time, the existing full `refreshFrequentlyVisited()` path still runs. Permission `onAdded`/`onRemoved` handlers remain unchanged.
- Deterministic five-card healthy-startup accounting is **2 → 1** full FV passes, **10 → 5** candidate/image-preparation items and **2 → 1** session projections, while the two permission observations remain **2 → 2**.
- No persistent cache, new permission, network path, browser-history storage, Sync/Recovery behavior or authority boundary is introduced.

Step 4 is closed here. The remote favicon resolver and active-background continuity paths were reassessed and deliberately left unchanged because their remaining work is correctness/quality-owned or already bounded/deduplicated. The next Snow Leopard II phase is Step 5 — storage/background frugality.


Canonical Step-6A snapshot: `docs/SNOW-LEOPARD-II-STEP6A-1.33.0.13.json`.

## Step 6A closed Wallpaper Gallery payload release

1.33.0.13 begins lifetime/memory work with a demonstrated closed-UI retention case rather than a synthetic heap target. The lazy Wallpaper Gallery shell introduced in Step 3A is intentionally retained after first use, but 1.33.0.12 also retained its last generated wallpaper-choice grid after the dialog closed. Those buttons carry click listeners and thumbnail URL/style strings even though the closed gallery cannot use them.

- A deterministic 30-choice fixture retains **90 dynamic elements after close** in untouched 1.33.0.12.
- 1.33.0.13 keeps exactly one reusable lazy shell but clears the interaction-only grid on the native `close` event, reducing that retained dynamic payload to **0 elements after close**.
- A 50-cycle stress returns to the same shell-only state on every close; shells do not multiply.
- Reopen still rebuilds the gallery synchronously before `showModal()`, so first-use laziness, Settings ownership protection and visual selection state remain owned by the existing orchestrator.
- Bookmarks, shortcut detected-favicon UI, Custom Branding drafts, bounded caches and the image-worker request lifetime were audited as negative controls and already have explicit release/bounds behavior.

Step 6 remains **IN PROGRESS**. This slice does not claim browser-heap convergence because compatible real-browser driver pairs are still unavailable in the current environment.

## Step 6B Recovery-manager closed payload release

1.33.0.14 extends lifetime work to the Recovery Copies manager. Its generated device cards, generation rows and cleanup-button listeners are interaction-only and do not earn lifetime retention after the dialog closes. A pending asynchronous model or cleanup response can also finish after close, so close-time teardown alone would be insufficient if the completion could immediately rebuild the hidden list.

- `clearRecoveryCopiesView()` clears only the generated Recovery list on the native `close` event.
- `loadRecoveryCopies()` and `performRecoveryCleanup()` render returned models only while `recoveryCopiesDialog.open` remains true. Successful cleanup still completes in the background and refreshes Sync status.
- A deterministic 120-node fixture falls **120 → 0 retained dynamic nodes after close** across 50 repeated cycles. Late closed model/cleanup responses render **0** hidden models.
- Background Recovery planning, eligibility, destructive revalidation, Sync/journal authority and wire formats are unchanged.

Canonical Step-6B snapshot: `docs/SNOW-LEOPARD-II-STEP6B-1.33.0.14.json`.

Step 6 remains **IN PROGRESS**. No browser-heap convergence claim is made without compatible real-browser driver pairs.

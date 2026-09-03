# MosaicSync architecture

> **Permanent maintenance map (M3 / 1.30.18.35).** This document says *who owns what*. For the non-obvious reasons behind frozen choices, see [`docs/adr/`](adr/README.md). For historical failures and the tests that prevent recurrence, see [`docs/REGRESSION-CATALOG.md`](REGRESSION-CATALOG.md).

## Plain-English map

MosaicSync deliberately separates **the real saved profile** from **fast disposable previews**, keeps browser-derived history/artwork local, shares one core implementation between Firefox and Chromium, treats Recovery as a safety layer around normal Sync, and requires release artifacts to be rebuilt and verified from source. The detailed sections below are the engineering contract behind those rules.

This document records the boundaries that keep MosaicSync fast, private and maintainable. It is intentionally short: it describes ownership and invariants rather than every function.

## 1. Authoritative state

The authoritative local profile is the normalized MosaicSync state stored through the core storage/model layer. It owns shortcuts, folders, Spaces, user settings and their logical modification clocks.

Rules:
- Disposable caches may accelerate presentation, but they never become authoritative.
- If every cache is deleted, MosaicSync must still reconstruct the correct profile from authoritative storage.
- A later cache may be incomplete, but it must not replace a visibly truthful value with a known placeholder or stale default.

## 2. Normal Sync

Normal Sync transports the user's live MosaicSync profile between browser installations. It owns record merge/convergence, Settings merge behavior, deletions/tombstones and cross-device conflict semantics.

Rules:
- Normal Sync is the primary synchronization mechanism.
- Independent records/fields should converge without rewriting unrelated newer data.
- Recovery code must not decide normal Sync conflict outcomes.
- Browser quota pressure may degrade optional safety/artwork data before the essential layout and settings.

## 3. Recovery

Recovery is an additional safety layer around Normal Sync. It stores complete Personal + Work safety generations so MosaicSync can recover from catastrophic or incomplete synchronized state.

Rules:
- Recovery is a consumer of profile state, not a second synchronization algorithm.
- Recovery failure may reduce protection, but must not corrupt or override valid ordinary Sync state.
- At least one verified complete fallback is preserved during quota-aware rotation.
- Recovery is now in maintenance mode: add no new recovery feature unless a demonstrated defect requires it.

## 4. Artwork

Artwork covers automatic favicons, user-selected icons/images, tiny first-frame previews and device-local image caches.

Rules:
- Automatically learned site artwork is device-local unless explicitly designed otherwise.
- User-selected synchronized artwork follows the existing quota policy.
- A shortcut known to have artwork must not briefly render a fallback letter merely because a disposable preview is unavailable.
- Cached pixels are disposable; identity/ownership always comes from normalized state.

## 5. First Paint

First Paint is a semantic contract, not an independent source of truth. It defines what every startup accelerator is allowed to show before authoritative hydration completes.

The contract covers, directly or through an established visual projection:
- selected Space;
- Personal and Work display names;
- whether Spaces are enabled/visible;
- shortcut/folder positions and visible titles;
- whether shortcut artwork exists and tiny artwork previews where available;
- Frequently Visited visibility/count/sites;
- theme and page appearance hint;
- wallpaper/background appearance hint;
- visibility of first-frame surfaces.

The shared `firstPaint` projection contains the semantic fields used by startup accelerators. Step 2.2 now enforces physical ownership under concurrency: `SESSION_RENDER_STATE_KEY` owns structural Space/grid/settings/artwork-existence truth and is published inside the same cross-context persistence lock as authoritative local state; `SESSION_FREQUENTLY_VISITED_PROJECTION_KEY` separately owns device-local FV candidates. The page localStorage render manifest remains a synchronous shortcut-grid fallback, but its runtime writers may publish only while the tab still matches shared session structural truth. Appearance/wallpaper retain their separate tiny hint cache for now.

Rules:
- Fast startup must be **fast + truthful**, never fast + knowingly wrong.
- `null`/missing optional data means “this layer has no opinion”; it must preserve an already-painted truthful value until authoritative state arrives.
- For Frequently Visited specifically, authoritative synchronized OFF is explicit (`enabled: false`, empty sites). Browser-derived site candidates are device-local/session-owned and are never serialized into the persistent localStorage render manifest; that persistent layer may retain only enable/count truth with an empty site list.
- Removal of the optional Top Sites permission writes a tiny session-only suppression tombstone as well as clearing any current session site projection. That tombstone survives a missing render snapshot and unrelated background state writes until Top Sites permission is granted again; it never mutates the synchronized preference.
- Structural shared-session snapshots are published inside the same cross-context persistence lock as authoritative state writes. A late older transaction cannot publish structural startup state after a newer transaction has won.
- Frequently Visited candidates have their own session-only projection key. FV refresh and permission clearing never read-modify-write the structural session key, so presentation data is physically incapable of reverting Space/grid/artwork state.
- Background contexts cannot synchronously rewrite a New Tab page's localStorage render manifest. A page may therefore refresh that persistent manifest only after proving its structural projection still matches current shared `storage.session`; delayed preview/artwork writers obey the same gate.
- Identical session acceleration snapshots are skipped only after the writer verifies that the actual shared `storage.session` bytes still match its local fingerprint; one extension context's memory is never treated as proof of shared-cache contents.
- Active-Space persistence participates in the same cross-context lock and republishes from the persisted pointer; the caller's stale requested Space is never sufficient session authority.
- Ordinary structural profile persistence does not write the active-Space pointer. It derives structural session active-Space presentation from the dedicated pointer under the persistence lock, preserving one physical owner for device active Space.
- Startup repair is conditional and transaction-owned: after a stale read detects missing/invalid active-Space or meta authority, it re-reads current storage under the persistence lock and repairs only what is still missing/invalid.
- Generic structural session warming has no Frequently Visited write capability. FV candidates and their bounded native-favicon derivatives are owned only by the dedicated session projection path.
- FV favicon-bearing cards are prepared off-DOM and become visible only after their bounded favicon has decoded or has been replaced by a fallback, so startup continuity does not trade correctness for an intermediate missing-artwork frame.
- Classic startup scripts receive render/session key and render-manifest schema values from deterministic build-generated bootstrap configuration sourced from canonical core constants; do not duplicate schema literals in each classic script.
- Work-specific shortcut-grid safety checks do not apply to global/device-local Frequently Visited data.
- All startup cache formats are disposable and explicitly versioned.
- Cache invalidation/refresh should go through centralized first-paint refresh paths rather than independent ad-hoc writers.
- No first-paint refactor is accepted if the startup performance gate materially regresses.

## 6. UI

The UI renders normalized state and sends user intent back through established write paths.

Rules:
- UI components do not invent synchronization semantics.
- Settings drafts remain separate from authoritative incoming state until persisted.
- New user-facing text must use the locale system in every supported language.
- Visual startup tests complement state tests because a correct final state can still have a wrong intermediate frame.
- While Settings is open, lightweight canvas text/shadow presentation may follow the isolated Light/Dark preview immediately; full-page wallpaper/background/dim painting remains deferred to protect the Settings compositor surface.

## 7. Browser adapters

Firefox and Chromium should share canonical state, Sync, Recovery, Artwork, First Paint and UI logic wherever APIs permit.

Browser-specific code is limited to genuine platform differences such as manifests, background registration and browser-only APIs/permissions. Build generation and parity tests should make divergence difficult.

Long-term direction: one shared MosaicSync core plus small browser adapters, not two manually evolving implementations.

## 8. Import / export

Profile import/export crosses a trust boundary.

Rules:
- Imported data is validated and normalized before it can become authoritative.
- Hostile object keys, unsafe URLs and oversized/untrusted image data remain rejected or bounded by existing security policy.
- Import may refresh startup caches only after normalized state has been accepted.

## 9. Device-local vs synchronized data

### Synchronized
- Essential layout and Settings records.
- Explicit user data designed to follow the profile.
- User-selected artwork where the existing policy permits it.
- Bounded Recovery safety generations.

### Device-local
- Automatically learned favicon/cache pixels.
- Frequently Visited browser-derived sites and related local permission state.
- Disposable First Paint/session/localStorage accelerators.
- Local observation metadata used to safely age cleanup candidates.

The Sync-storage UI must explain this distinction without requiring the user to understand the implementation.

## 10. Maintainability policy

MosaicSync now follows a complexity budget:
- Prefer removing/replacing an existing layer before adding another permanent layer.
- Prefer behavioral tests over source-shape tests.
- Keep caches disposable and versioned.
- Periodically ship zero-feature cleanup releases.
- Freeze mature subsystems unless a proven defect or measurable simplification justifies touching them.
- Preserve all existing product features unless a product decision explicitly removes one.

The target of the staged maintainability program is to improve maintainability without sacrificing features or startup speed; simplification should ideally reduce work and improve reliability/performance.

## 1.30.18.14 Step 2.3 — persistent visual-cache boundary / Step 2 complete

- `storage.session` remains the shared structural first-paint accelerator and carries the semantic First-Paint Contract. `storage.local` remains authoritative persistent state.
- The persistent Web Storage render manifest advances to disposable schema v5 and is intentionally **presentation-only**: it can retain a readiness marker, `paintSpaceId` visual authorization hint, Space labels/visibility, Personal-grid geometry, visual item identities and bounded artwork previews.
- It contains **no shortcut URLs**, state/settings mutation clocks, Frequently Visited state/candidates, or duplicated semantic First-Paint Contract. When Work is active it retains no Work grid/layout/shortcut structure; only the tiny Space-label hint remains.
- The synchronous persistent renderer creates inert visual cards with no navigation target. Authoritative `configureShortcutSlotInteractions()` / folder interaction setup installs validated navigation and editing behavior only after current state wins.
- Persistent-cache reuse is decided by canonical visual equivalence rather than revision clocks. Titles, positions, layout, folder mosaic children and artwork identity must match; URL/clock changes do not make the visual cache authoritative. Invalid/corrupt previews fail closed and cannot override drawable session artwork.
- Switching to Work synchronously invalidates a Personal persistent grid before deferred cache refresh, preventing a same-task browser close from authorizing stale Personal paint on the next cold start.
- The classic pre-authority `http-url-safety.js` load is no longer needed by the persistent renderer because no navigation data crosses this cache boundary; the shared validator remains authoritative in model/storage/UI interaction paths.
- This completes **Step 2** of the maintainability program. Step 3 may now target Firefox/Chrome background duplication; it must not reopen the settled first-paint/cache ownership boundaries without a demonstrated defect.


## 1.30.18.13 device attribution

- A MosaicSync installation's friendly `deviceName` is local meta attached to the existing stable random `deviceId`; renaming never changes device identity.
- When Sync is enabled, the background publishes a tiny dedicated `device-name` metadata record keyed by device ID. It contains no layout, artwork, favicon or browsing-history data and does not alter the layout/Recovery schema.
- Existing synchronized datasets remain the authority for change provenance through their existing origin device ID. Settings resolves that ID to the friendly name and displays the dataset source timestamp separately from this installation's receipt time.
- Device-name-only `storage.sync` deliveries are attribution updates, not layout changes, and are excluded from the normal layout reconciliation trigger.
- Fallback device naming for upgraded installations happens after first paint and must never become a launcher dependency.


## Step 3.1 shared background ownership (1.30.18.15)

Firefox and Chromium now execute the same canonical `background/background-core.js` for MosaicSync semantics. The browser-specific `background.js` files are entrypoints only, and `background-adapter.js` exposes the small set of real platform capabilities required by the shared core.

Shared ownership includes Sync publication/reconciliation, Recovery snapshots, metadata/state transitions, persistence orchestration, device attribution, alarms, mutation queues and favicon-recovery policy. Browser adapters may acquire native favicon data or interpret browser-specific permissions/protected pages, but they do not own Sync/Recovery algorithms.

This boundary is structural: new shared background behavior belongs in the shared core. Browser overlays must not grow parallel implementations of canonical semantics. Step 2 first-paint/cache ownership remains frozen unless a demonstrated defect requires reopening it.
## Step 3.2 browser-boundary consolidation (1.30.18.17)

The remaining safe cross-browser duplication is now source-owned centrally rather than maintained as parallel Firefox/Chromium copies. The tiny background entrypoint and New Tab DOM live under `src/shared`; Chrome's required classic `browser` shim is inserted deterministically by the build into the same runtime position it occupied before. Manifest `_locales` wrappers are generated from one reviewed 33-locale registry with explicit Firefox/Chrome descriptions.

Optional Top Sites and HTTP(S) permission policy is shared in `core/permissions.js`. Only the real capability difference remains behind `permission-platform.js`: Firefox's gesture-bound data-collection consent/revoke versus Chromium's no-op Sync-permission contract. Browser manifests, favicon/background adapters, Chromium's browser shim, platform adapter and localization-brand adapter remain separate because they encode actual browser/store behavior.

The Step 3 boundary is now: shared policy and browser-neutral presentation shells by default; browser overlays only for manifest/store shape or APIs/semantics that genuinely differ. Step 2 first-paint/cache/session ownership remains frozen.


## 1.30.18.18 first-frame Frequently Visited geometry corrective

The Step-2 ownership boundary remains unchanged: browser-derived Frequently Visited candidates and favicon pixels are session/live-only and never enter the persistent render manifest. A tiny synchronous presentation bootstrap may, however, use the already-existing enabled/count compatibility hints to reserve the responsive FV card geometry before the persistent shortcut visual cache paints. This is geometry-only acceleration, not semantic state ownership.

The reservation is invisible/accessibility-hidden and contains no URLs, titles, navigation targets or favicon pixels. The normal FV renderer still prepares real cards off-DOM, waits for favicon decode/fallback settlement, then replaces and releases the reservation atomically. Disabled/empty and permission-recovery outcomes clear the reservation explicitly. This prevents the shortcut grid from moving after first paint without weakening browser-history privacy or reopening the persistent-cache contract.

## 1.30.18.19 pre-Step-4 hardening

The 1.30.18.18 geometry bootstrap established the correct ownership boundary but the post-release audit found two presentation-level gaps: accessibility hiding did not itself guarantee that reserved FV tile chrome was paint-hidden, and an authoritative sparse result could otherwise collapse rows reserved from the configured count. 1.30.18.19 closes those gaps without changing Step-2 data ownership.

While Frequently Visited is enabled, the configured count is the geometry capacity owner for startup and the settled strip. Geometry-only placeholder cells are visually hidden and non-interactive but retain the same responsive grid/card dimensions. The live renderer pads sparse or empty results only with these geometry cells; it does not persist or synchronize the actual browser-history-derived cardinality. If Top Sites permission is missing, the actionable recovery control overlays the reserved capacity rather than inserting additional normal-flow geometry. Disabled FV still occupies zero space.

Recovery production semantics are unchanged in this release. A new generated-runtime characterization proves the catastrophic-loss ordering invariant: a durable pending local Sync mutation remains quarantined while the synchronized namespace is confirmed empty and may replay only after Recovery has rebuilt and verified authoritative remote state. Existing restart/fallback/corruption/quota recovery guards remain part of the Step-4 safety net.

With 1.30.18.19 certified, Steps 1–3 are frozen. Step 4 may isolate and simplify Recovery ownership, but must preserve existing persisted schemas, chunk/root publication ordering, verified fallback generations, quarantine/restart timing, normal Sync conflict semantics and the Step-2 first-paint/session boundaries unless a demonstrated defect requires change.

## 1.30.18.20 Step 4: immutable Recovery-generation format boundary

Step 4 starts conservatively by isolating the representation/validation boundary of complete Personal+Work Recovery safety generations without moving their storage orchestration. `src/shared/background/recovery-generation-format.js` is now the sole browser-neutral owner of modern immutable and legacy fixed-root/a-b key derivation, root/chunk classification, bounded gzip encode/decode, manifest and record-set validation, legacy previous-profile fallback descriptors, generation recency descriptors and the bounded decode cache.

The module is deliberately dependency-injected with the already-existing stable hash/count/update helpers from `background-core.js`; it contains no `browser.storage`, Sync publication, quota-retirement, GC, alarm, mutation-journal or catastrophic-continuity policy. The core still performs immutable chunks-first/root-last publication, verification, fallback preservation, normal Sync merge/reconcile, quota preparation and stale-generation cleanup exactly as before.

This boundary is a stability measure for later Step-4 work: format compatibility can now be tested independently before publication/continuity ownership is moved. Modern roots still require `snapshotId === commitId`, legacy fixed roots/a-b chunks remain readable, complete Personal+Work fingerprints remain mandatory, decompression stays bounded, and every chunk/fingerprint is revalidated before the performance cache is consulted. No persisted schema/key/format change is introduced.

## 1.30.18.21 Step 4: Recovery-generation storage/publication boundary

The second Step-4 phase adds `src/shared/background/recovery-generation-store.js` beside the format module. The store owns only browser-neutral mechanics: assembling the format-owned complete Personal+Work payload into bounded immutable chunks, reading and selecting verified generations, committing chunks before the authoritative root, rolling back new chunks after a failed commit, and verifying the newly visible root. The browser Sync primitives are injected by the shared core, so generated Firefox and Chromium store implementations remain identical.

The core still chooses the authoritative records/settings/tombstones before publication and still owns every policy decision after preparation: publication trust, ordinary Sync ledger reconciliation, capacity checks, verified-fallback retention, superseded-generation retirement, stale/orphan GC timing, mutation journals and catastrophic-loss quarantine/restart behavior. The existing ordering remains `prepare capacity → write new chunks → write authoritative root → prune only while protecting the new root → verify`.

The historical 96-part ceiling now has one named `DEVICE_SNAPSHOT_MAX_CHUNKS` constant used by both publication and decoding. Its value and all wire semantics are unchanged. Step 4 has clearer representation and storage boundaries, but the Recovery state machine remains intentionally inside the core for a later separately characterized phase.

## 1.30.18.22 Step 4: validation-aware retention and cleanup

Recovery readability and retirement authority are now explicitly separate. A torn immutable root may still decode the independently stored generation named by its `previousProfile` descriptor; this is a valid emergency read, but `usedPreviousGeneration` prevents the torn carrier root from being treated as a verified new generation. Post-write verification therefore proves the newly committed root and chunks themselves before any normal pruning begins.

Both immediate retention and periodic GC derive their generation sets from fully decoded, complete Personal+Work roots. Current-schema roots that do not decode enter the existing conservative orphan observation ledger instead of competing by untrusted timestamps. Unknown/future root schemas remain untouched. Before deletion, the core obtains a fresh full Sync view and repeats completeness/staleness classification, closing the MV3 yield window in which delayed chunks can make an earlier torn view complete.

The ownership boundary introduced in 1.30.18.20–.21 remains intact: format/validation stays in `recovery-generation-format.js`, mechanical commit/read/verification stays in `recovery-generation-store.js`, and the shared core retains retention, quota, GC and continuity policy. Persisted formats and external behavior are unchanged.

## 1.30.18.23 Step 4: Recovery lifecycle boundary

Recovery lifecycle decisions now have a dedicated browser-neutral owner: `src/shared/background/recovery-generation-lifecycle.js`. It classifies independently verified complete generations, plans quota-driven fallback retirement, selects superseded generations, advances local-observation GC ledgers, and determines stale/orphan candidates. Every decision is synchronous and depends only on an explicit Sync view, decoded snapshots, persisted observation metadata, policy constants, and caller-supplied time.

The shared background core remains the only effectful orchestrator. It reads `storage.sync`, asks the lifecycle module for a plan, obtains a fresh view before destructive work, asks the module to confirm that the same proof still holds, and only then removes keys or writes local metadata. GC timing, publication trust, ordinary Sync merge/reconcile behavior, mutation journals, reset intent, and catastrophic-loss continuity remain in the core.

The three Step-4 seams therefore answer separate questions: the format module defines what a valid generation is; the store performs mechanical read/prepare/commit/verify operations; the lifecycle module decides which verified, stale, or orphan generations are eligible for retention effects. Persisted keys, schemas, payloads, chunks-first/root-last publication, previous fallback semantics, and external behavior remain unchanged.

## 1.30.18.24 Step 4: Recovery continuity boundary and implementation completion

Catastrophic-Recovery continuity now has a dedicated browser-neutral state owner: `src/shared/background/recovery-continuity.js`. It normalizes the existing continuity record and retained tombstones, computes deterministic stale/device delay components, and plans the established continuity transitions: initial quarantine, browser-startup warmup, recovery attempt with persisted restart grace, retry or terminal failure, healthy state, successful recovery timestamp, and intentional reset.

Time and external observations remain explicit inputs. The module has no browser storage, alarm, publication, verification, merge, journal, or reset side effects. `background-core.js` still double-checks a zero namespace, reads and writes the local continuity record, schedules alarms, publishes through the Recovery store, verifies authoritative remote state, replays cross-Space and local pending work in the established order, applies resets, records diagnostics/status, and performs normal Sync reconciliation.

With format, mechanical store, lifecycle/retention, and continuity transitions independently owned, the planned Step-4 implementation is complete. The `.23` state machine, persisted data, timing constants, and interruption behavior remain unchanged. A separate post-release audit is required before Step 4 is frozen and the journey proceeds to Step 5.

## 1.30.18.25 Step 5.1: complexity inventory and freeze map

Step 5 begins by measuring ownership rather than moving production code. The deterministic inventory confirms that the browser-neutral New Tab implementation is already canonical under `src/shared/newtab`; Step 3.2 completed the browser-shell consolidation, so there is no Firefox/Chromium New Tab source duplication left to merge. Firefox remains a manifest plus background capability adapter, while Chromium retains only genuine platform/store overlays and three intentional shared-path capability replacements (`platform.js`, `permission-platform.js`, `i18n-platform.js`).

The largest remaining canonical JavaScript concentrations are `newtab.js`, `background-core.js`, `model.js` and `storage.js`. They are candidates for responsibility analysis, not automatic extraction. Recovery portions of the background core are frozen at the audited 1.30.18.24 Step-4 boundary; Step-2 persistence/session/first-paint ownership and Step-3 browser capability seams remain frozen as well. Static reachability or line count is insufficient evidence for deletion because WebExtension manifests, classic bootstrap scripts, workers and MV3 listeners create runtime roots outside ordinary ESM imports.

1.30.18.25 therefore changes no production behavior beyond release identity. Later Step-5 work may proceed only through narrow, named ownership seams with positive preservation and negative regression coverage on generated Firefox and Chromium runtimes.
## 1.30.18.28 Step 5.2: corrected pure appearance-color owner

The first 1.30.18.26 attempt is withdrawn because it changed the callable contract of two helpers while leaving existing New Tab startup callers unchanged. 1.30.18.27 restored the 1.30.18.25 production implementation. The corrected 1.30.18.28 extraction starts again from that safe implementation.

`src/shared/newtab/appearance-color.js` owns only deterministic background-color conversion/normalization. Its exported signatures are deliberately identical to the historical inline helpers. The module imports the existing pure `validHex` validator itself; no DOM caller is required to inject dependencies and every existing `newtab.js` call expression remains unchanged apart from line movement caused by removing the inline definitions.

The extraction is guarded at two layers: direct expression equivalence to the frozen 1.30.18.25 helpers, and a generated Firefox/Chromium startup regression that runs the exact color-swatch initialization block which executes before Settings click wiring and before final state startup. The latter regression fails on withdrawn 1.30.18.26 and passes on the corrected owner. No larger appearance, Frequently Visited, first-paint, favicon, Sync, Recovery or browser-adapter responsibility is moved.


## 1.30.18.29 Step 5.3: reachability-proven retirement

Step 5.3 treats deletion as a proof obligation rather than a line-count goal. `tools/runtime-reachability.mjs` derives shared runtime roots from the background entrypoint and HTML script tags, follows literal static/dynamic module edges and worker-module URLs, and separately reports unused named imports and private lexical functions. Exported helpers with no production importer are review surfaces rather than automatic deletion candidates because tests, benchmarks and trust-boundary reference APIs can intentionally own them.

The audit found two high-confidence leftovers: `workspaceAllowsAutoIcons()` was an uncalled private predecessor to the broader `shortcutAllowsFaviconRecovery()` policy, and `settingsRecordEqual` was imported but unused by `core/concurrency.js`. Only those two production leftovers are retired. Historical favicon test scaffolding is updated to exercise the canonical helper instead of artificially extracting/mocking the dead predecessor. Generated Firefox and Chromium tests preserve both Work-space automatic favicon recovery and explicit manual favicon preference recovery with automatic icons disabled. No lifecycle, persistence, Sync/Recovery, first-paint, Frequently Visited, Settings or browser-capability boundary is moved.

## 1.30.18.30 Step 5.4: generated-runtime test architecture

Step 5.4 changes the confidence model rather than the production architecture. The permanent `tests/harness/newtab-runtime-smoke.mjs` environment imports the complete generated Firefox or Chromium New Tab module graph with controlled browser/DOM/storage surfaces. It seeds an onboarded profile with Frequently Visited enabled, waits for the real `loadState()` path to publish `interactionReady`, then verifies that later Settings, color-swatch, storage-change and Top Sites/Frequently Visited wiring is live. The Settings Frequently Visited toggle is driven off and back on through the generated listener, proving its dependent controls and live strip follow the persisted intent path.

A negative test mutates a temporary generated Firefox tree to recreate the 1.30.18.26 contract failure: `normalizeHexColor` suddenly requires an injected validator while the established caller still passes one argument. The full-startup harness must fail before interaction readiness, Settings wiring, storage-listener registration and Frequently Visited execution. This turns the withdrawn release from a historical anecdote into a permanent integration boundary.

Existing source-shape checks are not blanket-deleted. They remain useful when literal structure is the contract (manifest/CSP/permission fields, HTML/CSS/bootstrap ordering, release identity and generated-source ownership), and they remain secondary guardrails where behavioral tests already exercise the effect. No production module ownership, persistence, Sync/Recovery, first-paint, favicon, permission or browser-capability boundary changes in this phase.
## 1.30.18.31 Step 5.5: deterministic build/package ownership

Release packaging owns a fresh canonical build before creating artifacts. Firefox, Chromium, GitHub-ready source and the isolated Firefox-development package share one deterministic ZIP writer, while release-contract validation remains independent and derives its expected version from the canonical shared VERSION. Build manifests, package-size reporting, release-contract scanning and development/production identity separation remain distinct safety boundaries.

## 1.30.18.32 Step 5.6: final freeze

The zero-new-features/full-code-refinement program is complete. The cumulative Step-5 production changes are limited to the corrected pure appearance-color owner and two reachability-proven retirements; later Step-5 work strengthens tests and release tooling without changing extension algorithms. Startup/first-paint, state/cache ownership, browser capability boundaries, Recovery ownership, normal Sync behavior, privacy/permissions/CSP and persisted schemas are now frozen maintenance contracts. Future structural work requires a demonstrated defect or separately approved product/platform/security objective.



## 1.30.18.33 Maintenance Infrastructure M1: external real-browser guardrail

The 1.30.18.32 architecture remains frozen. M1 does not move an application responsibility. `tools/browser-smoke.mjs` sits outside the runtime graph and drives isolated real Firefox and Chromium/Chrome-for-Testing sessions through standard WebDriver interfaces. The smoke treats the browser-generated New Tab override as the system boundary: production startup must reach `interactionReady`, Settings must open, Space switching must work, the disabled Frequently Visited surface must remain internally consistent, and a seeded shortcut must navigate. Firefox uses the separate development Gecko ID so the smoke cannot share the production add-on's storage namespace.


## 1.30.18.34 Maintenance Infrastructure M2: certification boundary

Release certification is now an explicit maintenance boundary outside the extension runtime. `npm run certify` composes the canonical build/test/reachability/browser-smoke/benchmark/contract/package tools and then proves reproducibility from the packaged GitHub-ready source. It must not contain an alternate runtime builder or silently skip unavailable browser automation.

Restricted environments may use `npm run certify:mechanical`, but that result is deliberately non-authoritative for full release certification because the real-browser guardrail was not executed. Artifact mismatch, release-contract drift or clean-room reproduction failure is always fatal.

## 1.30.18.35 Maintenance Infrastructure M3: permanent knowledge boundary

The architecture map remains the ownership authority; M3 does not create another implementation specification. `docs/adr/` preserves the rationale behind a deliberately small set of non-obvious frozen decisions, while `docs/REGRESSION-CATALOG.md` maps high-value historical failure families to the tests that should catch recurrence. Documentation is a maintenance aid, not another runtime/version/schema authority.


## 1.30.18.38 post-audit corrective boundary

External review after M6 found one shared-New-Tab call bypassing the already-established browser adapter. The correction does not add an owner: `hydrateDeviceFavicons()` now uses the existing `getNativeTopSites()` capability, preserving the architectural rule that Firefox/Chromium API-shape differences belong in platform adapters. Maintenance-tool Chrome-target and filesystem-path fixes remain outside the runtime graph.

## Post-freeze maintenance references

- `docs/COMPATIBILITY.md`
- `docs/MAINTENANCE-POLICY.md`

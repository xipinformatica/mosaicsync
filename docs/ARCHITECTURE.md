# MosaicSync architecture

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

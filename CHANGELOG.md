## 1.30.18.37

- Completes Maintenance Infrastructure M6 with the final browser/API compatibility, dependency, permission/privacy/CSP and maintenance-system audit; the frozen application runtime is unchanged apart from release identity.
- Records the externally reviewed Firefox 140 and Chromium 104 support floors in `docs/COMPATIBILITY.md`, including why those floors map to MosaicSync's actual manifest/API requirements.
- Records the permanent post-freeze change policy in `docs/MAINTENANCE-POLICY.md`: production architecture changes require a concrete bug, platform/API, security/privacy, measurable-maintenance or separately approved product reason.
- Adds pre-M6 and final post-M6 forensic audit records and integrity tests for compatibility floors, least-privilege permissions, dependency-free maintenance tooling and the explicit no-M7 freeze state.
- Confirms M1–M6 add maintenance guardrails without changing the 1.30.18.32 frozen application architecture; there is no planned Maintenance Infrastructure M7 or 1.30.18.38 release.
- No product feature, UI behavior, permission, CSP, schema, persisted payload, locale, first-paint/cache, Frequently Visited, favicon, Sync, Recovery, storage or browser-adapter behavior change.

## 1.30.18.36

- Combines Maintenance Infrastructure M4 and M5 while keeping the frozen MosaicSync application runtime unchanged apart from release identity.
- Adds dependency-free, cross-platform targeted test commands for startup, New Tab, Sync, Recovery, security, generated-browser parity, core state and release tooling; `npm test` remains the authoritative complete suite.
- Requires every permanent test file to belong to at least one deterministic targeted group, preventing the convenience taxonomy from silently leaving new regressions undiscoverable.
- Adds bounded seeded property/fuzz coverage for state normalization/prototype-pollution resistance, malformed and checksum-valid mutated profile imports, Recovery continuity/tombstone normalization, and HTTP(S)-only navigation validation.
- Fuzz failures identify their exact seed and case number, making generated failures reproducible; no external fuzzing dependency, production test hook or unbounded random campaign is introduced.
- No product feature, UI behavior, permission, CSP, schema, persisted payload, locale, first-paint/cache, Frequently Visited, favicon, Sync, Recovery, storage or browser-adapter behavior change.

## 1.30.18.35

- Completes Maintenance Infrastructure M3 with permanent architectural knowledge preservation around the frozen 1.30.18.32 runtime.
- Keeps the existing `docs/ARCHITECTURE.md` as the single ownership map and adds a plain-English navigation layer instead of creating a competing architecture specification.
- Adds nine concise accepted/frozen Architecture Decision Records under `docs/adr/` for non-obvious boundaries: authoritative state vs disposable startup caches, device-local browser-derived data, shared core/browser adapters, Recovery vs Normal Sync, catastrophic-loss confirmation/restart grace, intentional reset authority, Settings appearance isolation, deterministic fail-closed release certification, and the post-.32 refactor freeze policy.
- Adds `docs/REGRESSION-CATALOG.md`, mapping ten high-value historical regression families—including the withdrawn 1.30.18.26 startup failure—to the permanent tests that should catch recurrence.
- Adds four M3 knowledge-integrity tests that verify architecture navigation, ADR completeness/structure, regression-test references, and that documentation does not become another technical runtime-version authority.
- No product algorithm, UI behavior, permission, CSP, schema, persisted payload, locale, first-paint/cache, Frequently Visited, favicon, Sync, Recovery, storage or browser-adapter behavior change.

## 1.30.18.34

- Completes Maintenance Infrastructure M2 with one canonical, fail-closed end-to-end release-certification command: `npm run certify`.
- The official certification path composes the existing canonical build, full regression suite, runtime reachability audit, real Firefox + Chromium smoke lane, performance benchmark, runtime size report, generated release contracts, deterministic release packaging, packaged release contracts, clean-source re-extraction/rebuild/retest/repackage, and byte-for-byte artifact verification.
- Adds an explicitly separate `npm run certify:mechanical` mode for restricted environments that cannot launch the real browsers. Mechanical mode is clearly reported as **not full certification** and cannot silently satisfy the browser-smoke gate.
- Certification writes machine-readable artifact/build-manifest SHA-256 evidence to `artifacts/certification-report.json`; any Firefox, Chromium, GitHub-ready source or build-manifest mismatch fails the run.
- Before the `.34` identity bump, the new certification tooling was added to the `.33` source and the Firefox/Chromium release packages reproduced the live `.33` hashes exactly, proving the tooling does not alter extension runtime output.
- No product algorithm, UI behavior, permission, CSP, schema, persisted payload, locale, first-paint/cache, favicon, Sync, Recovery, storage or browser-adapter behavior change.

## 1.30.18.33

- Begins the post-refinement Maintenance Infrastructure roadmap with M1 real-browser smoke automation; the frozen 1.30.18.32 product architecture remains unchanged.
- Adds dependency-free WebDriver smoke tooling for real Firefox and Chromium/Chrome-for-Testing sessions, with explicit browser/driver discovery and strict failure when the requested real browser cannot be exercised.
- The real-browser flow enters the browser's actual New Tab override, seeds an isolated onboarded profile, requires the production `interactionReady` startup boundary, opens Settings, switches Personal/Work Spaces, checks the disabled Frequently Visited surface, and proves a real shortcut click navigates.
- Firefox smoke uses the isolated `mosaicsync-dev@xipinformatica.cat` temporary development package; Chromium smoke loads the generated Chromium tree into an isolated profile. No production user profile or extension storage is reused.
- Adds five deterministic M1 tests covering CLI/capability contracts, explicit browser/driver discovery, both browser smoke workflows, and fail-closed Frequently Visited validation.
- No product feature, UI behavior, permission, CSP, schema, persisted payload, locale, first-paint/cache, Frequently Visited semantics, favicon, Sync, Recovery, storage or browser-adapter behavior change.

## 1.30.18.32

- Completes Step 5.6 with the final whole-project forensic audit and freezes the zero-new-features/full-code-refinement cycle.
- Re-validates startup/first-paint, New Tab/Settings, Spaces/folders/drag, Frequently Visited, artwork/favicons, storage/import, normal Sync, Recovery/MV3 lifecycle, browser parity/adapters, permissions/privacy/CSP, reachability and deterministic build/package behavior.
- Confirms the cumulative Step-5 production diff remains deliberately narrow: the corrected pure appearance-color owner, one proven dead favicon helper retirement, one unused import retirement, and release identities; Step-5.4 is test-only and Step-5.5 is tooling-only.
- Re-runs the complete generated Firefox/Chromium confidence stack and records no production defect or further extraction/deletion justified by evidence.
- No product feature, UI behavior, permission, CSP, schema, persisted payload, locale, first-paint/cache, Frequently Visited, favicon, Sync, Recovery, storage or browser-adapter behavior change.

## 1.30.18.31

- Completes Step 5.5 with build/package pipeline simplification only; extension runtime behavior and ownership remain frozen.
- Centralizes all public/runtime/dev ZIP creation behind one deterministic writer with one timestamp, permission, compression, path-normalization and ordering policy.
- Makes `tools/package.py` rebuild the canonical Firefox/Chromium runtime before packaging, eliminating the possibility of publishing a stale `dist/` tree after same-version source edits.
- Makes `tools/release_contract.py` derive the expected release version from the canonical shared `VERSION` declaration instead of maintaining a second hard-coded version source.
- Adds `npm run release:package` as the canonical release packaging entrypoint and removes the redundant pre-build from `npm run firefox:dev`, because the packager now owns its own required build.
- Proves the refactored tooling emits byte-identical Firefox and Chromium 1.30.18.30 ZIPs before the 1.30.18.31 identity bump, and adds behavioral regressions for canonical version derivation, deterministic ZIP metadata/order and stale-dist rejection.
- No product feature, UI behavior, permission, CSP, schema, persisted payload, locale, first-paint/cache, Frequently Visited, favicon, Sync, Recovery, storage or browser-adapter change.

## 1.30.18.30

- Completes Step 5.4 as a test-architecture hardening release with no production algorithm/refactor change.
- Adds a full generated New Tab startup/integration harness that imports the complete Firefox and Chromium `newtab.js` module graphs, waits for the authoritative `interactionReady` boundary, and verifies real generated Settings, color-swatch, storage-listener and Frequently Visited wiring.
- Exercises the actual Frequently Visited Settings toggle through disable and re-enable, including the browser Top Sites path, instead of relying only on source-shape assertions for that startup surface.
- Adds a negative mutation regression that recreates the withdrawn 1.30.18.26 injected-validator/one-argument-caller mismatch and proves the full-startup harness fails before Settings/Frequently Visited wiring.
- Keeps existing structural/source-shape tests where structure itself is the contract (release identity, manifest/CSP/permissions, HTML/CSS/bootstrap ordering) and treats source-shape checks on behavioral invariants as supplementary to existing or new runtime tests.
- No product feature, UI behavior, permission, CSP, schema, persisted payload, locale, first-paint/cache, favicon, Sync, Recovery, storage or browser-adapter behavior change.

## 1.30.18.29

- Completes Step 5.3 with proof-driven legacy/dead-code retirement on the manually validated 1.30.18.28 baseline.
- Removes the uncalled private `workspaceAllowsAutoIcons()` helper from `background-core.js`; its broader canonical successor, `shortcutAllowsFaviconRecovery()`, already owns workspace-aware automatic recovery plus explicit manual favicon preference recovery.
- Removes an unused `settingsRecordEqual` named import from `core/concurrency.js` and retires stale historical test scaffolding that still extracted or mocked the dead favicon helper.
- Adds deterministic `npm run reachability` tooling that verifies all shared runtime modules are reachable from manifest/HTML roots and reports high-confidence unused named imports/private functions separately from intentionally retained test/reference exports.
- Adds generated Firefox/Chromium preservation coverage for inactive Work-space favicon recovery and explicit favicon preference rehydration while automatic site icons are disabled.
- No product feature, UI behavior, permission, CSP, schema, persisted payload, locale, first-paint/cache, Frequently Visited, normal Sync, Recovery or browser-adapter behavior change.

## 1.30.18.28

- Safely resumes Step 5.2 from the live 1.30.18.27 rollback baseline rather than continuing from the withdrawn 1.30.18.26 source.
- Moves only the deterministic New Tab background-color conversion/normalization helpers into `src/shared/newtab/appearance-color.js` while preserving their exact historical callable contracts; `normalizeHexColor(value)` and `hexToRgb(hex)` remain one-argument functions and the new pure owner imports `validHex` itself.
- Adds a permanent generated Firefox/Chromium startup regression for the exact 1.30.18.26 failure boundary. The regression was first proven to fail 4/4 against withdrawn 1.30.18.26 and passes on the corrected implementation.
- Keeps all New Tab DOM/event orchestration, Settings live preview/persistence/repaint ordering, Frequently Visited, startup/first-paint/session caches, favicon handling, Sync, Recovery, storage, permissions, CSP, schemas, locales and browser adapters unchanged.
- No product feature or user-visible behavior change.

## 1.30.18.27

- Emergency safe rollback release published after the 1.30.18.26 New Tab startup regression was discovered in Firefox.
- Restores the complete 1.30.18.25 production implementation unchanged apart from release identity, returning MosaicSync to the certified Step-5.1 baseline.
- Contains none of the withdrawn 1.30.18.26 appearance-color extraction.

## 1.30.18.26 — withdrawn

- Withdrawn due to a New Tab startup regression in the attempted Step-5.2 appearance-color extraction.
- The extraction changed `normalizeHexColor`/`hexToRgb` from their historical self-contained callable contracts to require an injected `validHex` dependency, while some production callers retained the old call shape.
- A synchronous color-swatch initialization call could therefore throw before the remainder of `newtab.js` finished wiring Settings and later startup behavior, leaving the bootstrap-rendered page partially visible but incompletely initialized; Frequently Visited could consequently remain unavailable.
- Do not use this release as a baseline.

## 1.30.18.25

- Begins Step 5 with a reproducible whole-codebase ownership and complexity inventory, without changing runtime behavior.
- Confirms that New Tab already has one canonical shared source owner from the completed Step-3.2 browser-boundary consolidation; there are no Firefox/Chromium New Tab source copies to merge in Step 5.
- Adds deterministic `npm run inventory` tooling plus permanent ownership regressions for the shared New Tab source and the intentional browser overlay topology.
- Records the largest remaining canonical code concentrations (`newtab.js`, non-Recovery `background-core.js`, `model.js`, and `storage.js`) as responsibility-review candidates only; no source is declared dead or extracted from size/static reachability alone.
- Keeps Steps 1–3 and the audited Step-4 Recovery architecture frozen. The only runtime-source change is unified release identity from 1.30.18.24 to 1.30.18.25.
- No feature, UI behavior, permission, CSP, schema, persisted key/payload, locale, first-paint/cache ownership, favicon privacy policy, normal Sync or Recovery behavior change.

## 1.30.18.24

- Completes the planned Step-4 implementation with a browser-neutral catastrophic-Recovery continuity boundary in `src/shared/background/recovery-continuity.js`.
- Isolates continuity/tombstone normalization, deterministic stale penalty and device jitter, persisted startup warmup, quarantine entry, begin-attempt/restart-grace, retry/exhaustion, healthy/recovered, and intentional-reset transition planning.
- Keeps all effects in `background-core.js`: browser storage reads/writes, alarms, diagnostics/status, Recovery publication, post-publication verification, cross-Space and local pending-mutation replay, reset handling, and normal Sync reconciliation.
- Preserves 1.30.18.23 behavior, keys, schemas, state names, persisted formats, timing constants, attempt limits, and safety ordering through direct transition equivalence plus generated Firefox/Chromium interruption coverage.
- Adds explicit coverage for MV3 worker restart, transient zero from `getBytesInUse`, partial delivery, retry exhaustion, intentional reset, pending-journal quarantine ordering, and byte-identical generated continuity owners.
- No product feature, UI, permission, CSP, telemetry/backend, privacy boundary, Recovery/Sync/state schema, persisted payload, timing policy, or normal Sync behavior change. Step 4 is ready for its requested post-release audit before freeze.

## 1.30.18.23

- Advances Step 4 with a browser-neutral Recovery lifecycle boundary in `src/shared/background/recovery-generation-lifecycle.js`.
- Isolates verified complete-generation classification, quota-capacity and fallback-retirement planning, superseded-generation retention, and stale/orphan garbage-collection eligibility from browser effects.
- Keeps all `storage.sync` reads/removals and local metadata writes in the shared background orchestrator; destructive cleanup still re-reads Sync and revalidates candidates immediately before deletion.
- Preserves 1.30.18.22 behavior and wire compatibility, including previous-generation fallback readability, verified-only safety slots, local-observation aging, conservative orphan grace, future-schema preservation, root-last publication, and failed-replacement fallback safety.
- Adds direct lifecycle equivalence, purity, worker-restart, quota, stale-proof, and delayed-delivery interruption coverage, while migrating historical Recovery regressions to follow the new source owner.
- No product feature, UI, permission, CSP, telemetry/backend, persisted key/schema/payload, privacy boundary, normal Sync behavior, or catastrophic continuity change.

## 1.30.18.22

- Hardens immutable Recovery publication so a new complete Personal+Work generation must verify its own authoritative root and chunks before an older verified fallback can be pruned.
- Distinguishes a genuinely verified root from a torn root that remains readable only through its embedded previous-generation fallback; fallback reads remain available for recovery but cannot authorize retirement or consume a verified-retention slot.
- Makes immediate retention and periodic garbage collection count only independently verified complete generations, preventing newer malformed/torn roots from displacing the last known-good copy.
- Gives current-schema unreadable roots the existing conservative elapsed-time and repeated-observation grace, while preserving unknown/future schemas.
- Re-reads and re-decodes browser Sync immediately before destructive pruning or GC so a generation that completes during an MV3 worker turn is not deleted.
- Adds generated Firefox/Chrome regressions for interrupted publication, post-write verification ordering/failure, fallback-decoded roots, delayed chunk arrival, partial multi-batch rollback and safe reclamation.
- No product feature, UI, permission, CSP, telemetry/backend, persisted key/schema, privacy boundary or normal Sync behavior change.

## 1.30.18.21

- Advances Step 4 with a narrow Recovery-generation storage/publication boundary in `src/shared/background/recovery-generation-store.js`; the existing format module remains the sole wire-format/validation owner.
- Moves browser-neutral immutable-generation mechanics out of the shared orchestrator: complete Personal+Work payload/chunk assembly, verified-generation reads, own-generation selection, chunk-first/root-last commit with failed-chunk rollback, and post-write verification.
- Keeps every policy decision in the proven shared core: publication trust, authoritative record selection, normal Sync merging, quota-capacity preparation, fallback retention, retirement, stale/orphan GC, mutation journals and catastrophic-loss quarantine/restart behavior are unchanged.
- Replaces the duplicated `96`-chunk invariant with one named constant shared by encode and decode paths, without changing the limit, keys, schema versions or payload formats.
- Adds direct positive and negative store-boundary tests plus generated Firefox/Chrome failure-path coverage. A failed authoritative-root write still removes only the new generation's chunks and preserves the previous verified complete fallback.
- No product feature, UI, permission, CSP, telemetry/backend, first-paint/session ownership, browser-history privacy rule, automatic-favicon Sync policy or browser capability change.

## 1.30.18.20

- Begins Step 4 production refinement with a deliberately narrow ownership extraction: immutable Recovery-generation representation/validation now lives in `src/shared/background/recovery-generation-format.js` instead of being embedded inside the shared background orchestrator.
- Moves only browser-neutral wire-format concerns: legacy/immutable generation key derivation, manifest/chunk classification, bounded gzip encode/decode, complete Personal+Work metadata validation, previous-generation fallback descriptors, generation recency descriptors and the performance-only decode cache.
- Leaves high-risk orchestration in the proven shared core for this release: `storage.sync` reads/writes, chunk-first/root-last publication, quota retirement, verified fallback preservation, GC, Sync merge policy, pending mutation journals and catastrophic continuity/quarantine/restart logic are unchanged.
- Adds direct format-boundary regressions proving modern and legacy key compatibility, fail-closed torn-generation behavior even after the decode cache is warm, browser-identical generated format code, and absence of browser/storage/continuity policy from the new module. Historical Recovery source-contract tests now follow the real generated module graph rather than assuming one monolithic background file.
- No state/meta/Sync/Recovery schema, persisted key, manifest permission, CSP, browser privacy boundary, Step-1/2/3 ownership, automatic-favicon Sync policy, telemetry/backend or product/UI feature change.

## 1.30.18.19

- Finishes the audited Frequently Visited first-frame continuity contract: the geometry reservation is now genuinely paint-hidden, sparse or empty live results retain the configured responsive row capacity with invisible/non-interactive layout cells, and missing-permission recovery overlays that existing capacity instead of introducing a new flow row.
- Preserves the Step-2 privacy boundary while stabilizing layout: no browser-history-derived site, title, URL, favicon or actual live-card cardinality is added to the persistent render manifest, Sync, Recovery or profile state. Real FV cards keep detached favicon preparation and decode/fallback settlement before visible atomic commit; disabled FV still occupies zero startup space.
- Adds generated-production-runtime Recovery characterization on Firefox and Chromium proving that a durable pending local Sync mutation remains intact and cannot replay while catastrophic remote namespace loss is quarantined, then replays only after Recovery reconstructs and verifies authoritative remote state.
- Reuses and preserves the existing generated-runtime guards for Recovery worker restart grace, failed immutable-generation root commits, invalid snapshot/decompression outcomes and quota-aware verified fallback preservation instead of rewriting already-covered behavior.
- Recovery/Sync production logic and schemas, shared background core/adapters, permissions, CSP, browser privacy boundaries, automatic-favicon Sync policy and product features are unchanged. This release is the final pre-Step-4 hardening gate; Steps 1–3 are frozen after certification.

## 1.30.18.18

- Fixes a first-frame New Tab layout shift where the shortcut grid could initially paint roughly one row too high and then move down when Frequently Visited became visible.
- Adds a tiny synchronous, privacy-safe FV geometry bootstrap that reserves the configured responsive FV rows before the cached shortcut grid paints. It reads only the existing enabled/count compatibility hints; no browser-history-derived site, title, URL or favicon data is persisted or moved into the persistent first-paint manifest.
- Keeps the existing detached favicon decode/atomic FV commit: real cards replace the invisible reservation only after their artwork settles, so the fix does not reintroduce the former missing-favicon intermediate frame.
- Preserves disabled-FV zero-space startup, permission-recovery behavior, critical-CSS budget, Sync/Recovery/state schemas, permissions, CSP, Step-2 ownership, automatic-favicon device-local policy and the Step-3 shared-browser architecture.
- Adds behavioral regressions for enabled 10-card geometry reservation, disabled preservation, bootstrap ordering/privacy, and reservation release before real FV visibility.

## 1.30.18.17

- Completes Step 3.2 browser-boundary consolidation without adding product features or changing browser permissions, CSP, schemas, privacy boundaries or UI behavior.
- Moves the identical tiny background entrypoint and the browser-neutral New Tab DOM to single canonical shared source owners; Chrome's existing `browser` shim is injected deterministically into its generated shell while Firefox receives no extra startup script.
- Replaces parallel Firefox/Chrome manifest `_locales` source trees with one reviewed 33-locale registry that deterministically generates the same browser-specific extension descriptions and shared action label.
- Shares Top Sites and optional HTTP(S) permission policy in one module while isolating only the genuine capability difference: Firefox data-collection consent/revoke versus Chromium's existing no-op Sync-permission contract.
- Adds Step 3.2 ownership and capability regressions, migrates historical source-contract tests to the new canonical owners, and retains the 1.30.18.16 real favicon-adapter regressions.
- Before the version bump, canonical New Tab/background-entrypoint/manifest-locale generation was verified byte-for-byte against the live 1.30.18.16 runtime; Firefox/Chromium manifests, favicon adapters and Chrome platform/i18n adapters remain intentionally browser-specific.

## 1.30.18.16

- Hardens the new shared Firefox/Chromium background boundary with production-runtime behavioral regressions; no new product feature is introduced.
- Exercises Firefox open-tab favicon recovery through the real generated Firefox background, shared core and `browser.tabs.query()` adapter, while forcing website/network fallback to remain unavailable.
- Exercises the real Firefox `tabs.onUpdated` → expected-navigation gate → favicon-learning queue → `resolveTabNativeFavicon()` chain and verifies successful learning clears the durable/session navigation marker.
- Adds a Chromium protected Chrome Web Store regression proving `_favicon` remains browser-local, protected remote favicon URLs are never fetched, remote provenance stays stripped, and the generic-placeholder sentinel is still rejected.
- Permanently asserts that automatic/browser-learned favicon artwork remains device-local and is projected out of synchronized shortcut records.
- The new regressions pass against the existing 1.30.18.15 production favicon implementation, so no favicon runtime logic, state/meta/Sync/Recovery schema, permission, CSP, Step-2 ownership, Frequently Visited persistence, UI, telemetry or backend behavior is changed.

## 1.30.18.15

- Begins **Step 3.1** by consolidating the previously duplicated Firefox and Chrome MV3 background implementations into one canonical shared background core.
- Keeps browser-owned background code intentionally thin: Firefox retains its data-collection permission/tab-favicon behavior, while Chromium retains `_favicon` and protected Chrome Web Store handling through explicit adapters.
- Preserves existing Sync, Recovery, metadata, device attribution, favicon recovery, alarms, queues and persistence semantics; this release moves ownership without redesigning those algorithms.
- Migrates historical background source-contract tests to follow the canonical shared core plus the appropriate platform adapter without weakening their behavioral assertions.
- Adds Step-3 regressions that prevent major background semantics from being redeclared in browser overlays and require generated Firefox/Chrome runtimes to use the same shared core.
- Completes the pre-publication audit hardening by replacing two refactor-fragile favicon source-order checks with behavioral permission/native-cache tests, and permanently testing adapter listener topology plus Firefox-only `data_collection` revocation behavior.
- Fixes Sync receipt attribution in Settings: when MosaicSync knows the delivering device name, the receipt card now says **Received from {device}** instead of the generic **Received from another device**; legacy/unknown devices retain a short-ID/generic fallback. The new label is localized across all 33 UI languages.
- No feature, Step-2 first-paint/cache, state/meta/Sync/Recovery schema, permission, CSP, telemetry or backend change.

## 1.30.18.14

- Completes **Step 2.3 and Step 2** of MosaicSync's staged maintainability program without adding product features.
- Advances the disposable persistent render-manifest format to v5 and reduces it from a second structural/profile projection to a **presentation-only cold-start visual cache**.
- Removes shortcut navigation URLs, state/settings mutation clocks, Frequently Visited state/candidates and the duplicated semantic First-Paint Contract from persistent Web Storage.
- Stops persisting Work shortcut/layout structure in the render cache entirely; Work retains only the tiny Space-switcher presentation hint, while the synchronous grid accelerator remains Personal-only.
- Makes persistent first-paint shortcut cards inert with no `href`. Validated navigation is installed only by authoritative New Tab interaction wiring after current session/local state has won.
- Replaces clock/URL-based boot-grid reuse with canonical visual-equivalence matching across layout, order, titles, folder mosaic identity and artwork identity; corrupt/unusable previews fail closed against drawable session artwork.
- Synchronously invalidates the Personal persistent grid when switching to Work so a same-task browser close cannot leave stale Personal paint authorized on the next cold start.
- Removes the now-unnecessary classic pre-authority URL-safety script load from the disposable render bootstrap; the shared fail-closed HTTP(S) validator remains in authoritative model/storage/UI paths.
- Migrates historical first-paint/security regressions to the stronger v5 ownership contract and adds dedicated Step-2.3 regressions while preserving all existing product behavior, state/meta/Sync/Recovery schemas, permissions, CSP, localization, telemetry policy and backend-free operation.

## 1.30.18.13

- Added optional MosaicSync device naming during the Welcome Sync choice, with a browser/OS fallback and editable name in Settings.
- Added latest synchronized-change attribution in Settings using the existing origin device ID and source timestamp, with local receipt time shown separately when relevant.
- Added a tiny per-device browser-Sync name record so friendly names resolve across computers without changing layout, Sync or Recovery schemas.
- Protected device-name intent from stale full-record metadata writers and kept the stable MosaicSync device ID unchanged across renames.
- Localized the new Welcome and Settings UI across all 33 supported languages.
- This release intentionally pauses the five-step maintainability program and contains no unrelated roadmap work, permission changes, telemetry or backend changes.

## 1.30.18.12

- Ships the post-publication forensic-audit corrections for 1.30.18.11 without beginning Step 2.3 or adding product features.
- Fixes a real Frequently Visited stale-render race: every FV render request now advances visible-commit authority, including empty/disabled states, so an older slow favicon decode cannot resurrect browser-history cards after the strip has been hidden, permission state changed, or a newer render won.
- Separates rich live FV favicons from bounded session-only first-paint derivatives. The live strip decodes the original browser candidate; derivative optimization failure can affect only the disposable warm-session copy and can no longer turn a valid live favicon into a fallback letter.
- Hardens metadata ownership across long-running Sync/status work: normal full-record background writes preserve the current onboarding decision, while the one remote-bootstrap transition that intentionally completes onboarding opts in explicitly. This closes the stale whole-record clobber path found by the .11 audit while retaining coherent Sync transitions.
- Makes manually chosen detected favicons reproduce more reliably across computers **without synchronizing favicon image bytes**. New Browser-source choices use a compact exact image-identity token instead of the coarse legacy `b` marker; the matcher can recognize the same chosen pixels when another browser discovers them through a different source class, and legacy manual `b` choices are upgraded in Sync records when the originating device still has the selected pixels.
- Keeps automatic favicons device-local and keeps the existing **Sync this image** option as the only path that stores optimized image bytes in browser Sync.
- Removes dead structural-warm FV call-site plumbing and small reconstruction leftovers, and clarifies that runtimes without `navigator.locks` do not receive the same cross-context race guarantees.
- Adds real deferred-decode, stale-meta and exact-favicon-preference behavioral regressions for Firefox and Chrome while preserving the complete historical test suite, schemas, permissions, CSP, localization, privacy boundaries and backend-free architecture.

## 1.30.18.11

- Closes the remaining **Step 2.2 persistence-ownership** findings from the 1.30.18.10 audit without broadening into Step 2.3: the shared Web Lock now has one source-level persistence ownership helper while retaining its existing lock string for rolling-version compatibility.
- Makes the device active-Space pointer single-owner. Ordinary structural profile writes no longer write `mosaicsync.active-space.v1`, and their session first-paint publication derives active Space from the dedicated persisted pointer while the transaction lock is held, so a stale structural writer cannot visually restore an older Space.
- Hardens startup repair for active-Space and local meta: a stale startup read now acquires the persistence transaction, re-reads current authority, and repairs only fields that are still missing/invalid. A newer normal writer therefore cannot be overwritten by delayed startup repair.
- Adds field-intent `updateLocalMeta()` for independent setup/UI changes. It re-reads authoritative meta under the lock and applies only intended fields while preserving device identity and unrelated concurrent fields; coherent full-record Sync/status transitions keep serialized `writeLocalMeta()` semantics.
- Removes the generic session-warm FV side door. Structural session warming/publication can no longer write the dedicated Frequently Visited projection key; browser-derived FV candidates keep one physical session-only ownership domain.
- Fixes Frequently Visited first-paint favicon continuity: oversized native favicons are reduced to bounded 48 px/session derivatives instead of being dropped, and the FV strip is assembled off-DOM and committed only after favicon decode has settled (or a fallback has replaced a failed decode), preventing a visible intermediate missing-favicon frame.
- Preserves the privacy boundary for Frequently Visited artwork: its native/browser-history favicon derivatives remain disposable `storage.session` presentation data and are not added to persistent localStorage, profile state, Sync, Recovery or export.
- Fixes Light/Dark preview text treatment while Settings is open: `data-canvas-text` updates immediately with the isolated appearance preview, while the full page wallpaper/background/dim repaint remains intentionally deferred until Settings closes.
- Adds Firefox/Chrome behavioral and source-contract regressions for active-Space single ownership, stale startup repair, independent meta patch preservation, stable Web Lock identity, structural/FV key isolation, bounded decode-before-commit FV artwork, session-only FV privacy and Settings-open canvas-text handoff. The final release suite contains 823 tests.
- Preserves existing product features, normal Sync/Recovery/state/profile schemas, permissions, CSP, localization, telemetry policy and backend-free operation.

## 1.30.18.10

- Advances **Step 2.2** by making structural session-cache ownership deterministic under cross-context concurrency: the shared structural `storage.session` projection is now published inside the same Web Lock transaction as the authoritative `storage.local` commit, so an older transaction cannot publish stale first-paint state after a newer transaction has won.
- Moves active-Space persistence onto that same ordered transaction boundary and republishes from the persisted active-Space pointer while the lock is held, preventing concurrent Space changes from leaving local authority and the next-New-Tab accelerator disagreeing.
- Physically separates browser-derived Frequently Visited candidates into a dedicated device-local session key. FV refresh and Top Sites permission clearing no longer replace `SESSION_RENDER_STATE_KEY`, eliminating their read-modify-write race with newer Space/grid/artwork startup state.
- Composes the dedicated FV projection only after validating the structural session snapshot and synchronized enable/count settings; permission suppression remains a separate session-only tombstone and can clear FV without touching structural state.
- Adds true adversarial Firefox/Chrome interleaving regressions for late structural publication, concurrent active-Space writes, FV read-before/new-structure/write-after, and permission clearing during structural publication. These tests pause operations at the previously unsafe boundaries instead of relying on sequential final-state assertions.
- Adds the dedicated FV projection key to deterministic generated bootstrap configuration and the existing batched early session read; no profile, Sync, Recovery or persistent-cache migration is needed because the key is disposable session data.
- Improves true cold-browser-start FV responsiveness without reintroducing persistent browsing-history candidates: when no warm session sites exist, live Top Sites acquisition starts immediately after authoritative startup instead of waiting the generic 250 ms maintenance delay; warm sessions retain the delayed refresh.
- Preserves the Step 2.1 persistent-manifest v4 ownership gate, no-persistent-FV privacy rule, shortcut/grid behavior, favicon/artwork architecture, appearance/wallpaper paths, normal Sync/Recovery/profile schemas, permissions, CSP, localization, telemetry policy and backend-free operation.

## 1.30.18.9

- Begins **Step 2.1** of the maintainability program by assigning shared startup-cache ownership instead of adding another protection layer: complete `storage.session` render snapshots are now published only from authoritative startup/persistence boundaries, while routine New Tab presentation refreshes no longer republish potentially stale Space/grid state.
- Makes Frequently Visited presentation explicitly field-owned: device-local site refreshes patch only `firstPaint.frequent` in the existing shared session snapshot, preserving newer Space/grid/artwork truth from other extension contexts. Browser-derived Frequently Visited site candidates are no longer stored in the persistent localStorage render manifest, eliminating their cold-restart stale-site resurrection path.
- Gates every runtime page-local render-manifest publication against the current shared session structural projection, including delayed artwork-preview generation/fallback commits, so an older open New Tab cannot overwrite a newer persistent first-frame manifest after another tab/background context has advanced state.
- Moves active-Space session publication to the persisted active-Space boundary, so the next-New-Tab accelerator follows the device preference rather than whichever older tab happened to refresh presentation last.
- Retires the obsolete render-manifest v2 compatibility bridge and advances the disposable persistent manifest to schema v4; classic startup scripts now consume a generated bootstrap configuration produced from canonical core key/schema constants instead of duplicating version/key literals.
- Replaces the Top Sites permission lifecycle source-regex check with a behavioral Firefox/Chrome background-runtime scenario that fires real mocked permission removal/addition events and proves the session suppression tombstone toggles without mutating the synchronized Show preference.
- Removes dead persistent Frequently Visited bootstrap filtering/rendering code and updates security regressions to assert the stronger ownership rule: the persistent first frame has no browser-history-derived site URL/card painter at all.
- Preserves shortcut/grid behavior, known-artwork first-paint protection, theme/appearance/wallpaper accelerators, normal Sync/Recovery/profile schemas, permissions, CSP, privacy boundaries, telemetry policy and backend-free operation.

## 1.30.18.8

- Completes Step 1.2 first-paint hardening before any Step-2 cache consolidation: Top Sites permission removal now writes a tiny device-local `storage.session` suppression tombstone as well as clearing any current Frequently Visited session projection, so invalidation survives both a missing render snapshot and later unrelated background state writes.
- Carries that suppression marker in the already-existing early session read and applies it before session/local authoritative hydration, allowing the next New Tab to clear an older synchronous Frequently Visited strip even when no full session render snapshot existed when permission was removed; granting Top Sites permission clears the tombstone without changing the synchronized Show preference.
- Hardens shared session-cache deduplication across multiple extension contexts: a tab/background context may skip an apparently identical render-state/meta write only after verifying that the actual shared `storage.session` bytes still match its local fingerprint, rather than treating context-local memory as proof of shared cache contents.
- Preserves the existing device-local Frequently Visited projection through generic background profile writes instead of transiently replacing it with `frequent: null`; an active permission-suppression tombstone always wins until the permission is restored.
- Adds explicit Firefox/Chrome regressions for permission removal with no session snapshot, suppression survival across generic background writes, cross-context session deduplication, true identical-byte no-write behavior, background-only Space renames, and background favicon learning while no New Tab context is alive.
- Documents the remaining ownership boundary honestly: MV3/background contexts cannot synchronously rewrite a New Tab page's persistent localStorage render manifest, so background-only changes refresh the newer session projection and Step 2 will decide how to reduce/consolidate that remaining persistent-manifest layer instead of adding another permanent cache.
- Preserves all existing features, 1.30.18.7 warm-grid reuse/localization/quota fixes, Work shortcut-grid safety, normal Sync/Recovery/profile schemas, permissions, CSP, privacy boundaries, telemetry policy and backend-free operation.

## 1.30.18.7

- Hardens the Step-1 first-paint foundation before any Step-2 cache consolidation: restores warm boot-grid adoption for the current render-manifest schema after an obsolete schema-2 literal silently forced a second full render on session-warm New Tabs.
- Makes Frequently Visited first-paint truth explicit when the synchronized setting is OFF, so a fresh session layer can immediately suppress an older cached strip; when the setting is ON but no fresh device-local site list exists, the contract keeps its preserve/no-op semantics rather than inventing browser-history data.
- Reacts to removal of the optional Top Sites permission in the background context by clearing only the device-local session site projection, while preserving the synchronized Show preference and normal permission-recovery UX.
- Prevents the static English Frequently Visited heading/subtitle from becoming visible before localization, preserving layout space while avoiding a first-frame language flash in non-English UIs.
- Deduplicates unchanged browser.session render-state/meta writes and keeps storage-pressure warnings primary even when recovery and/or synchronized artwork are also limited.
- Adds cross-browser regressions for current-schema boot-grid reuse, FV-disable projection, no-live-tab permission invalidation, idempotent session-cache writes, combined quota/limitation messaging, byte-conserving Sync usage classification including legacy recovery keys, and first-frame localization.
- Preserves all existing features, Work shortcut-grid safety, 1.30.18.6 first-paint contract/cache formats, normal Sync/Recovery/profile schemas, permissions, CSP, privacy boundaries, telemetry policy and backend-free operation.

## 1.30.18.6

- Completes first-paint continuity for **Frequently Visited in Work**: the validated cached cards can paint from frame one while the stricter Work shortcut-grid authorization gate remains unchanged, so Work no longer visibly transitions from an empty Frequently Visited area to populated cards after startup hydration.
- Introduces one explicit first-paint contract shared by the synchronous render manifest and the browser.session acceleration snapshot for active Space state, Multiple Spaces enablement, personalized Space labels and the bounded Frequently Visited snapshot. Fast startup layers no longer maintain slightly different visible truth for those fields.
- Centralizes refresh/invalidation of that first-paint representation and explicitly versions the disposable cache format, while retaining a bounded read-only 1.30.18.5 compatibility bridge so the first New Tab after upgrade does not regress Space-name or Frequently-Visited continuity.
- Improves Sync-quota communication before the browser-native ~100 KiB ceiling is reached: usage now separates **Layout & settings**, **Recovery safety copies**, **Shortcut images** and **Metadata / cleanup**; 10–25 KiB free warns that storage is getting full, below 10 KiB warns that it is almost full, and an essential quota failure clearly states that recent changes remain local until capacity is available.
- Distinguishes recovery-limited, artwork-limited and broader storage-limited Sync states instead of attributing every degraded condition to artwork. All new user-facing messages are localized across the complete locale set.
- Adds behavioral Firefox/Chrome regressions for Work first-frame Frequently Visited, one-release cache upgrade continuity, shared first-paint projection, Sync usage categorization and quota-warning thresholds, and adds `docs/ARCHITECTURE.md` as the maintained subsystem/ownership map for the staged maintainability program.
- Preserves 1.30.18.5 first-paint Space continuity, favicon first-frame behavior, recovery hardening, normal Sync semantics, recovery/state/profile schemas, permissions, CSP, privacy boundaries, telemetry policy and backend-free operation.

## 1.30.18.5

- Fixes the remaining personalized-Space first-paint flash found by real visual testing: the fast browser.session render snapshot now carries both Space names, so the second startup layer cannot briefly replace already-correct custom labels with Personal/Work before authoritative storage.local hydration.
- Advances the disposable session render-snapshot schema so older name-less acceleration entries are rejected rather than reused after upgrade; the authoritative profile and synchronized schemas are unchanged.
- Makes foreign recovery-device retirement independent of the publisher's wall clock. Age/cap decisions now use this installation's own persisted GC-observation sequence, so a freshly observed recovery from a badly clock-skewed clone cannot be mistaken for a months-old abandoned device.
- Hardens root-less recovery-fragment cleanup against local clock jumps by requiring two later GC observations as well as the existing wall-time grace before deletion; backward clock corrections restart the wall-time observation safely.
- Adds end-to-end near-quota failure coverage proving that if one verified old generation is retired to create capacity and the new root then fails, another verified complete fallback survives.
- Preserves the 1.30.18.4 favicon first-frame fix, immutable generation architecture, quota-safe rotation, post-publication verification, cloned-profile concurrency coverage, legacy `a/b` recovery, normal Sync semantics, permissions, CSP, privacy and backend-free operation.

## 1.30.18.4

- Fixes two first-paint correctness regressions: customized Space names no longer briefly expose the built-in Personal/Work labels, and shortcuts with already-known artwork no longer flash a fallback letter before their favicon appears. The fast startup architecture remains intact; the disposable first frame is made visually truthful instead of being delayed.
- Hardens immutable recovery-generation retention against clock skew: logical profile recency outranks wall-clock publication time, the just-committed generation is protected during cleanup, and protection is reported healthy only after that exact generation is still present and decodes completely.
- Adds quota-aware recovery rotation for larger profiles. If two verified fallback generations fit but temporarily staging a third would exceed Sync quota, MosaicSync can safely retire only the oldest verified copy first while retaining one complete fallback throughout the replacement attempt.
- Reclaims abandoned root-less recovery chunks left by a hard browser/service-worker interruption, but only after the local installation has observed the same incomplete group across a grace period so an in-flight publication from another device is not mistaken for garbage.
- Removes one redundant complete `storage.sync` read from recovery publication and expands the regression harness so two genuinely independent browser views can share the same copied persistent device identity.
- Preserves legacy fixed-root `a/b` recovery reads, ordinary Sync identity/conflict semantics, current state/meta/Sync/profile payload schema versions, permissions, CSP, privacy boundaries, telemetry policy and backend-free architecture.

## 1.30.18.3

- Hardens complete Personal+Work recovery snapshots for browser profiles cloned/restored from the same source: new publications use immutable commit-scoped root and chunk namespaces instead of one writable root derived only from the copied `deviceId`.
- Keeps ordinary Sync identity unchanged: the stable `deviceId` still owns normal shortcut/Settings records and dataset conflict semantics, while only the auxiliary recovery-snapshot namespace changes.
- Preserves root-last atomicity and failure isolation: chunks commit first, a failed new root removes only its own chunks, and the previous complete generation remains available.
- Retains backward-compatible reads of legacy fixed-root `a/b` recovery snapshots and bounds complete recovery generations to the historical two-generation storage footprint per logical device identity.
- Adds Firefox/Chrome clone-collision, legacy-read, failed-publication and recovery-stress regressions. No Sync/state/meta schema, permission, CSP, UI/localization, telemetry or backend change.

## 1.30.18.2

- Fixes the confusing state where **Frequently Visited** can remain enabled while this Firefox installation no longer has the optional Top Sites permission: the New Tab now shows a clear one-click **Grant permission** recovery action where the sites normally appear.
- Keeps the synchronized **Show** preference ON when only the installation-local browser permission is missing; ordinary updates with an intact permission remain silent and never re-prompt.
- Reuses the existing localized permission/status strings across all 33 UI locales and makes the existing Settings recovery state more visually prominent.
- Permission restoration is still user-gesture driven and immediately refreshes Frequently Visited; permission add/remove events and startup reconciliation continue to self-heal without an OFF → ON toggle dance.
- Preserves 1.30.18.1 first-paint cache authority: stale cached Frequently Visited cards are replaced before the live recovery control is unlocked. No Sync/state schema, manifest permission, telemetry or backend change.

## 1.30.18.1

- Hardens disposable first-paint caches so stale cached launcher data can never become an interactive substitute for authoritative `storage.local` state.
- Cross-checks non-Personal session-cache first paint against the already-running raw local read; if Multiple Spaces is authoritatively disabled, the cached Work state is rejected before paint.
- Stops the synchronous localStorage boot manifest from painting Work at all, keeps cached shortcut/empty-state and Frequently Visited content inert until independent authoritative handoffs, and discards still-unverified caches on startup failure rather than unlocking stale targets.
- Makes render-manifest writes project Personal whenever Multiple Spaces is disabled and strengthens boot-grid folder adoption to verify cached first-four child titles and navigation URLs as well as IDs.
- Preserves 1.30.18's conservative external-grid render skip and inactive-Space wallpaper preload optimization. No Sync/state schema, permission, telemetry or backend change.

## 1.30.18

- Prevents a disabled Multiple Spaces configuration from producing a Work-space session render snapshot; Personal is now the only first-paint Space when Spaces are off.
- Avoids unnecessary full shortcut-grid rebuilds for external state changes whose active Manual-order grid inputs are exactly unchanged; ambiguous cases still render normally.
- Skips inactive-Space wallpaper preloading when Multiple Spaces is disabled and resumes preloading when Spaces are enabled.
- Adds regressions for render-equivalence boundaries, disabled-Spaces first-paint state, profile-import whole-profile authority, and Work-space mixed-version Settings protection.
- Removes one obsolete historical wallpaper-persistence comment. No Sync/state schema, permission, telemetry or backend change.

## 1.30.17

- Fixed a mixed-version Settings Sync regression found by an independent adversarial audit: a still-running pre-1.30.15 client could publish an unrelated Settings change with a newer whole-record timestamp and silently revert a newer fine-clock setting from a modern device.
- Fine-clock-vs-legacy merges now always preserve the explicit modern value for that logical control. This deliberately treats legacy whole-record timestamps as insufficient evidence of per-setting intent once modern clock metadata exists.
- Legacy-only Settings remain readable and republish with modern clocks; legacy-vs-legacy deterministic compatibility and modern-vs-modern fine-clock conflict behavior remain unchanged.
- Added direct arrival-order regressions plus production Firefox/Chrome coverage proving raw legacy device snapshots and raw legacy shared Settings records cannot overwrite modern explicit Settings.
- Retains all 1.30.16 browser/store contract hardening, desktop-only Firefox declaration, Chrome minimum-version declaration, permissions, privacy boundaries and UI behavior.

## 1.30.16

- Removed Firefox's unintended `browser_specific_settings.gecko_android` declaration so AMO no longer advertises MosaicSync as Android-compatible; MosaicSync remains a desktop extension until Android support is deliberately implemented and tested.
- Added Chrome `minimum_chrome_version: 104`, matching the oldest API floor required by MosaicSync's Manifest V3 `_favicon` integration. `storage.session` is available earlier (102+) and optional compression/image acceleration paths remain feature-detected.
- Added an exact browser/store release-contract gate for Firefox and Chrome manifests: approved top-level properties, required/optional/host permissions, production identity, CSP, New Tab/Home behavior, Firefox data-collection categories and Chrome minimum version are now pinned.
- Added final public-ZIP validation so production packaging fails if Android support, a development identity, localhost endpoints, unexpected fixed external hosts or other unapproved release-surface declarations leak into a browser artifact.
- Retained Firefox's optional `browsingActivity` and `technicalAndInteraction` declarations and added machine-readable rationales: the former covers user-created shortcut URLs/domains sent through Firefox Sync; the latter covers synchronized MosaicSync settings/layout/recovery metadata. Neither category represents developer analytics or telemetry.
- Clarified PRIVACY.md so Mozilla's data-category wording is explicitly distinguished from device-local Firefox browsing history/Top Sites and from MosaicSync developer telemetry/backend behavior.
- Documented Firefox's Home override as intentional, Chrome's absence of that override as intentional, and corrected current localization-policy references from 32 to 33 languages.
- No Sync/state schema, runtime feature, permission, CSP, UI-control, telemetry, backend or remote-code behavior changed.

## 1.30.15

- Replaced whole-Settings last-writer-wins synchronization with compact per-logical-setting clocks so an unrelated stale preference from another device can no longer overwrite a newer user choice merely because both lived in one Settings record.
- Independent controls now converge independently across devices, including Frequently Visited Show/Count, columns/rows/tile size, theme and darkness controls, Light/Dark wallpaper choices, brand visibility, Multiple Spaces and Space names. Only genuinely indivisible internal properties share one clock.
- Unified local optimistic Settings concurrency and browser Sync on the same deterministic merge primitive. Same-setting conflicts still converge by logical timestamp/device tie-break; unrelated setting changes are preserved on both sides.
- Migrates 1.30.14 and older Settings conservatively by inheriting each logical clock from the existing whole `settingsModifiedAt`. Legacy records without fine clocks remain tolerated; equal-value legacy writes do not artificially advance a fine clock, while genuinely differing legacy values are handled conservatively because older clients cannot identify which field was intentionally edited.
- Carries Settings clocks through Personal/Work state, shared ledgers, device/profile snapshots, `.mosaicsync` backups and catastrophic-recovery publication. Explicit reset / **Use this device** remains a whole-profile authority boundary.
- Keeps `autoSiteIcons`, `webAccessPrompted`, browser permissions, browsing-derived Frequently Visited sites and other device-local state out of Sync. The Frequently Visited UI and all other controls are visually unchanged.
- Advanced persisted state schema to 19 and Sync record schema to 11. No profile-container format bump, new permission, backend, telemetry, remote code or CSP relaxation.
- Added deterministic fine-clock regressions and a seeded five-device Settings stress model covering independent edits, same-setting conflicts, delayed/reordered delivery and a catastrophic Sync-loss authority epoch.

## 1.30.14

- Hardened 1.30.13 catastrophic-zero detection so one `getBytesInUse(null) === 0` observation is never enough to enter quarantine: a second full `storage.sync.get(null)` read must also be genuinely empty. Any visible non-zero namespace remains in the existing normal/torn/corruption path.
- Added a fresh browser-startup warm-up for persisted quarantine/recovering states whose old deadline elapsed while Firefox/Chrome was closed. Time spent with the browser closed can no longer count as proof that browser Sync had an opportunity to redeliver Extension-Storage before MosaicSync republishes.
- Added a persisted 30-second worker-restart grace before each catastrophic recovery publication. A replacement MV3 worker interrupted halfway through recovery therefore waits briefly before attempting another full publication; retry counts remain durable and bounded.
- Improved intentional-reset peer behavior. A peer that sees the valid non-zero reset marker preserves its local profile but remains safely enrolled in `await-remote` rather than silently disabling Sync forever. When a later complete post-reset profile appears, the peer applies that verified profile as the new authoritative epoch without merging pre-reset local shortcuts/settings back into it. Reset markers now reject an empty initiating device ID.
- Added synchronization of **manual detected-favicon intent** without synchronizing favicon pixels. Choosing a candidate in **Choose detected favicon** writes one compact optional `favPref` token into that shortcut's normal Sync record; raw favicon URLs and image data remain device-local unless the user separately enables the existing **Sync this image** option.
- Receiving Firefox/Chromium devices locally reconstruct the explicitly preferred favicon through the existing bounded favicon discovery/recovery pipeline. Exact resource or pixel identity is preferred, user intent is retained across permission/network misses, a changed site may use a provisional best local fallback without forgetting the preference, and an explicit preference can hydrate even when automatic site-icon learning is disabled.
- Changing the shortcut URL or deliberately choosing different artwork clears the stale favicon preference. Preference changes participate in the existing synchronized shortcut mutation/signature logic, while shortcuts with no manual favicon choice incur zero extra Sync-record bytes.
- Expanded Firefox/Chrome production-worker regressions for false-zero quota readings, browser restart after an expired quarantine, worker restart during recovery, reset-peer automatic rejoin without pre-reset resurrection, exact cross-device preferred-favicon reconstruction, automatic-icons-disabled preference recovery and compact Sync-budget enforcement.
- Added a deterministic seeded three-device stress regression for both Firefox and Chrome that repeatedly makes normal edits, wipes the entire simulated Sync namespace eight times, randomly selects the recovery survivor, and verifies every online device preserves local state and reconverges to the complete recovered profile on every round.
- Preserved 1.30.13 catastrophic-loss/tombstone protection, 1.30.12 lifecycle/dev-ID hardening, 1.30.11 Settings appearance isolation, existing permissions, CSP, privacy boundaries and current state/Sync schema versions. No new permission, backend, telemetry or remote code was added.
- Final release validation passes **663/663 automated tests** across 88 test files; the exact GitHub-ready source extraction also passes the benchmark/size gates and deterministically reproduces all release/development packages byte-for-byte.

## 1.30.13

- Added catastrophic Sync-loss containment for established devices after the Firefox uninstall incident demonstrated that an external browser uninstall can erase MosaicSync's synchronized namespace. A device that has previously observed a complete synchronized profile no longer treats a raw 0-byte `storage.sync` namespace as an ordinary remote state.
- Added a durable device-local continuity receipt and bounded retention of verified recent Personal/Work deletion tombstones. This lets a surviving device rebuild the synchronized profile without forgetting prior deletions that could otherwise be resurrected by an old offline device. The continuity metadata is local-only and is neither synchronized nor exported.
- Added a guarded recovery lifecycle: first zero observation enters a silent quarantine; a complete Personal+Work profile reappearing during that window cancels recovery; persistent zero triggers a staggered authoritative republish from the still-valid local profile, followed by pending local/cross-Space mutation replay and complete-profile verification. Local state is never cleared or replaced by the zero namespace.
- Recovery is deliberately staggered rather than simultaneous: recently healthy devices are eligible first, older continuity records add a bounded delay, and a deterministic per-device jitter reduces multi-device publication stampedes. Normal generation/conflict/tombstone logic remains the convergence mechanism once a complete recovery appears.
- Changed MosaicSync's explicit **Clear Sync copy** protocol so it never intentionally leaves `storage.sync` at 0 bytes. A small versioned `reset-intent` record is committed before the other MosaicSync Sync keys are removed; other 1.30.13 devices respect that marker instead of resurrecting the cleared cloud copy. A later explicit local bootstrap removes the marker only after a complete replacement profile is published.
- Added localized non-blocking recovery feedback in all 33 runtime locales: suspected/transient loss is silent, confirmed repair reports that restoration is in progress, successful verification reports completion, and exhausted recovery attempts warn that the synchronized copy could not be restored while the local profile remains safe.
- Added Firefox/Chrome production-harness coverage for established-device recovery, live 1.30.12 migration with no continuity key, fresh-device waiting, transient-zero cancellation, explicit non-zero reset, partial/non-zero torn delivery, preserved historical tombstones, local additions and deletions made during quarantine, plus ordering guards that prevent pending local publication before catastrophic-loss detection.
- Preserved the 1.30.12 install/reinstall lifecycle hardening, separate Firefox development identity, 1.30.11 appearance-preview correction, existing Sync/profile schemas, permissions, CSP, navigation and privacy model. No new feature, host permission, telemetry, backend or remote code was added.
- The exact external reason Firefox treated the 1.30.11 update as an uninstall remains a separate browser/update-path investigation. 1.30.13 does not claim to prevent Firefox itself from uninstalling an extension; it protects surviving MosaicSync devices and repairs the shared copy when a catastrophic zero namespace is confirmed.

## 1.30.12

- Hardened extension lifecycle handling after a serious Firefox update/reinstall incident exposed that `runtime.onInstalled({ reason: "install" })` is not safe evidence of a genuinely new MosaicSync user. MosaicSync no longer resets onboarding, Sync enablement/bootstrap state, applied revision markers, recovery metadata, or icon-recovery state merely because the browser reports an install event.
- Genuine empty installs still initialize normally through the existing `ensureLocalStorage()` defaults and open Welcome. If valid local layout/metadata survives an install-like recovery/reinstallation transition, it is preserved; incomplete onboarding may still open Welcome without destroying the surviving recovery state.
- Added production Firefox/Chrome lifecycle regressions covering a false install with completed onboarding/ready Sync, a false install while waiting for Sync, a truly empty install, a normal update from 1.30.10, and a downgrade/re-upgrade-shaped update event. The tests verify semantic layout preservation plus device ID, Sync bootstrap/status, onboarding and applied/received revision bookkeeping.
- Added an explicit development-only Firefox packaging path. Public/AMO Firefox builds retain `mosaicsync@xipinformatica.cat`; `python tools/package.py --firefox-dev` / `npm run firefox:dev` creates a clearly named temporary package using `mosaicsync-dev@xipinformatica.cat`, preventing routine `about:debugging` work from overlaying the production extension identity/storage namespace. The development package is excluded from the GitHub-ready release archive's generated artifacts.
- Preserved the 1.30.11 isolated live wallpaper/darkness preview fix and all 1.30.10 snapshot-cache, Sync conflict/tombstone, permissions, CSP, navigation and privacy behavior. No synchronized/profile schema or new permission was introduced.
- This release hardens MosaicSync against self-inflicted reset when extension-local data survives an install-like browser transition; it cannot guarantee preservation if Firefox itself has already deleted the extension or its storage namespace. A real signed AMO 1.30.10 → 1.30.12 update remains a mandatory manual release gate.

## 1.30.11

- Restored real-time Settings appearance feedback for wallpaper changes and background darkness after the stricter 1.30 paint freeze caused those controls to update only after Settings closed. Normal wallpaper selection/upload/clear/reset, the main darkness slider, active separate Light/Dark wallpaper selection, active Light/Dark darkness and explicit Light/Dark theme selection now preview immediately.
- Preserved the Firefox/Linux Settings compositor safeguard: while Settings is open, MosaicSync never mutates the authoritative `.page` wallpaper/color, root `--page-bg`, root `--background-dim` or authoritative canvas-text paint. Live feedback is routed to an isolated fixed `appearancePreviewLayer` with `contain: paint`, a plain `<img>` surface and a private dim overlay.
- Kept the preview implementation out of the first-frame critical stylesheet. `openSettings()` already awaits secondary styles, so the Settings-only preview CSS adds no launcher startup CSS cost.
- The existing deferred close lifecycle remains authoritative: Settings closes first, then the next animation frame commits the current appearance once through normal `applySettings()` and clears the preview. Reopen-before-frame protection is retained.
- Added Firefox/Chrome structural and behavioral regressions proving immediate preview, frozen real-page/root paint under Settings, active Light/Dark preview behavior, post-close authoritative commit/cleanup, external-state paint isolation, and absence of preview CSS from the critical sheet.
- No new permissions, host permissions, synchronized/profile schema, snapshot-cache semantics, conflict/tombstone rules, CSP, navigation scope, telemetry, remote code or backend. Release packaging emits exactly `mosaicsync-1.30.11-firefox.zip`, `mosaicsync-1.30.11-chrome.zip`, and `mosaicsync-1.30.11-github-ready.zip`.

## 1.30.10

- Added the mandatory verified device/profile snapshot decode cache as bounded worker-memory performance state only. The cache holds at most `DEVICE_SNAPSHOT_MAX_RECENT_DEVICES` decoded generations (currently 8) and uses LRU eviction.
- Cache hits remain fail-closed: MosaicSync still validates the currently visible manifest/root, requires every expected chunk, verifies per-chunk device/commit/slot/index/total metadata, checks assembled `dataChars`, and recomputes `dataFingerprint` before consulting the cache. Only the expensive Base64/gzip/JSON/Map reconstruction phase is reused.
- Only fully decoded and Personal/Work record/settings-validated generations are cached. Incomplete delivery, corrupt chunks, malformed gzip/JSON, fingerprint/count mismatches and other failed generations are never cached as failures. Previous-generation torn-delivery fallback remains independently usable, and a later-completed current generation becomes authoritative normally.
- Cache identity includes the generation and all manifest metadata that affects decoded output or validation, so metadata/commit changes force a fresh decode even when compressed bytes are identical. Disabling Sync clears the cache; MV3 worker restart/cache loss affects performance only.
- Added deterministic Firefox/Chrome regressions proving eight-device reuse with zero extra second-read gzip decodes, incomplete→complete recovery, current-byte revalidation after cache population, validation failure non-caching, metadata/generation invalidation and previous-generation fallback followed by current completion.
- Fixed a historical Cross-Space defensive-vs-trusted equivalence test that could fail randomly when two production calls crossed a `Date.now()` millisecond boundary; the test now uses a deterministic logical clock without changing runtime behavior.
- Removed only newly proven-dead internal vocabulary (`selectActiveSpace()`, `PLATFORM_NAME`, `ACCOUNT_PROVIDER_NAME`) and clarified normalized publication parameter names.
- No new permissions, host permissions, synchronized/profile schema, conflict/tombstone behavior, backend, telemetry, heartbeat/pulse, remote code, transport, CSP, UI feature or visual change. Release packaging emits exactly `mosaicsync-1.30.10-firefox.zip`, `mosaicsync-1.30.10-chrome.zip`, and `mosaicsync-1.30.10-github-ready.zip`.

## 1.30.9

- Zero-new-features trusted-state efficiency/cleanup release on top of 1.30.8. Preserves the 1.30.8 delivered-value evidence, deterministic conflict/tombstone rules, pre/post publication ledger safeguards, five-minute semantic watchdog, foreground single-flight, compact-baseline reuse, security/privacy boundaries and user-visible behavior.
- Added an explicit `replaceWorkspaceTrustedNormalized()` internal model fast path. The measured New Tab Space-name, multiple-Spaces and synchronized Frequently Visited preference mutations now reuse already-normalized live state/workspaces rather than repeatedly calling full state/workspace normalization before the ordinary persistence writer validates the final state. On the 200-shortcut image-heavy stress fixture, the former defensive transformation path measured about 318 ms in a targeted run versus ~0.001 ms for trusted replacement before persistence.
- Background Personal/Work publication now passes the state already normalized by `pushLocalMutation()` directly into complete profile snapshot publication instead of normalizing the same compact state again.
- The five-minute alarm still retries pending local publication and pending cross-Space transactions before its semantic watchdog, but marks the local retry as already completed when entering `reconcileIfNewCommit()` so that function does not immediately repeat the same pending-journal read in the same serialized task. Other freshness paths retain normal pending-local recovery.
- Expanded 1.30.8 race/evidence coverage: a newer local record is not replaced by older live evidence; delivered tombstones retain MosaicSync's intentional deletion-dominance rule over later ordinary edits; newer tombstones defeat older live records; and same-key Settings values use the same deterministic evidence repair path.
- Removed proven-dead runtime vocabulary only: unused favicon tuning constants/imports, an unused Chrome Sync-data permission import, unused registrable-domain/test wrappers, an unused defensive workspace wrapper and CSS custom properties with no `var(...)` consumers. No functional CSS selector/layout change.
- The verified device/profile snapshot generation cache remains intentionally out of 1.30.9 but is now a **mandatory next-release requirement**. The next release must add a tiny worker-local cache for complete successfully decoded/fingerprint-verified generations, with explicit incomplete-generation/non-caching regressions.
- No new permissions, host permissions, synchronized/profile schema, backend, telemetry, heartbeat/pulse, remote code, CSP relaxation, feature or visual change. Release packaging emits exactly `mosaicsync-1.30.9-firefox.zip`, `mosaicsync-1.30.9-chrome.zip`, and `mosaicsync-1.30.9-github-ready.zip`.

## 1.30.8

- Zero-new-features Sync concurrency hardening on top of 1.30.7. Preserved every 1.30.7 performance fast path, permission/security boundary, merge/tombstone rule, five-minute watchdog and user-visible behavior.
- Closed a narrow same-key `storage.sync` publication race found by adversarial fault injection: if Firefox/Chrome delivers a deterministically newer Personal/Work record or settings value after MosaicSync's pre-write ledger read but before its own write, the browser change event's delivered value—and, critically, a newer `oldValue` displaced by an expected own write—is retained as short-lived bounded core evidence. MosaicSync repairs that exact key through the existing `chooseNewerRecord()` rule before authoritative commit-marker/reconciliation reads, so the newer value cannot disappear merely because the final storage read occurs after it was overwritten.
- The evidence layer is core-only (Personal/Work record/settings keys), bounded by the existing expectation limit, time-limited and in-memory/device-local only; it is never synchronized or exported. It protects delivery values observed in the current background lifetime while durable Sync/device snapshots remain the restart reconstruction path. It does not alter the synchronized/profile schema or conflict policy.
- Added production fault-injection coverage for the same-key race in both Personal and Work on Firefox and Chrome, plus regressions proving failed foreground single-flight checks cannot poison later checks, a settled single-flight is never a completed-result freshness cache, and normalized Cross-Space helpers do not mutate deeply frozen trusted input.
- Kept device-snapshot generation decode caching deliberately deferred for a later measured performance release. Any future cache must store only complete fingerprint-verified generations, remain tightly bounded/disposable, and never cache incomplete delivery.
- No new permissions, host permissions, backend, heartbeat/pulse, telemetry, remote code, CSP relaxation, feature or visual change. Release packaging emits exactly `mosaicsync-1.30.8-firefox.zip`, `mosaicsync-1.30.8-chrome.zip`, and `mosaicsync-1.30.8-github-ready.zip`.

## 1.30.7

- Zero-new-features performance/refinement release on top of 1.30.6. Preserves browser-native Sync, deterministic merge/tombstone rules, the authoritative post-write Sync ledger, five-minute semantic watchdog, privacy/security boundaries and the 1.30.5 Settings single-scroll-owner architecture.
- Added trusted normalized Cross-Space fast paths. Internal moves and Sync-intent construction no longer repeatedly re-normalize the same already-normalized image-heavy state; defensive public wrappers remain for untrusted/raw callers.
- Local persistence can now carry forward the exact compact baseline produced by the storage transaction. New Tab write paths and automatic favicon commits reuse known compact persisted baselines instead of rebuilding them from hydrated state, reducing repeated image hashing/projection work while preserving optimistic-concurrency semantics.
- Simultaneous foreground freshness requests from multiple open New Tabs now share one in-flight background reconciliation. There is deliberately no completed-result freshness cache, so a newly delivered Sync change can still be discovered immediately after the current check finishes. Foreground interval throttling now uses monotonic `performance.now()`.
- Reduced Sync publication overhead without changing conflict behavior: remote-winning records skip redundant deterministic serialization, and workspace clock changes provide a positive fast path while equal clocks still fall back to the exact semantic signature. Foreground watchdog self-healing now reuses the reconciliation function's existing meta read.
- Expected own `storage.sync` echoes no longer replace the useful last-unexpected-delivery diagnostic evidence; five-minute watchdog diagnostics remain intact for forensic value while delayed browser Sync delivery is still under investigation.
- Avoided repeated root geometry CSS-variable writes when columns/tile size are unchanged, and removed proven-dead Settings `<aside>` backdrop/obsolete inner-scroll declarations while keeping the one-scroll-owner computed contract unchanged.
- Added regression coverage for normalized Cross-Space equivalence, compact baseline reuse, 20-request foreground single-flight, monotonic throttling, remote-winner serialization skipping, workspace-clock semantic fallback, own-echo diagnostics, geometry write avoidance and Settings CSS invariants. The performance benchmark now includes the normalized Cross-Space move+intent path.
- No new permissions or host permissions, synchronized/profile schema changes, MosaicSync backend, heartbeat/pulse, polling-frequency increase, CSP relaxation, telemetry, remote code, visual behavior or user-facing features.

## 1.30.6

- Added a throttled foreground/resume Sync freshness check for already-open New Tabs. Visible/focus/bfcache recovery reuses the existing `mosaicsync:reconcile-if-needed` message, the serialized background queue and the unchanged five-minute semantic watchdog; it does not poll a MosaicSync server or claim to force browser-account delivery.
- Foreground recovery now verifies/recreates the existing Sync-watch alarm when needed, closing a long-lived-session recovery gap without adding another timer or shortening the watchdog period.
- Added a dedicated device-local Sync diagnostics record with watchdog/foreground/storage-event timestamps, outcomes and opaque observed revision identifiers. It is stored only in `storage.local`, is ignored by normal UI/state reconciliation, never enters `storage.sync`, and contains no shortcut titles/URLs or telemetry.
- Fixed a concrete concurrent-delivery publication race found by the new regression tests: normal Personal/Work candidate writes are rebased against records/settings already visible in `storage.sync` before writing, so an older local record cannot overwrite a newer delivered remote record merely because its `storage.onChanged` event was missed. Dataset commit markers are built from the actual post-write ledger, preserving concurrently delivered records in count/fingerprint metadata.
- Added production-harness coverage for foreground missed-event recovery, watchdog recovery, alarm self-healing, 60-second foreground coalescing, overlapping event/alarm/foreground idempotence, local-edit/foreground races, Work publication rebasing, and local-only diagnostics.
- No new permissions or host permissions, synchronized/profile schema changes, MosaicSync backend, heartbeat/pulse, CSP relaxation, telemetry, remote code or user-facing features. Release packaging emits exactly `mosaicsync-1.30.6-firefox.zip`, `mosaicsync-1.30.6-chrome.zip`, and `mosaicsync-1.30.6-github-ready.zip`.

## 1.30.5

- Preserved the 1.30.4 single-scroll-owner Settings architecture unchanged while fixing the concrete scroll-lifecycle follow-up found independently in two audits: locale-driven relocalization now saves and restores `settingsDialog.scrollTop`, the actual outer Settings scroller, instead of the normal-flow `settingsForm`.
- Added targeted regression coverage that executes the real locale-refresh function against the outer scroll owner, stress-toggles Separate Light/Dark Wallpapers 100 times without preview repaint, stress-toggles Frequently Visited 100 times through its single visibility owner, and keeps the 1.30.4 one-scroll-owner CSS invariant protected.
- Deliberately did not change the current `hidden`/`display:none` strategy, wallpaper preview painting, Frequently Visited permission flow, native-dialog/container choice, scroll anchoring, overscroll behavior, Sync/storage semantics or any feature surface. The reproduced Firefox white/blank-panel hardware symptom remains a real-machine acceptance gate for the retained 1.30.4 rendering hypothesis.
- No new permissions or host permissions, synchronized/profile schema changes, CSP relaxation, telemetry, remote code or user-facing features. Release packaging continues to emit exactly `mosaicsync-1.30.5-firefox.zip`, `mosaicsync-1.30.5-chrome.zip`, and `mosaicsync-1.30.5-github-ready.zip`.

## 1.30.4

- Zero-new-features Settings-stability refinement and direct public-history successor to 1.30.2; the failed 1.30.3 Settings-container experiment was not published. No permission, synchronized/storage/profile schema, CSP, telemetry, remote-code or security-boundary changes.
- Narrowed the reproduced Firefox Settings white/blank-panel failure to the long-lived Settings form scroll surface. The outer fixed Settings surface is now the **only vertical scroll owner**; `#settingsForm.dialog-card` stays in normal flow with no viewport `max-height` and no independent overflow scroll frame. This is intentionally the only rendering variable changed for the hardware isolation test, preserving the 1.30.3 fixed ARIA container temporarily so the result can prove or disprove scroll-frame invalidation cleanly.
- Retained the reduced-toggle work from the unpublished 1.30.3 candidate: Separate Light/Dark Wallpapers expands/collapses already-prepared controls without repainting both preview images during the checkbox gesture, and Frequently Visited uses one parent visibility owner.
- Retained the confirmed correctness hardening from the unpublished 1.30.3 candidate: Space switching is blocked while Settings is open; stale shortcut-image and custom-wallpaper async jobs are generation/owner guarded; System-theme reconciliation is last-result-wins; conventional favicon fallback timeouts remain provisional; durable favicon-recovery queue mutations are serialized/rebased and reject non-finite retry timestamps; final slider interactions persist immediately; color-plane drag geometry is cached and lost pointer capture is handled.
- Added dedicated regression coverage proving the single-scroll-owner Settings contract in shared source and both generated browser trees while deliberately preserving the 1.30.3 outer Settings container for diagnostic isolation.
- Release packaging emits exactly three deterministic archives with explicit browser naming: `mosaicsync-1.30.4-firefox.zip`, `mosaicsync-1.30.4-chrome.zip`, and `mosaicsync-1.30.4-github-ready.zip`.

## 1.30.2

- Zero-new-features Snow Leopard refinement release on top of 1.30.1. No permission, storage/Sync/profile schema, CSP, telemetry, remote-code or security-boundary changes.
- Fixed the separate Light/Dark wallpaper selector so changing the active appearance while Settings is open immediately paints that appearance's configured wallpaper, background color and darkness. The fix is deliberately narrow: it does not call the broad Settings/grid renderer, while unrelated full-page appearance work remains deferred until Settings closes.
- Corrected redirected-origin favicon quality completion. Original-site recovery now reports whether its bounded declared-candidate scan actually completed and propagates timeout/network uncertainty to the outer resolver, so a partial scan cannot be recorded as fully audited for the 30-day quality-ledger window.
- Serialized device-local favicon quality-ledger read/modify/write operations so tab-learning and recovery-queue completions cannot overwrite one another, and hardened ledger normalization to reject non-finite timestamps or policy versions.
- Added the missing post-await cancellation checkpoint to the user-invoked detected-favicon chooser, preventing obsolete discovery/network work from starting after the editor closes or its URL changes while the one-time Website Access prompt marker is being saved.
- Eliminated a redundant disposable render-manifest write by seeding the module's serialized snapshot whenever an already-valid manifest is loaded or supplied by the synchronous bootstrap.
- Gated the short-lived Long Task `PerformanceObserver` behind MosaicSync's explicit developer-metrics switch so normal production New Tabs do not install diagnostic observation work.
- Strengthened regression fidelity: Settings refresh-domain tests now consume the production key definition instead of a divergent hand-written mock; legacy installations with no quality ledger are explicitly verified to reopen automatic favicons for the one-time audit; concurrent ledger writes, non-finite metadata, redirected-origin timeouts, live Light/Dark wallpaper selection, stale favicon-chooser cancellation and render-manifest no-op persistence are covered.

## 1.30.1

- Snow Leopard corrective maintenance release and direct public successor to 1.27.9. The unpublished 1.30 release candidate is folded into this release rather than appearing as a separate public-history entry. No permission, storage/Sync/profile schema, CSP, telemetry, remote-code or security-boundary changes.
- Reworked open-Settings state adoption around targeted domains instead of a global control refresh. Exact own-write echoes now update bookkeeping without rebuilding the Settings DOM; genuine external changes refresh only affected non-dirty sections; device-artwork-only changes still use the dedicated fast path. This removes the unrelated Background preset-grid/theme-wallpaper reconstruction implicated in the Linux/Windows blank-panel failures.
- Kept all full-viewport wallpaper/background painting deferred while Settings is open, reduced the Separate Light/Dark Wallpapers toggle to one visibility/preview update, and applies the final page appearance once Settings closes.
- Completed automatic favicon quality recovery: the fast path may show an immediate provisional icon, then one durable bounded quality pass scans the finite declared/manifest candidate set instead of stopping at the first merely adequate icon. A later materially better candidate can replace the automatic favicon; completed audits are remembered device-locally so they do not repeat on every New Tab/startup, while URL changes and the one-time 1.30.1 upgrade migration re-open every older automatic favicon for this improved audit once. User-uploaded, built-in and manually selected artwork remain protected.
- Isolated permission-event work by permission type: Top Sites changes refresh Frequently Visited only, while Website Access origin changes drive favicon/Web Access recovery. Unrelated permission events no longer wake both paths.
- Clarified Sync semantics: the foreign-receipt timestamp is labeled as received from another device, the authoritative publication action is labeled as using this device as the Sync source and confirms before replacing known remote data, and delayed-delivery wording correctly states the five-minute watchdog interval.
- Expanded Sync behavioral coverage for complete Personal+Work publication fallback, self-publish versus foreign-receipt timestamps, authoritative local bootstrap, fresh-device waiting/recovery and no-event watchdog behavior. The complete-profile recovery architecture and legacy readers remain unchanged.
- Removed obsolete baggage: the unused monolithic `newtab.css` source/reference file is gone after historical tests were moved to the real critical/secondary runtime CSS, and the obsolete Personal-only snapshot writer was removed after its fault-injection coverage was transferred to the current complete-profile publisher. Legacy snapshot readers remain for direct-upgrade compatibility.
- Refined the empty-Space helper geometry so the arrow tail starts at the vertical center of the instruction bubble while the tip stays centered on the add tile in both Personal and Work.
- Corrected proven stale localization copy across the existing catalogs and added Galician, bringing MosaicSync to 33 UI/manifest locales. Arabic remains intentionally deferred pending a dedicated RTL pass.
- Added behavioral regressions for exact-own-write Settings echoes, Frequently Visited/background isolation, Light/Dark wallpaper targeted refresh, bounded 64→192 favicon quality upgrades, durable one-time favicon audit completion and permission-event isolation.
- Retained the 1.27.9 shared New Tab build-time canonical source, Settings pending-draft model, favicon safety/provenance ranking, package hygiene and all existing security/safety invariants.

## 1.27.9

- Snow Leopard maintenance release: no new features, UI surfaces, permissions, storage/Sync/profile schemas, CSP changes, telemetry or remote code. Public predecessor is 1.27.8.9.
- Fixed a Settings model/draft race exposed by cross-tab/external state changes. While Settings is open, incoming persisted state is now the authoritative baseline, pending local edits are overlaid as an explicit unpersisted draft, untouched controls refresh from the incoming state, and dirty local values remain protected until their write succeeds. This prevents a stale sibling control from overwriting a newer external value and prevents debounced Tile Size/background edits from being erased by an incoming storage event.
- Completed the favicon suitability policy. Automatic discovery no longer stops merely because a candidate crosses a raw pixel-size threshold; bounded early termination now requires an authoritatively suitable candidate using the same provenance/geometry-aware policy as winner selection. Automatic resolution and the manual detected-favicon chooser also share one deterministic preference/tie-break rule. No site-specific exceptions were added.
- Consolidated the byte-identical Firefox/Chrome New Tab runtime implementation into one canonical `src/shared/newtab/` source. The deterministic build emits identical `newtab.js`, `newtab-critical.css` and `newtab-secondary.css` into both browser packages, eliminating manual source drift with zero runtime import/startup cost. Browser-specific manifests, HTML overlays where required, background workers and platform behavior remain separate.
- Removed the historical monolithic `newtab.css` from runtime packages while retaining one reviewed source reference for historical/full-CSS regression tests. Runtime continues to load only critical CSS plus on-demand secondary CSS, reducing each browser package by roughly 22 KB compressed without changing behavior.
- Strengthened behavioral coverage for Settings draft/baseline merging, debounced persistence, background-field preservation, full resolver sequencing with huge-manifest-first fixtures, bounded favicon early stop, runtime CSS ownership and reduced-motion preservation. Historical regression guards remain in place.
- Re-audited all 32 UI locales and both browsers' 32 manifest locale sets for key parity, non-empty values, placeholder parity, reverse-map collisions and runtime localization coverage. No new localization key was required.
- Cleaned current architecture/release documentation and source-package hygiene; generated Python cache files are excluded from the GitHub-ready source archive. Sync recovery, migration compatibility, conflict/tombstone behavior, image/SVG validation and all other security boundaries are intentionally unchanged.

## 1.27.8.9

- Reworked Sync recovery around one verified **Personal + Work** device generation while retaining the immediately previous complete generation for fallback. Fresh profiles no longer finalize from Personal alone; explicitly empty Work remains valid, missing/torn Work remains waiting, local edits made while waiting merge safely when the complete profile arrives, and a trusted complete profile can repair a torn Work compatibility ledger without changing the existing per-record conflict/tombstone rules.
- Hardened recovery publication so a half-restored device with no applied Work/profile baseline cannot publish its temporary blank Work view as authoritative. Legacy Personal-only safety snapshots remain readable for compatibility but are not granted complete-profile repair authority.
- Added the 1.27.8 New Tab critical-path architecture: launcher-only blocking CSS, pre-module authoritative `storage.local` I/O, strict in-place adoption of exactly matching bootstrap state, visible-first folder artwork hydration, bounded/yielding hidden-artwork warming and local-only startup diagnostics.
- Eliminated the Firefox one-time white-pill rendering artifact. New Tab performs no automatic post-paint secondary-stylesheet insertion; logo hover never requests deferred CSS; launcher-affecting global/form/color-tag/edit-chip/brand rules are critical-owned; secondary UI loads its packaged stylesheet only on demand.
- Restored the MosaicSync hello mascot after the internal 1.27.8.8 candidate accidentally left its animation references without their critical `@keyframes`. Both mascot animations are again complete in critical CSS while logo hover remains secondary-CSS-free.
- Fixed Light-mode first paint: `appearance-bootstrap.js` now sets `data-effective-theme` synchronously from the same disposable appearance hint already used for the page color, so Light mode no longer flashes Dark tile variables before authoritative state arrives.
- Fixed the Settings-open Firefox/Linux lifecycle class behind the Separate Light/Dark Wallpapers blanking and first-time Frequently Visited stuck-panel reports. MosaicSync still adopts incoming storage/Sync state immediately, but full launcher/root settings commits and grid rebuilds are centrally deferred while Settings is open and coalesced into one authoritative commit on the frame after Settings closes. The isolated wallpaper preview remains live; the old blanket own-write suppression is not restored.
- Fixed drag/drop localization by refreshing **Move here / Switch their positions / Create folder / Put both shortcuts together** through the locale system every time the choice UI opens. All 32 locale catalogs remain complete.
- Improved favicon quality selection generally without site-specific rules. Resolution reward now saturates once an icon is tile-ready; provenance and square geometry then decide among suitable candidates, preventing very large manifest/touch assets from automatically displacing a crisp conventional favicon while still allowing genuinely tiny legacy icons to upgrade.
- Frequently Visited Show/Count intent remains synchronized while actual Top Sites/history/hidden-site data and optional permission remain device-local. Shortcut hover remains paint-only (`scale(1.045)` / `brightness(1.065)`) with no grid layout shift.
- Added two-sided regression coverage for mascot preservation/no deferred-CSS activation, first-frame Light theme, Settings-open commit deferral and post-close coalescing, Catalan/all-locale drag-choice text, and general favicon suitability ranking.
- No new permissions or host permissions, no synchronized shortcut/settings schema change, no CSP relaxation, telemetry, remote code, navigation-safety reduction or image/SVG safety reduction. State schema remains 18, synchronized record schema remains 10, and local Sync bookkeeping meta schema remains 12. Public release identity is exactly `1.27.8.9` across Firefox, Chrome, Chrome `version_name`, runtime/UI metadata, generated build metadata, package filenames and release documentation. `1.27.8` through `1.27.8.8` were internal/unpublished candidates and are not part of the public changelog sequence.

## 1.27.7

- Fixed a general device-local favicon propagation race in New Tab. MosaicSync no longer suppresses `storage.local` state changes merely because their synchronized `updatedAt` clock matches a recent in-page write; reconstructable favicon/cache writes intentionally keep that clock unchanged, so the old heuristic could leave the in-memory shortcut updated while the already-rendered tile remained on its fallback letter. The existing device-artwork fast path now handles exact own-write echoes safely without risking a missed background favicon update.
- Improved **Choose detected favicon** consistency without changing the automatic favicon resolver. A currently learned automatic favicon (`favicon`/browser-native `firefox` source kinds only) is now offered as an already-known detected choice, while uploads and built-in icons are never misclassified as detected favicons.
- Distinguished a successful scan with no additional icons from a page-inspection failure. If the website head cannot be inspected because of timeout/network/HTTP/content failure and no other candidate was found, the picker reports a localized inspection error instead of incorrectly saying that no icons exist.
- Added a regression fixture modeled on the MosaicSync website's declared inline SVG + 32×32 PNG favicon metadata and permanent coverage for declared-inline discovery, current-learned candidate deduplication and the unchanged automatic favicon resolver path.
- Added the new inspection-failure message to all 32 locale catalogs. No new permissions or host permissions, no state/Sync/profile schema changes, no automatic favicon ranking/winner/single-flight changes, no CSP relaxation, telemetry or remote code. Version identity is exactly `1.27.7` across Firefox, Chrome, runtime/UI metadata, build output and source documentation.

## 1.27.6

- Reduced contained top-level shortcut artwork from the 1.27.5 ~76–78% footprint to approximately 70% of the tile (53 px at the default 76 px tile), including bundled top-level icons. Tile dimensions, grid density, the existing fixed label reservation and Cover-mode edge-to-edge behavior are unchanged; the size slider and synchronous first paint use the same proportional ratio.
- Added real cancellation for user-triggered **Choose detected favicon** discovery without sending non-cloneable `AbortSignal` objects through extension messaging. New Tab assigns each picker operation a request ID; closing/resetting the editor sends a scoped cancel message, the background worker owns the matching `AbortController`, and in-flight manual HTTP(S) favicon/page/manifest fetches are aborted. Cancellation cannot affect unrelated picker requests.
- Expanded favicon-picker regressions so a live Website Access revocation is proven to block an already-populated short-lived cache, and the aggregate 800K-character cache-retention bound is exercised directly.
- Expanded Public Suffix List functional coverage with IPv4, bracketed IPv6, localhost/single-label and additional Kawasaki wildcard/exception cases while retaining the exact reviewed source/runtime semantic ruleset.
- Strengthened the New Tab CSS dead-selector audit so class usage is derived from class-bearing HTML/JS contexts instead of arbitrary substring matches; no selectors were removed speculatively. Package-size parity failures now explain the required `python3` executable directly.
- The automatic favicon resolver/ranking/winner/single-flight path remains unchanged; only the manual picker supplies the new optional cancellation signal to shared bounded fetch helpers. No new permissions or host permissions, no state/Sync/profile schema changes, no CSP relaxation, telemetry or remote code. Version identity is exactly `1.27.6` across Firefox, Chrome, runtime/UI metadata, build output and source documentation.

## 1.27.5

- Increased contained shortcut artwork from the previous ~63% footprint to a proportional ~76% of the tile (58 px at the default 76 px tile), with bundled top-level icons at 78%. Tile dimensions and grid density are unchanged; the existing shortcut-size slider continues scaling artwork and tiles together, while Cover mode remains edge-to-edge.
- Hardened the user-invoked favicon-choice cache against just-revoked Website Access by forcing a live permission refresh before cache reads. Cache admission already refreshed permission and remains unchanged. The automatic favicon resolver/ranking path is untouched.
- Reduced manual favicon-choice latency on redirected sites by batching the redirected `/favicon.ico` with the first conventional fallback under the existing maximum concurrency of two. The ordered two-wide batching model is intentionally retained so candidate priority/network semantics do not become completion-order dependent.
- Strengthened Public Suffix List build safety with deterministic semantic rule counts/hash metadata, minimum wildcard/exception sanity checks, duplicate/embedded-whitespace rejection, synthetic transformation coverage, and functional exact/private/wildcard/exception/IDN registrable-domain equivalence between source and compact runtime PSLs.
- Strengthened package-size monitoring: baseline categories may no longer silently disappear, significant individual top-file growth is guarded with combined percentage/absolute thresholds, report accounting is regression-tested, and JavaScript/Python size-category classifiers are parity-tested.
- Added deterministic hostile/special-character coverage for compact runtime locale reconstruction and a complete New Tab CSS class-selector reference audit. The audit found no additional proven-dead class selectors beyond the rules already removed in 1.27.4, so no speculative CSS deletion was made.
- Documented the generated-artifact contract in `CONTRIBUTING.md`: `src/` remains authoritative, compact PSL/locale files in `dist/` are deterministic build output and must never be edited directly.
- No new permissions or host permissions, no state/Sync/profile schema changes, no automatic favicon resolver/ranking/single-flight changes, no CSP relaxation, telemetry or remote code. Version identity is exactly `1.27.5` across Firefox, Chrome, runtime/UI metadata, build output and source documentation.

## 1.27.4

- Reduced runtime package size without removing features or source readability. The deterministic build now strips non-semantic PSL comments/blank lines into a rules-only runtime artifact while retaining the full reviewed upstream PSL in source, and generates compact runtime locale modules from the unchanged 32 readable source catalogs. Exhaustive tests prove exact PSL rule order and exact locale key/value equivalence.
- Added deterministic package-size reporting and a checked-in category baseline. Future unexpected total/category compressed growth above 15% fails regression tests until the baseline is consciously reviewed and updated; this is a bloat guard, not a fixed product-size ceiling.
- Improved the user-invoked favicon chooser without changing MosaicSync's automatic favicon resolver: candidate image work is capped at two concurrent fetch/decode jobs, repeated exact-URL requests can reuse a tiny 30-second in-memory cache (maximum four URLs with retained-pixel bounds), and cache admission rechecks Website Access permission.
- Fixed favicon-picker lifecycle cleanup. Closing the shortcut editor now invalidates in-flight picker work and immediately releases candidate DOM/data; URL edits retain the existing generation invalidation so stale async results cannot repopulate the editor.
- Preserved site-declared inline favicon candidates through the same existing declared-image/SVG safety path while normalizing HTTP(S) resource keys for cleaner deduplication. Detected choices now expose localized Browser/Website source plus dimensions through tooltip/ARIA metadata without adding new locale strings.
- Removed confirmed obsolete `.stack-actions` / `.full-button` shortcut-editor CSS and expanded regressions for cache TTL/bounds, two-wide manual discovery concurrency, editor-close cleanup, inline favicon preservation, accessible candidate metadata, source→runtime data equivalence and package-size growth monitoring.
- No new permissions or host permissions, no state/Sync/profile schema changes, no automatic favicon winner/ranking/single-flight changes, no CSP relaxation, telemetry or remote code. Version identity is exactly `1.27.4` across Firefox, Chrome, runtime/UI metadata, build output and source documentation.

## 1.27.3

- Added a user-invoked **Choose detected favicon** picker in the shortcut editor. It discovers up to eight validated site-icon candidates using MosaicSync's existing bounded favicon/image/SVG primitives, deduplicates equivalent pixels, and lets the user choose the exact artwork they prefer. The automatic favicon resolver itself is byte-for-byte unchanged from 1.27.2. A selected detected favicon becomes explicit user artwork and is therefore protected from later automatic replacement; the existing optional **Sync this image** control remains the only way to synchronize its compact pixel derivative.
- Improved open-folder anchoring during viewport movement: an open folder now follows `.page` scrolling as well as window resize through one `requestAnimationFrame`-throttled reposition path, keeping the popover visually attached without repeated synchronous layout work.
- Completed the Recent-mode no-drop boundary by stopping `dragover` propagation and explicitly advertising `dropEffect = none`; grid-gap drops remain browser no-ops and no parent visual-slot handler exists.
- Reduced unnecessary Recent-mode work on ordinary same-tab navigation. Shortcut usage timestamps are still persisted locally before navigation, but MosaicSync no longer schedules a full Recent-grid render when the current New Tab is about to leave; background/modifier opens still re-render because MosaicSync remains visible.
- Expanded regression coverage for both chronological directions of uploaded-artwork vs built-in-icon Sync conflicts, favicon-picker safety and selection semantics, automatic-resolver byte identity, scroll/resize folder reposition coalescing, Recent dragover containment, grid-gap no-op behavior, and all 32 localized favicon-picker strings.
- No new permissions or host permissions, no state/Sync/profile schema changes, no automatic favicon resolver changes, no CSP relaxation, telemetry or remote code. Version identity is exactly `1.27.3` across Firefox, Chrome, runtime/UI metadata, build output and source documentation.

## 1.27.2

- Made **Recently opened** explicitly presentation-only for top-level drag/drop. While Recent mode is active, visual-slot grid drops are blocked so Frequently Visited drags and folder-child extraction cannot write a temporary Recent slot into synchronized Manual positions. Normal Add shortcut still works and chooses a canonical free Manual position; Manual-mode exact-slot drag/drop remains unchanged.
- Tightened the Edit shortcut dialog for normal desktop-height viewports so the ordinary desktop editor fits without the visible internal right scrollbar. Vertical spacing, image-preview size and action margins are reduced modestly; generic internal overflow remains available on genuinely short viewports for localization/accessibility safety.
- Hardened disposable render-manifest projection so `builtinIcon` and `colorTag` are allow-list validated before serialization, matching the existing session-snapshot and render-sink validation.
- Hardened malformed built-in artwork metadata: `imageSourceKind: "builtin"` without a valid built-in icon now normalizes to `none`, allowing normal favicon recovery instead of leaving an icon-less protected state. Intentional synchronized built-in-icon choices continue to use normal last-writer-wins presentation semantics, including replacing local custom artwork.
- Added behavioral/integration regressions for Recent-mode drop safety in both browsers, canonical Add behavior, render-manifest allow-list parity, malformed built-in source recovery, cross-device built-in-vs-upload semantics, full folder-popover geometry (one/two-line, clipped, edge clamp, flip-above), and classic-first-paint vs authoritative Recent-order equivalence.
- No new permissions or host permissions, no state/Sync/profile schema changes, no favicon resolver changes, no CSP relaxation, telemetry or remote code. Version identity is exactly `1.27.2` across Firefox, Chrome, runtime/UI metadata, build output and source documentation.

## 1.27.1

- Fixed the remaining visual gap between a folder tile/title and its opened popover. MosaicSync now anchors the popover to the bottom of the **actually rendered visible folder-title text** instead of the `.shortcut-label` element's reserved 34 px two-line layout box. One-line titles no longer inherit invisible empty label height; genuine two-line titles remain fully visible.
- Reduced the nominal folder-title-to-popover gap from 4 px to 3 px while preserving horizontal centering, viewport clamping and the existing above/below collision fallback. The text-range measurement ignores clipped line boxes and fails safely back to the label element rectangle if range geometry is unavailable.
- Added permanent geometry regression coverage for one-line labels, two-line labels, clipped hidden lines and range-unavailable fallback. No new UI strings, permissions/host permissions, storage/Sync/profile schema changes, favicon changes, CSP relaxation, telemetry or remote code. Version identity is exactly `1.27.1` across Firefox, Chrome, runtime/UI metadata, build output and source documentation.

## 1.27.0

- Added a compact **Open all in background** action to folder popovers. It reuses MosaicSync's existing HTTP(S)-validated background-tab navigation path, records local recency usage for the opened shortcuts, and does not change the folder/state model.
- Fixed folder popover placement so folders open much closer to the originating folder tile/label (4 px nominal gap) while preserving viewport clamping and above/below collision handling.
- Added 13 bundled MosaicSync shortcut icons (Home, Mail, Work, Star, Heart, Shopping, Finance, Video, Music, News, Code, Cloud and Game). Built-in icons are fixed packaged SVG primitives, synchronize as compact metadata, consume no image Sync/storage budget, clear stale image assets when selected, and are protected from automatic favicon replacement.
- Added synchronized shortcut color tags with eight restrained accent colors. Tags are strict allow-list metadata and render consistently on normal tiles, folder items and folder mosaics.
- Added an optional device-local **Recently opened** shortcut order. Opening a shortcut records only a bounded local timestamp map; the view reorders presentation without mutating or synchronizing canonical manual positions. Switching back to Manual order restores the synchronized layout immediately, and first-paint/authoritative rendering use matching recency semantics.
- Advanced the additive local state schema to 18 and Sync shortcut-record schema to 10 for built-in icon/color metadata. Older records remain compatible through default normalization; the `.mosaicsync` profile container format itself is unchanged.
- Added the new UI strings, icon labels and color labels to all 32 MosaicSync UI locale catalogs (400 keys per catalog) and expanded regression coverage for Sync/profile round-trips, local-only recency, built-in-icon favicon exclusion, safe folder Open all, close popover anchoring, packaging and cross-browser parity.
- Hardened the lightweight `storage.session` startup projection for the new presentation metadata: built-in icon and shortcut-color values are now allow-list validated into the session snapshot (including folder children), and authoritative reconciliation includes both fields in its visual signature. An older/incomplete session snapshot can therefore never leave a first-frame icon/color mismatch when the disposable render manifest is unavailable.
- Preserved the 1.26.17.7 permission-recovery behavior and 1.26.17.6 favicon single-flight/resolver quality unchanged. No new permissions/host permissions, CSP relaxation, telemetry or remote code. Version identity is exactly `1.27.0` across Firefox, Chrome, runtime/UI metadata, build output and source documentation.

## 1.26.17.7

- Improved Frequently Visited optional-permission recovery without changing the permission model: the remembered ON/OFF preference is now independent from the live `topSites` grant, so a missing/revoked grant no longer forces the feature preference off or requires an OFF → ON toggle to recover.
- Added a localized direct **Grant permission** action inside the enabled Frequently Visited settings state. The permission request remains user-gesture-only; denial leaves the preference enabled and the recovery action available.
- Added permission-event and delayed-startup reconciliation. `permissions.onAdded` / `permissions.onRemoved` refresh Frequently Visited immediately, and one delayed post-start check allows a temporarily unavailable browser grant to restore suggestions automatically when it becomes visible again.
- Profile import, including first-run profile import, now preserves the user's Frequently Visited preference independently from installation-local Top Sites permission state; an enabled imported preference exposes the same recovery UI when permission is still needed.
- Added the missing favicon single-flight stale-fan-out regression: the production queue grouping is composed with the real `applyProactiveFaviconResults()` path and verifies that, during one shared exact-URL resolver job, an unchanged shortcut can hydrate while a URL-edited duplicate, a deleted duplicate and a duplicate moved into an auto-icon-disabled Space are independently rejected. Runtime favicon resolver/discovery behavior is unchanged from 1.26.17.6.
- Added the permission-recovery button string to all 32 MosaicSync UI locale catalogs and permanent Firefox/Chrome behavioral/source regressions for the recovery state, permission-event self-heal and profile-preference preservation.
- No new permissions or host permissions, Sync/profile/schema changes, CSP changes, favicon resolver changes, telemetry, remote code or visual redesign. Version identity is exactly `1.26.17.7` across Firefox, Chrome, runtime/UI metadata, build output and source documentation.

## 1.26.17.6

- Reduced duplicate favicon recovery work by grouping queued jobs with the exact same normalized shortcut URL **and** quality mode. One validated resolver result can now satisfy every matching shortcut in the queue turn while distinct pages on the same origin and fast-vs-quality passes remain independent. Existing stale-result revalidation, per-item retry/backoff and atomic device-local commits are unchanged.
- Memoized the Frequently Visited explicit-shortcut host Set within the same in-memory state identity and `stateMutationGeneration`, avoiding repeated full cross-Space/folder walks on focus/refresh when shortcut state has not changed. State replacement or any mutation-generation advance rebuilds the Set.
- Gated New Tab performance `console.debug` diagnostics behind the existing local `MOSAICSYNC_DEV_METRICS` flag so production tabs avoid unnecessary diagnostics object construction and console calls. No telemetry is added.
- Added behavioral regression coverage that actually executes the classic synchronous first-paint renderer with hostile shortcut/Frequently Visited URLs and with the shared URL helper absent; no unsafe anchor may be created and missing safety infrastructure must abort the disposable first paint cleanly.
- Deepened checksum-valid prototype-pollution regression coverage by asserting dangerous own `__proto__`, `constructor` and `prototype` keys do not survive on accepted normalized package/state/settings/Space/folder/shortcut/nested-child objects.
- Kept the performance release intentionally narrow: no CSS/visual changes, PSL format change, state-normalization redesign, permission change, Sync/profile/schema change, CSP relaxation, remote code or telemetry. Version identity is exactly `1.26.17.6` across Firefox, Chrome, runtime/UI metadata, build output and source documentation.

## 1.26.17.5

- Unified HTTP(S)-only shortcut URL validation behind one tiny classic/module-compatible safety primitive shared by the state model, session-render validation, Firefox native import, registrable-domain URL handling, render-manifest generation and the authoritative New Tab UI. This removes duplicated protocol/scheme logic without changing the accepted shortcut URL policy.
- Extended the same fail-closed validator to the synchronous first-paint renderer. `render-bootstrap.js` now validates again at both shortcut and Frequently Visited `href` sinks; if the shared helper is unexpectedly unavailable, the disposable first frame fails closed and the authoritative module renderer takes over normally.
- Kept the first-paint performance boundary explicit: the shared URL-safety script is under 1.8 KB, has no async/network/timer work, and is loaded at the bottom of New Tab immediately before the disposable render bootstrap instead of joining the head/startup-I/O path.
- Broadened checksum-valid profile prototype-pollution regression coverage across the package root, profile object, state, settings, Space/workspace records, top-level shortcuts, nested folder children and assets. Hostile `__proto__`, `constructor` and `prototype` keys must either be normalized away or rejected while `Object.prototype` remains untouched.
- Added regression checks that the URL-safety implementation remains centralized and that the first-paint renderer cannot regress to raw `item.url`/`site.url` assignments.
- No new permissions, Sync/profile format change, persisted schema change, remote code, telemetry or CSP relaxation. Version identity is exactly `1.26.17.5` across Firefox, Chrome, runtime/UI metadata, build output and source documentation.

## 1.26.17.4

- Hardened `.mosaicsync` profile import against local resource exhaustion: both Settings and first-run Welcome now reject files above the existing 256 MiB abuse ceiling **before** calling `File.text()`, while the parser keeps its independent post-read character limit. The new too-large error is localized in every supported MosaicSync UI language.
- Added final HTTP(S)-only shortcut navigation defense-in-depth in the authoritative New Tab UI. Normal state/Sync/profile normalization already rejected non-HTTP(S) shortcuts; top-level tiles, folder items, permission-resume navigation and “Open in new tab” now independently fail closed if an invalid scheme somehow reaches the render boundary.
- Removed the obsolete `VERSION === "1.24.7b"` migration gate while preserving the historical `previousVersion`-based resolver repair behavior.
- Removed the superseded mobile Frequently Visited CSS rule that hid cards 4+ below 900 px; the current configurable show-and-wrap behavior is unchanged.
- Expanded regression coverage for oversized pre-read rejection, non-HTTP(S) profile/Sync/navigation inputs, checksum-valid hostile object keys/prototype-pollution attempts, authoritative profile-restore semantics, inactive-Space concurrent edits and same-shortcut core/favicon interleavings.
- No new permissions, Sync/profile format change, persisted schema change, remote code, telemetry or CSP relaxation. Version identity is exactly `1.26.17.4` across Firefox, Chrome, runtime/UI metadata, build output and source documentation.

## 1.26.17.3

Changes since the last published 1.26.12 source:

- Reworked **Automatic site icons** around the browser's real optional Website Access state. Saving a new iconless shortcut or enabling the feature can request access from the originating user gesture, and a grant immediately targets missing artwork without requiring the user to visit the site first. Denial cannot leave the feature misleadingly enabled.
- Consolidated favicon recovery policy so the browser-specific resolver owns source capability decisions. Chromium can use its permission-free native favicon database without host access; Firefox/network discovery remains permission-honest. Permission blocks do not burn website retry budget, and recovery covers both Personal and Work Spaces.
- Hardened Chromium native favicon handling: the private `_favicon` endpoint is requested at a pinned `scaleFactor=1x` without forced cache reuse; generic placeholder signatures are kept in a small bounded set; a failed sentinel probe is never cached; and native bytes fail closed instead of becoming durable artwork when the placeholder identity cannot be established.
- Made the Chromium permission-free recovery schedule internally consistent. A browser-local miss without Website Access is retried only on a bounded cadence rather than remaining immediately due or spinning, while New Tab/native hydration and a later permission grant can still recover sooner.
- Fixed quality-only recovery lifetime: a useful browser-native fallback no longer leaves an impossible upgrade job pending while Website Access is absent, revoking Website Access drops quality-only work that can no longer run, and a later explicit grant re-seeds upgrade candidates.
- Improved favicon compatibility by preferring known PNG/JPEG/GIF/WebP/ICO byte signatures over inaccurate HTTP MIME labels and by accepting bounded website-declared inline `data:image/...` favicons through the same image-safety pipeline.
- Strengthened SVG pre-decode safety: root geometry discovery ignores XML prolog comments/processing instructions so a decoy `<svg>` cannot hide the real root dimensions. Intrinsic raster/SVG geometry remains checked before browser decoding; bounded bitmap resize is an additional output constraint rather than the primary pre-allocation guarantee.
- Improved **Frequently Visited** with stable first-frame rendering, direct drag-to-grid shortcut creation and device-local registrable-domain hiding. If the persisted hidden-domain list exists but is corrupt/unreadable, the synchronous cached first frame now fails closed instead of flashing suggestions that may have been hidden.
- Fixed **Frequently Visited cross-Space duplication**: candidates are now filtered against normal shortcuts from every MosaicSync Space, including shortcuts nested inside folders. A site already saved in Personal is therefore not suggested while viewing Work, and vice versa; the existing canonical-host matching semantics are otherwise unchanged.
- Fixed **Light/Dark wallpaper darkness leakage**: separate Light and Dark wallpapers now keep independent darkness values. Existing users preserve the darkness of the appearance active during migration while the opposite appearance starts at 0%; automatic system-theme switching changes wallpaper and darkness together, including the synchronous first-paint hint.
- Fixed localized **Firefox Sync settings footer** alignment: longer translations such as French can now wrap within localization-safe grid tracks instead of running into the destructive “Clear Sync copy” action. The fix is CSS-only, applies to both Firefox and Chrome, and does not change any translated strings.
- Fixed Firefox Frequently Visited native Top Sites adapter binding and kept Public Suffix List handling lazy/device-local.
- Strengthened Firefox/Chrome Sync self-healing. Equal commit markers are no longer sufficient to skip reconciliation when usable remote semantic content differs from the current workspace, and the periodic Sync watchdog verifies actual remote semantic content so missed/delayed extension-storage events can recover without restarting Firefox once the data is locally visible.
- Reduced partial-delivery Sync write amplification: when an atomic device snapshot is usable but the compatibility shared ledger is visibly incomplete, MosaicSync applies the usable core locally but waits for the ledger to become coherent instead of immediately republishing/repairing the partial view.
- Clarified the backup boundary: automatically learned/browser-native favicon pixels stay out of browser `storage.sync` but are intentionally included in an explicit complete `.mosaicsync` profile export; retry diagnostics, permission UI memory, render snapshots and Frequently Visited hidden-domain data remain excluded from profile exports.
- Added stronger production-module regression coverage for Chrome placeholder failure/retry behavior, native retry scheduling, corrupt Frequently Visited first-frame storage, cross-Space recovery/concurrency, favicon safety and same-marker semantic Sync reconciliation.
- No new required permissions, Sync/profile format-version bump, profile format change, remote code, telemetry or CSP relaxation. The two additive per-appearance darkness settings are backward-compatible and omitted from synchronized settings until initialized. Version identity is exactly `1.26.17.3` everywhere; there is no separate internal/display/technical version.

## 1.26.12

- Hardened automatic favicon recovery against compressed image "pixel-flood" inputs: known oversized PNG, GIF, JPEG, ICO/DIB and WebP dimensions are rejected before browser decoding, with the same pre-decode guard applied to safe SVG favicon geometry.
- Strengthened the local content-addressed image store: an existing asset ID is now reused only after exact-byte verification, missing/corrupt bytes are repaired atomically, and a valid-but-different value under the same ID fails closed instead of silently showing the wrong image.
- Kept normal writes fast by caching only already-verified live asset bytes in memory and pruning that cache with the live asset index.
- Added focused Firefox/Chrome regression coverage for pre-decode image bounds, WebP metadata parsing, SVG geometry checks, asset verification/repair and the existing atomic write path.
- No UI behavior, permissions, Sync/profile schema, localization strings or wallpaper/folder logic changed. Versioning is unified as `1.26.12` across both browser builds and public source metadata.

## 1.26.11

- Simplified the **Frequently visited** Settings section in Firefox and Chrome: when the Show toggle is off, the device-local options below it are now hidden completely.
- The **Number shown** selector and Frequently visited status line appear only while the feature is enabled, reducing visual clutter for users who do not use browser history suggestions.
- Centralized the visibility update so opening Settings, enabling/disabling the feature, permission failure and profile import all keep the toggle and dependent controls in sync.
- No permissions, Sync behavior, profile format, persisted schema, localization strings, appearance/wallpaper behavior or folder logic changed.
- Unified the release as `1.26.11` across Firefox/Chrome manifests, Chrome `version_name`, internal `VERSION`, Settings, build metadata, tests and package names.

## 1.26.10

- Added behavioral Firefox/Chrome regression tests for the complete 1.26.9 live appearance lifecycle. The tests execute the production preview/commit functions, switch Dark → Light with Settings open, verify the preview wallpaper changes immediately while the real `.page` background remains frozen, fire the real Settings `close` listener, flush its animation frame, and verify exactly one authoritative background commit plus preview cleanup.
- Added a reopen-before-animation-frame regression test proving a rapid Settings reopen suppresses a stale deferred real-background commit.
- Corrected the preview-layer documentation to describe the actual fixed DOM child rather than calling it a sibling; runtime layering is unchanged.
- Simplified the historical favicon-quality repair gate: removed the dead current-version allowlist and key the one-time repair directly from the old `previousVersion` range that actually determines whether the migration is needed. Behavior for supported upgrades is unchanged and now future releases do not need to edit an ever-growing version list.
- Kept the working 1.26.9 appearance/wallpaper runtime architecture, 1.26.6 folder extraction behavior, permissions, persistence paths, profile format, Sync schema and localization catalogs unchanged.
- Unified the release as `1.26.10` across Firefox/Chrome manifests, Chrome `version_name`, internal `VERSION`, Settings, build metadata, tests and package names.

## 1.26.9

- Completed live Light/Dark/System switching in both Firefox and Chrome: the matching configured light/dark wallpaper now changes immediately while Settings remains open instead of waiting for the dialog to close.
- Preserved the successful 1.26.5 Firefox compositor workaround by **not** repainting the real full-viewport `.page` background under an open Settings dialog. Live wallpaper feedback is rendered on a new paint-contained `appearancePreviewLayer` with a plain `<img>` surface, placed behind the shortcut canvas and outside the Settings top-layer surface; the Settings-open path never mutates the real `.page` CSS `background-image`.
- Centralized the safety boundary in `applyPageBackgroundVisual()`. Any Settings code path that reaches `applySettings()` while the dialog is open now routes its background/color work to the isolated preview layer rather than accidentally re-entering the original blank-dialog repaint path.
- The authoritative `.page` wallpaper is still committed on the existing animation frame after Settings closes, then the temporary preview layer is released. No extra persistence queue, background message, permission, schema, profile format or localization string was added.
- Kept the 1.26.6 folder extraction fix and 1.26.7 light/dark wallpaper-card visual refinement unchanged.
- Added Firefox/Chrome regression coverage proving live theme wallpaper preview, real-page isolation while Settings is open, paint-contained preview-layer structure, deferred authoritative commit, and continued absence of the failed 1.26.1-1.26.3 wallpaper persistence machinery.
- Unified the release as `1.26.9` across Firefox/Chrome manifests, Chrome `version_name`, internal `VERSION`, Settings, build metadata, tests and package names.

## 1.26.8

- Restored immediate Automatic/Light/Dark appearance switching while Settings is open in both Firefox and Chrome.
- Narrowed the 1.26.5 paint-safety workaround: `applyThemeSkinVisual()` now updates only the live theme skin (`data-theme`, `data-effective-theme`, `color-scheme`, and the selector) while Settings is open.
- Kept the proven wallpaper/background safety boundary intact. Potentially unsafe active day/night wallpaper/background repaints still defer until Settings closes and the next animation frame, preventing the blank/frozen Settings regression from returning.
- Kept the 1.26.6 folder extraction fix and the 1.26.7 Light/Dark wallpaper-card visual refinement unchanged.
- Added Firefox/Chrome regression coverage ensuring live theme switching cannot accidentally call the full page/background renderer while Settings is open.
- Unified the release as `1.26.8` across Firefox/Chrome manifests, Chrome `version_name`, internal `VERSION`, Settings, build metadata, tests and package names.

## 1.26.7

- Built on the working 1.26.6 stable candidate and kept the successful Settings appearance-isolation fix unchanged.
- Refined the separate light/dark wallpaper panel so the two appearance cards are visually distinct instead of looking almost identical. The **Light** card now sits on a brighter surface with a lighter preview frame, while the **Dark** card keeps a deeper surface and darker preview frame.
- Slightly enlarged the wallpaper thumbnails, softened the card corners and improved hover depth so the selector feels more deliberate and easier to read at a glance.
- Kept the 1.26.6 folder extraction fix intact: a shortcut can still be dragged from inside a folder back onto an empty main-grid slot, with correct folder collapse/repair behavior.
- Added Firefox/Chrome regression coverage locking the light/dark wallpaper card structure and the dedicated styling for both appearances.
- Unified the release as `1.26.7` across Firefox/Chrome manifests, Chrome `version_name`, internal `VERSION`, Settings, build metadata, tests and package names.

## 1.26.5

- Re-audited the complete light/dark-wallpaper regression from the clean 1.26.3 baseline instead of stacking another workaround on 1.26.4. The exact failure symptom is a paint failure, not a JavaScript/storage freeze: the selected option is saved and is present after Settings is closed/reopened while the already-open Settings surface loses its descendants.
- Settings now treats its own painted appearance as an isolation boundary. While Settings is open, appearance-mode changes and any active Light/Dark wallpaper change update the control/state and persist normally, but do **not** rewrite root theme/color-scheme/background styling underneath the open Settings dialog. The final appearance is applied on the animation frame after Settings closes.
- Removed the unsuccessful 1.26.1–1.26.3 special theme-wallpaper timing/storage machinery: no dedicated three-field storage writer, no background `mosaicsync:set-theme-wallpapers` message, no own-write signature bypass and no separate persistence queue. Theme-wallpaper settings again use the existing audited/debounced `saveState()` path with its normal optimistic rebase and Sync journal behavior.
- The 1.26.4 inline-wallpaper-gallery experiment is deliberately not retained. The visual Light/Dark wallpaper cards introduced in 1.26.3 remain because they are a useful UI improvement independent of the bug; the existing wallpaper gallery remains the single selector implementation.
- Added permanent Firefox/Chrome regression coverage proving that theme and active day/night wallpaper changes cannot call the outer appearance renderer while Settings is open, that deferred appearance commits only after the Settings close event plus a frame boundary, and that the failed special-case persistence machinery cannot return.
- Unified the release as `1.26.5` across Firefox/Chrome manifests, Chrome `version_name`, internal `VERSION`, Settings, build metadata, tests and package names. No permissions, state/Sync/profile schema, localization catalog, favicon resolver ordering or custom-wallpaper storage format changed.

## 1.26.3

- Moved separate light/dark wallpaper persistence fully out of the New Tab UI context. Settings now performs only immediate in-memory UI changes and sends a tiny `mosaicsync:set-theme-wallpapers` message; the background context owns the compact three-field storage/Sync transaction.
- Removed theme-wallpaper session render-cache rebuilding, render-manifest rebuilding, profile hydration and full-grid rerendering from the Settings persistence path. Exact own background writes are recognized with a lightweight Sync+local-asset echo signature so the UI does not rehydrate itself after its own write while unrelated concurrent edits still flow through normally.
- Replaced the Light/Dark native `<select>` controls with visual wallpaper cards and reused the existing MosaicSync wallpaper gallery for choosing each appearance. This removes the native-select/dialog repaint path, avoids translated-name truncation, and provides a real preview of the selected/fallback wallpaper.
- Bookmark-folder colors now fill the complete folder row/card instead of appearing only as a narrow accent. Text/icon contrast is selected from the chosen color and selected/hover states remain visible.
- Added the canonical `https://github.com/xipinformatica/mosaicsync` project link after MPL 2.0 and before Support in Settings and Welcome. `GitHub` is present in every one of the 32 UI catalogs.
- Added permanent cross-browser regression checks for background-context wallpaper persistence, no native theme wallpaper selects, own-write UI suppression, full-surface folder colors, GitHub link placement, localization completeness and unified `1.26.3` version surfaces.
- No new permissions, remote services, persisted schema versions or profile-format changes.

## 1.26.2

- Fixed bookmark-folder color palettes that were visible but inert inside the modal Bookmarks window. The palette is now attached to the active dialog before entering the Popover top layer, so color/reset clicks work in Firefox and Chrome; the assigned color is also made more visually obvious without modifying browser bookmark data.
- Replaced the 1.26.1 deferred full-profile wallpaper save with a dedicated compact settings-only transaction for `themeWallpapersEnabled`, `lightBackgroundPreset` and `darkBackgroundPreset`. Toggling the feature no longer normalizes, hashes or projects the hydrated shortcut/artwork profile.
- The compact wallpaper transaction still serializes with ordinary writes, preserves concurrent-tab edits through the established settings rebase, writes the durable outbound Sync mutation journal when Sync is active, and only rehydrates the active Space after an actual concurrent rebase.
- Added regression/performance coverage for modal palette ancestry/click persistence, the absence of `saveState()` from the theme-wallpaper path, compact Sync journaling/concurrent-settings preservation, and unified `1.26.2` version surfaces.
- No permissions, persisted schema versions, profile format, localization keys or remote services changed.

## 1.26.1

- Stabilized the new light/dark wallpaper controls: enabling the feature no longer performs immediate full-state persistence or preloads both theme wallpapers on the UI event path. Persistence is coalesced after repaint, and only a newly visible wallpaper is preloaded before display.
- Fixed Light/Dark wallpaper selectors being constrained by the legacy 84 px Settings select width. The controls now use their full column width in both Firefox and Chrome.
- Restored proper spacing between the light/dark wallpaper panel and the existing background action buttons.
- Fixed bookmark-folder color palettes being created underneath the modal Bookmarks dialog. The palette now uses a manual top-layer popover, with safe teardown and viewport positioning.
- Added permanent cross-browser regression checks for these UI integration failures. No permissions, Sync schema, profile format, or third-party services changed.

## 1.26.0

- Added synchronized light/dark built-in wallpaper choices. Each Space can follow appearance with separate preset IDs while custom wallpaper pixels remain device-local and the current background remains the fallback.
- Added a device-local default Space preference plus `Alt+Shift+1` / `Alt+Shift+2` switching between Personal and Work. This lets a work computer open directly into Work without synchronizing that device preference.
- Frequently Visited can now show 3, 5, 8 or 10 suggestions. Right-clicking a suggestion offers Open in new tab, Add shortcut, and Add to bookmarks. The count preference is included in `.mosaicsync` profile backup/transfer but remains outside browser Sync.
- Shortcut right-click now opens the shortcut in a background tab; middle-click retains native new-tab behavior. Editing remains available from the existing three-dot control.
- Bookmark folders can be assigned one of seven device-local colors from a right-click palette. Folder IDs are intentionally not synchronized or profile-transferred.
- Added browser-neutral, user-triggered bookmark creation restricted to normal HTTP(S) URLs. No new permissions were added; the existing optional bookmarks permission is still requested only from a user gesture.
- Added 11 localized UI strings across all 32 supported languages and removed the old fixed “up to five” Frequently Visited wording.
- State schema advances to 17 and Sync schema to 9 for the synchronized light/dark wallpaper selectors. Profile format remains v2.
- Added focused regression coverage for version consistency, synchronized theme-wallpaper settings, profile preference boundaries, mouse/keyboard interactions, localization completeness, bookmark URL safety and the deliberate absence of Unsplash/network wallpaper integration.

## 1.25.16.1

- Corrected the stale Settings version label left in the submitted 1.25.16 package.
- Unified the current release identifier as `1.25.16.1` across Firefox and Chrome manifests, Chrome `version_name`, the shared internal `VERSION`, Settings, build metadata, QA expectations and package filenames.
- Extended permanent regression coverage so a stale Settings/build version mismatch cannot ship again.
- Retains the 1.25.16 literal-import localization fix unchanged.
- No permissions, Sync/state/profile schemas, storage behavior, favicon behavior, localization content, or privacy behavior changed.

## 1.25.16

- Reworked lazy UI-locale loading so every dynamic `import()` target is a literal bundled module rather than a variable path, eliminating Mozilla Add-ons' “Unsafe call to import for argument 0” validator warning without changing locale behavior.
- Preserved the bounded locale catalog cache, automatic locale detection, 32-language coverage, Firefox/Chrome parity, and existing CSP/security boundaries.
- Added permanent regression coverage that rejects variable-path runtime imports in the locale loader.
- Public/internal browser version: `1.25.16`; Chrome `version_name`: `1.25.16`.
- No permissions, Sync/state/profile schemas, storage architecture, favicon behavior, or user-facing strings changed.

## 1.24.14m3

- Updated every in-extension Privacy link to the unified website anchor `https://xipinformatica.cat/mosaicsync/#privacy`.
- Updated every in-extension MPL 2.0 link to `https://xipinformatica.cat/mosaicsync/#license`.
- Added regression coverage so the retired `/privacy/` and `/license/` URLs cannot return in Welcome or either browser New Tab surface.
- No Sync, storage, permissions, profile, localization, favicon, or UI-layout behavior changed.
- Technical browser version: `1.24.14.15`; Chrome `version_name`: `1.24.14m3`.

## 1.24.14m2

Narrow visual-polish release on top of 1.24.14m1. The Welcome and Settings “Thank you!” mascot pills no longer use a physical 1 px rounded border, which could rasterize as two bright side pixels on some displays. All three surfaces now use an inset 1 px ring with compensated padding, preserving the approved geometry, hover/focus behavior, localization and light/dark appearance. No Sync, storage, profile, permission, localization, favicon, security or data-schema behavior changes.

## 1.24.14m1

EU localization expansion and localized-UI polish on the 1.24.14m runtime baseline. MosaicSync now ships complete 354-key UI catalogs and Firefox/Chrome store locale metadata for Bulgarian, Croatian, Estonian, Greek, Hungarian, Latvian, Lithuanian, Maltese, Romanian, Slovak and Slovenian, bringing the UI to 32 languages and covering all 24 official EU languages. Locale autodetection and Chrome platform wording cover every new locale, with catalog key/placeholder parity enforced by regression tests. The localized mascot greeting bubble now sizes to its text so longer Japanese/Korean greetings remain inside the bubble. Viewport-portaled help tooltips are made non-renderable before restoration to their Settings wrapper, preventing Firefox from painting a one-frame legacy-position tooltip during the base CSS fade transition. No Sync conflict, storage, profile, favicon, permission, CSP or persisted-schema behavior changes.

## 1.24.14m

Comprehensive self-audit hardening release. Multi-device record conflict resolution now treats `spaceMoveAt` as the live-record namespace-generation clock before ordinary `modifiedAt`, making `chooseNewerRecord` commutative, associative and idempotent for three-or-more-device folds while preserving deletion-vs-stale-edit protection and deliberate newer move-back semantics. Sync-relevant local writes now atomically persist a durable cumulative outbound-mutation journal; failed or interrupted publication is retried on startup/the Sync watch even when no remote revision changed, and conditional journal clearing cannot discard a newer local edit. Mutation timestamps advance beyond observed logical clocks to prevent far-future imported/skewed timestamps from pinning stale records. Dynamic Sync/icon/status warnings are localized through structured state across all 21 UI catalogs, Chrome no longer inherits Firefox-specific ten-minute timing copy, Polish/Swedish/Korean Space terminology is normalized, and duplicate English localization-source ambiguity is removed. The production snapshot decoder is now explicitly regression-pinned to its decompression ceiling, successful legacy migrations retire the obsolete pre-Spaces safety backup, and confirmed dead parameters/helpers/state are removed. Local asset GC, favicon resolver architecture, device-snapshot root-last publication, cross-Space transaction journaling, profile format, permissions and CSP remain intentionally unchanged.

## 1.24.14l

Fault-injection and storage-lifecycle hardening. Device-local content-addressed artwork cleanup is now crash/retry safe: stale pixels are recorded in a tiny retry ledger inside the same atomic state/index transaction and reclaimed on a later startup/write if the best-effort `storage.local.remove()` fails, while a fresh state re-read prevents deleting an asset that became referenced again. Device snapshot gzip decoding now enforces the 512 KiB decompressed ceiling while streaming instead of allocating the full decompressed payload first. Chunked device snapshots reclaim stale inactive-slot chunks before publishing and retire the previous generation only after the new root manifest commits, reducing Sync quota leakage without weakening root-last crash safety. New fault-injection tests cover failed local cleanup, re-referenced assets, decompression bounds, snapshot root-flip failure, stale chunk reclamation, and the intentional live cross-Space ID invariant. No Sync/profile/state schema, permission, CSP, localization, favicon discovery, or user-facing feature change.

## 1.24.14k

Hostile-state ID hardening. Workspace normalization now guarantees that every Sync-addressable record ID is unique across top-level shortcuts, folders, and folder children before records are flattened into the ID-keyed Sync Map. Invalid duplicate IDs are repaired without discarding otherwise-valid tiles, preventing a malicious/corrupt profile from silently collapsing one shortcut during Sync publication. Profile import/export additionally repairs duplicate record IDs across Personal and Work at the file boundary, without changing normal cross-Space Sync/reconcile identity semantics. The 1.24.14j favicon commit-failure retry behavior is unchanged and its regression test now also proves that such failures do not persist a false Sync error. No schema, permission, CSP, localization, or favicon resolver change.

## 1.24.14j

Commit-failure resilience follow-up on 1.24.14i. Proactive favicon networking still runs outside the serialized Sync/state queue, but a transient failure while committing a successfully resolved favicon is no longer misclassified as a stale target and deleted from the durable recovery queue. The failed commit now follows the existing retry/backoff path, preserving work across temporary `storage.local` failures without persisting a false Sync error. Additional regression coverage composes the real background `enqueue()` failure contract with the proactive batch engine on both browsers and verifies equal-clock Sync settings ties with distinct and missing device IDs. `chooseNewerRecord`, favicon resolver ordering, Sync/profile/storage schemas, permissions, CSP and localization are unchanged.

## 1.24.14i

Precision hardening after the 1.24.14h queue split. Proactive favicon recovery is now Space-aware at prune and commit time, so an in-flight Personal→Work move can retain useful recovery work while respecting the destination Space's own automatic-icon preference. Idempotent favicon rediscovery is recorded as unchanged success rather than stale/failure and avoids unnecessary local-state writes. Direct behavioral coverage now exercises the proactive batch engine, post-network queue re-reads, URL/deletion/permission staleness, Space moves, same-URL shortcut isolation, scheduler coalescing/concurrency, and same-field settings conflict convergence. No Sync/profile/storage schema changes and no new permissions or UI strings.

# Changelog

## 1.24.14h

Favicon queue/lifecycle optimization. Click-triggered favicon learning no longer performs remote/native icon resolution while holding MosaicSync's single serialized state/Sync mutation queue. Each job now uses a short serialized preflight, resolves browser/native and quality favicon candidates outside that queue, then commits through short serialized writes that re-read current state before applying. This preserves the existing optimistic rebase/deletion guarantees if a shortcut is edited, moved or deleted while networking is in flight. Repeated tab updates are coalesced per tab and the separate favicon-network work queue is capped at three concurrent jobs and at the existing pending-navigation bound. Firefox and Chrome retain the 1.24.14e resolver ordering and direct upgrades from technical 1.24.14 through 1.24.14.4 still receive the one-time quality repair. New tests prove a stalled favicon network request cannot block unrelated serialized work and that stale/deleted targets are not recreated. No user-facing strings, permissions, Sync/profile/storage schemas or favicon discovery rules change.

## 1.24.14g

Adversarial hardening follow-up on 1.24.14f. Read-only Sync status failures no longer persist a misleading durable Sync error, Firefox permission revocation now clears pending cross-Space journals consistently with the normal Sync-disable path, viewport-portaled help tooltips remove themselves if their original UI container disappears, and profile import rejects only absurdly large pre-parse inputs via a high abuse/OOM ceiling that remains independent of browser Sync quota. Local content-addressed projection now fails closed if two different image payloads ever resolve to the same asset ID within one transaction. The favicon-learning network phase is intentionally unchanged in this build and reserved for 1.24.14h review. New regression coverage targets same-shortcut concurrent edits, interrupted cross-Space replay semantics, asset-collision handling, profile pre-parse bounds, tooltip teardown, and read-only background error isolation.

## 1.24.14f

Final UI-polish follow-up on 1.24.14e. The Welcome and Settings Donate actions use the live MosaicSync Ko-fi target (`https://ko-fi.com/mosaicsync`); obsolete “donation page being prepared” UI/fallback strings are removed from every supported UI catalog. Help tooltips are temporarily portaled to a viewport-level layer while visible and clamped/flipped around window edges, preventing the Settings scroll container from clipping long localized Firefox Sync explanations. The 1.24.14e favicon resolver architecture is otherwise unchanged, while direct upgrades through technical 1.24.14.4 still receive its one-time learned-favicon quality recheck.

## 1.24.14e

General favicon-resolver stabilization after the 1.24.14b–d experiments. The fast first pass still shows browser-cached artwork or `/favicon.ico` immediately, but the quality pass now gives authoritative HTML/manifest-declared icons first access to the shared deadline. Guessed same-origin filenames run only afterward inside a small isolated fallback budget, so they can no longer delay CDN-hosted declared artwork such as news-site touch icons. The first intentional quality follow-up is due immediately instead of being counted as a 15-second failure backoff. Chrome reads its local `_favicon` cache before the optional Website Access gate, while a never-before-visited site is resolved independently from network metadata when Website Access is already granted. Existing 1.24.14–1.24.14d automatically learned favicons are rechecked once; no site-specific hostname/icon mapping is added.

## 1.24.14d

Chrome favicon-quality parity and Firefox manifest cleanup. Chrome's private `_favicon` endpoint remains the fast local fallback, but its requested 128px canvas is no longer treated as proof that the cached source is genuinely high resolution. Existing browser-native artwork (legacy `imageSourceKind: "firefox"`) is eligible for the same generic declared-site quality recovery used by resolver-learned favicons, including authenticated deep-link/root-art recovery. No site-specific mapping is added. Firefox no longer receives Chrome-only `version_name`, removing the temporary-extension manifest warning.

## 1.24.14c

- Fixed favicon quality recovery for authenticated deep-link shortcuts that redirect anonymous extension requests to a login provider.
- Quality retries now inspect the original site's public root for declared application icons before accepting artwork from the redirect destination.
- Keeps favicon discovery credentials-free and browser-neutral; no Google-specific host or icon URL is hard-coded.
- Re-checks existing automatically learned 1.24.14/1.24.14b favicons once after upgrade; user-uploaded artwork is never touched.


## 1.24.14b

Narrow favicon-quality follow-up on 1.24.14. The background quality-upgrade pass probes a small set of same-origin conventional high-resolution icon paths even when a valid but low-resolution `/favicon.ico` already exists, with `/icon.ico` first. This improves sites that publish application artwork at conventional static paths without changing the initial fast favicon lookup, privacy model (`credentials: "omit"`), permissions, Sync behavior, state/profile schemas, or unrelated favicon logic. 1.24.14c later extends the same quality retry for authenticated deep links whose anonymous page request redirects to a login provider.

## 1.24.14

Measured optimization/cleanup release. Mutation-time Sync quota refresh no longer performs the three category-specific `getBytesInUse` queries that are only needed when Settings requests a fresh usage breakdown. Image-heavy local writes and write-baseline projection share one short-lived per-operation asset-ID memo, avoiding repeated hashing of identical immutable data URLs while preserving exact content-derived identity; the memo is cleared before later UI/session work. Five confirmed unused browser-neutral symbols/wrappers are removed, and the missing reproducible worst-case benchmark fixture is restored. No Sync conflict semantics, quota enforcement, storage/profile schema, favicon behavior, permissions, localization or user-visible features change.


## 1.24.13

Small production-hardening release based on the 1.24.12 audited code. Atomic `storage.local` profile commits now surface a stable internal failure category without attempting unsafe partial persistence, and failed background silent writes roll back both in-memory and durable echo-suppression markers. The Firefox platform text adapter now exposes the same call signature as the Chrome overlay. No user-visible feature, permission, Sync schema, asset-store schema, profile format, favicon algorithm or UI behavior change is intended.

## 1.24.12

Security and correctness hardening release. MosaicSync now rebases stale New Tab writes onto the latest persisted profile so simultaneous edits in two open tabs do not silently overwrite unrelated changes. Disjoint shortcut, Space and settings edits are preserved; same-record conflicts continue to use MosaicSync's existing deterministic timestamp/tombstone rules.

Profile import now rejects checksum-valid v2 packages containing unreferenced asset payloads before expensive asset validation, remote SVG favicon rasterization uses a stricter self-contained SVG admission policy, image/asset identifiers are length-bounded before expensive processing, runtime message handling asserts same-extension senders as defense in depth, and permanent tests lock down CSP/XSS invariants plus cache bounds. The profile format, Sync semantics, permissions, UI, favicon discovery algorithm and content-addressed storage schema are unchanged.

## 1.24.11

Engineering-hardening release. Centralizes persistent/session keys and runtime tuning constants, bounds the remaining in-memory caches, caps pending shortcut-navigation bookkeeping, keeps only a small LRU of loaded locale catalogs, and adds programmatic dialog labels without changing the visual UI. The permanent regression suite now includes upgrade-chain migration, corrupt-asset/session-cache resilience, cache-bound, accessibility, storage-key-registry, and generated-build hash checks. The build pipeline emits a deterministic SHA-256 manifest for both browser trees. No Sync semantics, favicon retrieval rules, permissions, asset schema, `.mosaicsync` format, first-frame behavior, or user-facing features change.

## 1.24.9

Final optimization/stabilization pass. Adds allocation-light Sync record comparison, normalized-state fast paths for background Sync projection/replacement, lower-allocation write detection, expanded development-only background timing marks, and further shared-source consolidation for localization/import/onboarding. No user-visible features, permissions, Sync semantics, favicon algorithm, asset schema, or `.mosaicsync` format changes.

## 1.24.8

Engineering/stability release. Adds a permanent regression suite, reproducible performance benchmark and worst-case fixture, one shared Firefox/Chrome build pipeline, dev-only local performance marks, internal profile error codes, pure helper extraction from large runtime controllers, browser-parity/localization checks, and removal of direct English fallback strings from toast/status error paths. User-visible features, Sync semantics, favicon behavior, permissions, asset schema and `.mosaicsync` format v2 are unchanged.

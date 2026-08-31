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

The shared `firstPaint` projection contains the semantic fields used by startup accelerators. Step 2.1 now assigns clearer physical ownership: the shared `storage.session` snapshot is the cross-context fast structural projection and complete snapshots are published only from authoritative startup/persistence boundaries. The page localStorage render manifest remains a synchronous shortcut-grid fallback, but its runtime writers may publish only while the tab still matches shared session structural truth. Appearance/wallpaper retain their separate tiny hint cache for now.

Rules:
- Fast startup must be **fast + truthful**, never fast + knowingly wrong.
- `null`/missing optional data means “this layer has no opinion”; it must preserve an already-painted truthful value until authoritative state arrives.
- For Frequently Visited specifically, authoritative synchronized OFF is explicit (`enabled: false`, empty sites). Browser-derived site candidates are device-local/session-owned and are never serialized into the persistent localStorage render manifest; that persistent layer may retain only enable/count truth with an empty site list.
- Removal of the optional Top Sites permission writes a tiny session-only suppression tombstone as well as clearing any current session site projection. That tombstone survives a missing render snapshot and unrelated background state writes until Top Sites permission is granted again; it never mutates the synchronized preference.
- Complete shared session snapshots are published only from authoritative startup/persistence boundaries. Routine New Tab presentation updates may patch only the presentation field they own (currently Frequently Visited) and must not republish structural Space/grid state.
- Background contexts cannot synchronously rewrite a New Tab page's localStorage render manifest. A page may therefore refresh that persistent manifest only after proving its structural projection still matches current shared `storage.session`; delayed preview/artwork writers obey the same gate.
- Identical session acceleration snapshots are skipped only after the writer verifies that the actual shared `storage.session` bytes still match its local fingerprint; one extension context's memory is never treated as proof of shared-cache contents.
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

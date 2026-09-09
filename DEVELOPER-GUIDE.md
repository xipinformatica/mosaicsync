# MosaicSync Developer Guide

> **Start here if you are new to the MosaicSync codebase.**
>
> This guide explains how the repository is organized, how the application starts, where authoritative data lives, how Sync and Recovery differ, which files own the major behaviors, how Firefox and Chromium are kept aligned, and how to make changes without accidentally removing protections that exist for real historical bugs.
>
> This document is intentionally **not** a source of truth for release numbers, schema versions, storage keys, quotas, browser minimum versions, or other runtime constants. Those values remain authoritative in source code and manifests. The guide describes architecture and workflow.

---

## 1. What MosaicSync is

MosaicSync is a Manifest V3 browser extension that replaces the browser New Tab page with a customizable start page. It supports Firefox and Chromium-based browsers from one mostly shared codebase.

The product includes:

- shortcuts and folders;
- Personal and Work Spaces;
- wallpapers and Light/Dark appearance;
- automatic and user-selected shortcut artwork;
- Frequently Visited suggestions;
- bookmarks integration;
- profile import/export;
- browser-native synchronization;
- Recovery safety copies around normal Sync;
- deterministic build, test, smoke and release-certification tooling.

MosaicSync does **not** operate its own Sync or analytics backend. Synchronization uses the browser's extension Sync storage where supported. Browser-history-derived information and automatically learned browser artwork have intentionally restricted persistence rules; read the privacy and architecture documents before changing those boundaries.

Useful companion documents:

- [`README.md`](README.md) — project overview and normal build/test commands.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — contribution rules and pre-PR checklist.
- [`README-DEVELOPMENT.md`](README-DEVELOPMENT.md) — chronological engineering decisions and release-specific maintenance history.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — current ownership map and architectural invariants.
- [`docs/adr/README.md`](docs/adr/README.md) — Architecture Decision Records explaining why selected non-obvious boundaries exist.
- [`docs/REGRESSION-CATALOG.md`](docs/REGRESSION-CATALOG.md) — important historical failures and the tests that prevent them from returning.
- [`docs/MAINTENANCE-POLICY.md`](docs/MAINTENANCE-POLICY.md) — rules for changing the frozen architecture.
- [`PRIVACY.md`](PRIVACY.md) and [`SECURITY.md`](SECURITY.md) — privacy and security boundaries.

If you only have 30 minutes before touching code, read this guide, then `docs/ARCHITECTURE.md`, then the ADR that covers the subsystem you intend to change.

---

## 2. The first rule: edit `src/`, not `dist/`

The canonical application source lives under:

```text
src/
```

The browser runtime trees live under:

```text
dist/firefox/
dist/chrome/
```

`dist/` is **generated output**. Do not fix production behavior by editing files in `dist/` directly.

The build process combines the shared source with a small browser-specific overlay and regenerates both runtime trees. A manual `dist/` edit will either disappear on the next build or create a misleading source/runtime mismatch.

The deterministic build also writes:

```text
build-manifest.json
```

with hashes of the generated runtime files. Release packaging deliberately rebuilds before producing public artifacts so a stale `dist/` tree cannot become a release accidentally.

In short:

```text
Change src/  ->  build  ->  dist/ is regenerated  ->  test/package generated output
```

Never:

```text
Change dist/  ->  assume source now represents the fix
```

---

## 3. Repository tour

At the top level:

```text
src/          Canonical application source

dist/         Generated Firefox and Chromium runtime trees

tests/        Permanent regression, security, parity and correctness tests

tools/        Build, smoke, packaging, reachability and certification tools

fixtures/     Test fixtures

bench/        Deterministic performance benchmark

docs/         Architecture, ADRs, QA records, release history and maintenance notes

artifacts/    Generated release artifacts; not canonical source
```

### Shared production source

Most production behavior lives here:

```text
src/shared/
```

Important areas:

```text
src/shared/core/
    Browser-neutral data model, storage, profile import/export,
    permissions, i18n, image validation/processing and core utilities.

src/shared/background/
    MV3 background behavior, Sync, Recovery, remote favicon discovery,
    reset/recovery source policy and event-driven maintenance.

src/shared/newtab/
    New Tab HTML/CSS/application logic plus synchronous first-paint
    bootstrap helpers and startup projections.

src/shared/welcome/
    Welcome/onboarding page.
```

### Browser-specific source

Firefox-specific source:

```text
src/firefox/
```

Chromium-specific source:

```text
src/chrome/
```

These directories should remain small. Browser-specific behavior belongs there only when the browser APIs genuinely differ.

Examples include:

- manifests;
- background registration differences;
- Chromium's `browser` compatibility shim;
- Top Sites API argument differences;
- native/browser-cached favicon sources;
- Firefox-specific data-collection permission handling.

If a behavior can be browser-neutral, prefer the shared implementation.

---

## 4. The mental model: five layers

A useful way to understand MosaicSync is to think in five layers.

```text
1. UI / user intent
        |
        v
2. Shared model + authoritative local storage
        |
        +----> disposable startup/session projections
        |
        v
3. Normal browser Sync
        |
        v
4. Recovery safety generations

5. Browser adapters surround the shared code only where APIs differ
```

The most important architectural distinction is this:

> **The real saved profile and the fast startup caches are not the same thing.**

A cache may make the New Tab page appear immediately, but it is never allowed to become the authority for what the user actually owns.

If every disposable startup cache disappears, MosaicSync must still be able to reconstruct the correct profile from authoritative storage.

Beginning with **1.32.0.9**, cross-Space move intent follows the same semantic-intent/durable-authority split. Drag and shortcut-editor Space moves must always construct their `crossSpaceSyncIntent` from the actual user move, even if the New Tab's cached Sync metadata says Sync is not yet initialized. `persistNormalizedState()` owns the authoritative decision: it re-reads durable Sync meta under the existing write lock and persists the dedicated cross-Space journal only when Sync durability is active. This prevents opposite-direction moves from collapsing into one ambiguous cumulative journal while also ensuring a stale cached-ON page cannot resurrect Sync authority after durable disable/reset. Do not gate cross-Space intent construction on cached `meta.syncEnabled` or `meta.syncInitialized`.

Beginning with **1.32.0.10**, manual Recovery storage management is part of the Recovery lifecycle boundary. The UI may request a management model or a cleanup action, but it must never enumerate/delete raw Sync keys itself. `recovery-generation-lifecycle.js` owns which verified complete generations are eligible: safe cleanup may retire only superseded generations; one-copy deletion may never remove a device's newest verified complete generation; whole-device removal may target only a non-current device and only while the current device itself still owns a verified complete Recovery fallback. The background must take a fresh complete Sync view immediately before deletion and revalidate the original plan with `confirmedManualRecoveryCleanupKeys()`. All removal uses the existing expected-change-aware `removeSyncItems()` path. Incomplete/torn/orphan Recovery data, live layout/settings, Normal Sync pending journals, cross-Space journals and reset authority are outside this deletion contract. The manager is opened lazily from Settings and is not part of first paint.

Beginning with **1.32.0.8**, Welcome/setup source selection must preserve that same authority rule. “Start empty”, current-browser shortcut import and MosaicSync profile import are **provisional source candidates** until the source decision is resolved. They may be held in Welcome page memory, but they must not be written to authoritative `LOCAL_STATE_KEY` while a synchronized copy may still win. A candidate is committed only immediately before local-only completion or `bootstrap-local` after local authority has actually been selected. Choosing the synchronized copy discards the candidate without committing it. Imported device-local preferences travel with the provisional profile candidate and are applied only if that candidate wins. Do not solve setup conflicts by making `LOCAL_STATE_KEY` temporarily non-authoritative or by teaching the background to ignore selected local-state writes.

---

## 5. Where authoritative local state lives

Start with these files:

```text
src/shared/core/model.js
src/shared/core/storage.js
src/shared/core/constants.js
```

### `model.js`

`src/shared/core/model.js` owns the browser-neutral shape and semantics of MosaicSync state.

Among other things, it contains logic for:

- state normalization;
- workspace normalization;
- shortcut/folder normalization;
- stable record IDs and positions;
- settings normalization;
- logical modification clocks;
- tombstones for deletions;
- record comparison and merge behavior;
- flattening state into Sync records;
- rebuilding state from Sync records;
- cross-Space move intent;
- stable signatures used by concurrency/Sync logic.

High-value functions include names such as:

```text
normalizeState
normalizeWorkspace
workspaceStateNormalized
replaceWorkspaceNormalized
makeTombstone
makeSettingsRecordNormalized
chooseNewerRecord
mergeSettingsRecords
mergeRecordMaps
stateFromRecords
localStateSyncClockSignature
localStateSyncSignature
```

Do not bypass normalization when accepting untrusted, imported, synchronized or structurally modified state.

### `storage.js`

`src/shared/core/storage.js` owns local persistence and the separation between authoritative storage and disposable startup projections.

Important responsibilities include:

- reading and materializing local state;
- writing normalized local state;
- the cross-context persistence write lock;
- device-local asset hydration;
- active-Space persistence;
- local metadata;
- session render snapshots;
- session-only Frequently Visited projections;
- startup authority repair;
- first-paint cache publication.

Useful entry points include:

```text
ensureLocalStorage
readLocalStorageRaw
materializeLocalStorage
writeLocalState
writeLocalStateWithBaseline
readLocalMeta
writeLocalMeta
updateLocalMeta
writeActiveSpace
readSessionRenderCache
createRenderSnapshot
updateSessionFrequentlyVisitedSnapshot
```

A recurring MosaicSync rule is that structural state writes and startup projections must preserve causal ordering. Do not introduce an ad-hoc cache writer because it appears simpler. Several historical regressions came from stale async work publishing after newer user intent had already won.

### `constants.js`

`src/shared/core/constants.js` is the canonical home for many runtime constants and storage keys, including the canonical application `VERSION` used by release-contract validation.

Do not create second independent copies of version/schema/storage literals in documentation or maintenance tools unless the build intentionally generates them from the canonical source.

---

## 6. How New Tab startup works

The New Tab runtime is shared by both browsers.

The main files are:

```text
src/shared/newtab/newtab.html
src/shared/newtab/newtab.js
src/shared/newtab/newtab-critical.css
src/shared/newtab/newtab-secondary.css
```

Before the full module application becomes authoritative, a set of small startup helpers is used to create a fast and truthful first frame:

```text
appearance-bootstrap.js
frequent-geometry-bootstrap.js
local-storage-bootstrap.js
render-bootstrap.js
secondary-style-bootstrap.js
session-bootstrap.js
space-bootstrap.js
```

The exact startup implementation is performance-sensitive, but the conceptual flow is:

```text
Browser opens MosaicSync New Tab
        |
        v
Critical HTML/CSS is available immediately
        |
        v
Tiny synchronous/session startup projections may paint truthful known state
        |
        v
newtab.js loads authoritative local state
        |
        v
State is normalized/materialized
        |
        v
UI becomes fully interactive and authoritative
        |
        v
Background/Sync/device-local artwork updates reconcile afterward
```

The startup accelerators exist because a New Tab page is unusually sensitive to tiny visible delays. They are allowed to show known information early, but they are not allowed to invent truth.

Read:

- `docs/ARCHITECTURE.md`, section **First Paint**;
- `docs/adr/ADR-001-authority-vs-startup-caches.md`.

### Critical First Paint rule

Treat missing optional cache information as:

> "this cache has no opinion"

—not as permission to replace a truthful already-painted value with a placeholder.

For example, a shortcut already known to have artwork should not briefly become a fallback letter simply because a tiny startup preview is absent.

---

## 7. Where the New Tab UI and Settings live

The main interactive application is:

```text
src/shared/newtab/newtab.js
```

MosaicSync does **not** have a separate `src/shared/settings/` application. Settings is part of the shared New Tab UI and shares the same authoritative state and persistence mechanisms.

Use these files when changing New Tab/Settings behavior:

```text
src/shared/newtab/newtab.html
src/shared/newtab/newtab.js
src/shared/newtab/newtab-critical.css
src/shared/newtab/newtab-secondary.css
src/shared/newtab/bookmarks-controller.js
src/shared/newtab/ui-utils.js
src/shared/newtab/appearance-color.js
src/shared/newtab/builtin-icons.js
```

`newtab-critical.css` is especially sensitive because it participates in the first visible frame. Moving styling out of critical CSS can create a technically correct final UI that still flashes, shifts or paints incorrectly during startup.

### Bookmarks dialog ownership

Beginning with **1.32.0.3** (3rd Maintainability Journey, Step 5), the Bookmarks dialog UI has one dedicated New Tab owner:

```text
src/shared/newtab/bookmarks-controller.js
```

It owns:

- the Bookmarks dialog's mutable UI state (tree/folder/item projections and active folder);
- bookmark-folder color preference validation, persistence and visual application;
- folder/sidebar/search result rendering and bookmark-link DOM construction;
- the Bookmarks permission/read dialog lifecycle;
- Bookmarks-local button/search/dialog listeners and color-popover lifecycle.

It may read/write only the existing device-local bookmark-folder color preference in `localStorage`, and it may use the DOM elements/dependencies passed by `newtab.js`. Browser bookmark data remains browser-owned and is read through the existing lazily loaded `core/bookmarks.js` API; it is not copied into MosaicSync authoritative state or Sync.

The module must **not** own or depend on:

- `storage.local` / `storage.sync` profile persistence;
- Normal Sync or Recovery;
- startup/session render caches or first-paint bootstrap modules;
- network/image fetching;
- background scheduling, alarms or queues;
- platform-specific browser branching.

`newtab.js` remains the orchestrator for first-paint/startup, global pointer/Escape coordination, the lazy browser-Bookmarks module loader and cross-feature actions such as Frequently Visited's explicit “Add to bookmarks” command. The browser Bookmarks module remains dynamically imported only when needed.

Beginning with **1.32.0.5** (Journey-3 Step 6), the controller's external contract is intentionally smaller: `open()` is private to controller-owned `bind()` wiring, while the orchestrator receives only the methods it actually coordinates (`bind`, global color-menu close/outside handling, and localized refresh). Bookmark-folder colors have one canonical preference read inside `loadBookmarksIntoDialog()`, immediately before an allowed/readable bookmark tree is rendered. The temporary Step-5 post-paint hydration seam was proven redundant and removed, so a New Tab that never opens Bookmarks performs no bookmark-folder-color `localStorage` read. Localized refresh also calls `renderBookmarkBrowser()` only once; that function already owns sidebar rebuilding.

This controller is part of the static New Tab module graph, so keep its top-level work trivial and do not add awaits or side effects to module evaluation. Permanent protection lives in `tests/bookmarks-controller-132003.test.mjs`, `tests/contract-simplification-13205.test.mjs`, the bookmark color/secondary-style historical regressions, and the generated New Tab runtime smoke, which opens the Bookmarks dialog on both Firefox- and Chrome-shaped runtimes. The boundary exists so a developer can audit the Bookmarks UI without first reading the full New Tab orchestrator.

Settings has another important boundary: while Settings is open, lightweight Light/Dark preview presentation may update immediately, but full-page wallpaper/background/dim painting is deliberately isolated/deferred to avoid a historical Firefox compositor failure.

Before changing that behavior, read:

```text
docs/adr/ADR-007-settings-appearance-isolation.md
```

---

## 8. Normal Sync: what it is and where to start

The central background implementation is:

```text
src/shared/background/background-core.js
```

This file is intentionally large because the background runtime coordinates many event-driven responsibilities around one serialized mutation queue. Do not split it merely because of its size; the maintenance policy requires a concrete reason before changing a frozen ownership boundary.

The shared background entry point is tiny:

```text
src/shared/background/background.js
```

It imports a browser-specific `background-adapter.js` and passes it to:

```text
startBackground(adapter)
```

in `background-core.js`.

### Normal Sync owns

Normal Sync is responsible for the live synchronized MosaicSync profile:

- layout records;
- settings records;
- independent record/field convergence;
- tombstones/deletions;
- cross-device conflict semantics;
- live device snapshots used by the established design;
- quota-aware publication behavior;
- bootstrap and ongoing reconciliation.

Useful supporting files include:

```text
src/shared/background/sync-source-policy.js
src/shared/background/sync-reset-policy.js
src/shared/background/sync-remote-observation.js
src/shared/background/sync-pending-journal.js
src/shared/background/runtime-utils.js
```

### Remote observation / applied-state ownership

Beginning with **1.32.0.1** (3rd Maintainability Journey, Step 2), remote Sync observation/applied-state bookkeeping has one dedicated browser-neutral owner:

```text
src/shared/background/sync-remote-observation.js
```

It exists to answer a narrow question: **how should already-read remote Sync metadata be interpreted and reflected in local observation/applied-state bookkeeping?**

It owns:

- conversion of dataset commit/fingerprint metadata into the stable revision string used by Normal Sync;
- the small `remoteCoreUsable()` structural predicate used by observation/status policy;
- receipt/provenance bookkeeping for newly observed remote cores;
- `lastApplied*Revision` bookkeeping for Personal, Work and device Recovery-generation revision markers;
- selection of the latest Personal/Work origin descriptor used by Sync status presentation.

It may **read only the objects passed to it by the caller** and may **return updated metadata objects**. It does not persist those objects itself.

It must not depend on:

- `browser` / Chrome APIs;
- `storage.local` or `storage.sync`;
- Sync publication/writes;
- Recovery storage/generation logic;
- durable pending journals;
- alarms, timers, queues or MV3 event listeners;
- New Tab / DOM code.

The module is synchronous. It adds no storage/network work and no additional Promise/`await` layer. It is on the Normal Sync decision path, but **not** the New Tab startup/first-paint path. `background-core.js` remains the effectful orchestrator and decides when observations are persisted, when reconciliation occurs and when Sync/Recovery effects run.

Permanent protection lives in `tests/sync-remote-observation-13201.test.mjs` plus the existing Sync/Recovery corrective tests, especially `corrective-1301842.test.mjs` and distributed/convergence tests. The boundary exists to make provenance/applied-state policy independently auditable without splitting the actual reconciliation state machine or adding runtime work.

### Durable pending Sync journal ownership

Beginning with **1.32.0.2** (3rd Maintainability Journey, Step 3), the safe background-side durable pending Normal Sync journal mechanics have one dedicated owner:

```text
src/shared/background/sync-pending-journal.js
```

It owns **how already-authorized durable retry intent is stored, validated, enumerated and cleared** in the background process:

- the cross-Space transaction journal schema-version constant;
- validation and deterministic oldest-first enumeration of pending cross-Space intent/transaction records;
- background-side writes that upgrade/advance an existing cross-Space journal;
- clearing one or all validated cross-Space journal records;
- validation/read of the cumulative local-mutation journal;
- journal-ID-protected clearing of the cumulative local-mutation journal so an older successful retry cannot delete newer work;
- combined authority-transition cleanup of both durable retry journals;
- construction of cross-Space journal storage keys.

The module may read or write only the existing pending-journal keys in `storage.local`. Cross-Space enumeration intentionally retains the existing single `storage.local.get(null)` read because those journal records are prefix-addressed and may have independent intent IDs. It must preserve the **1.31.5 fail-closed rule**: a rejected journal read/remove means durable retry authority is unknown or uncleared and the error must remain visible to the caller.

Beginning with **1.32.0.4**, journal mutation/acknowledgement and authority-transition cleanup also participate in the existing cross-context local persistence Web Lock (`LOCAL_ASSET_WRITE_LOCK_NAME`; the historical string is retained for rolling-version compatibility). A conditional local-journal clear must hold this lock from journal read through removal. Combined authority cleanup must enumerate while locked and remove the validated cross-Space keys plus the cumulative local-mutation key in one `storage.local.remove([...keys])` operation. Authority-changing callers keep the metadata commit inside that same serialized transition by calling `writeLocalMeta(..., { persistenceLockHeld: true })`; this narrowly-scoped path skips a second request for the already-held, non-reentrant Web Lock. If that metadata commit fails after cleanup, the journal owner restores the exact removed durable authority snapshot before releasing the lock (compensating I/O occurs only on that failure path). `core/storage.js` reuses its existing locked transaction read to observe `LOCAL_META_KEY` whenever pending Sync intent is requested, so a stale New Tab may persist its local edit but must not recreate outbound journal authority after durable Sync became disabled/uninitialized. Do not replace this with an unlocked read→compare→remove sequence or add a second hot-path meta read.

Two responsibilities explicitly **do not belong** to this module:

1. **Initial journal creation remains in `src/shared/core/storage.js`.** The authoritative local profile and its corresponding cross-Space intent or cumulative local-mutation retry record are committed in the same `storage.local.set(...)` transaction. Splitting that write would create a crash window or add another browser-storage operation, so Journey 3 deliberately leaves this ownership untouched.

Beginning with **1.32.0.6**, bootstrap orchestration has explicit concurrency obligations. `bootstrapRemote()` must pass the local profile captured at entry as the persistence `baseState` and must continue from the actual state returned by that rebasing write; a long-running Restore/await-remote operation is never allowed to overwrite a New Tab edit that committed after its baseline. `bootstrapLocal()` and `bootstrapRemote()` may acknowledge only a cumulative pending local-mutation journal whose `after` Sync signature matches the state captured at entry, and only by that exact `journalId`. They must never perform a late unconditional clear because a newer New Tab may have replaced durable retry authority while Sync publication was in flight. During first `await-remote` initialization there is also a short authority handoff after the merged state is committed but before durable meta becomes initialized; immediately after initialization the bootstrap must recheck the compact authoritative local Sync signature and sweep any edit from that unjournaled interval into publication. 1.32.0.7 closes the residual case where an already-open New Tab had not yet observed that durable handoff; see the persistence-boundary rule immediately below. These are orchestrator responsibilities; the journal module continues to own safe conditional storage mechanics.
2. **Retry/publication orchestration remains in `background-core.js`.** The core still decides when to replay pending work, preserves destination-first cross-Space publication, performs `storage.sync` writes, publishes complete profile generations, reconciles remote state, updates metadata and schedules alarms.

Beginning with **1.32.0.7**, New Tab callers must treat `recordSyncMutation` as **semantic Sync eligibility**, not as a cached answer to whether Sync authority is active. Genuine user mutations pass eligibility independent of the page's potentially stale `meta.syncEnabled` / `meta.syncInitialized` cache; device-local/cache-only writes and dedicated cross-Space journal writes remain explicitly excluded as before. `core/storage.js` is the authority boundary: inside the existing persistence write lock it re-reads durable `LOCAL_META_KEY` and only creates the cumulative pending journal when durable Sync authority is actually enabled and initialized. This closes the asynchronous `storage.onChanged` handoff window without adding another bootstrap reread or journaling remote/device-local internal writes.


The journal module must not depend on:

- `storage.sync` or any Sync publication writer;
- Recovery generation/store/lifecycle modules;
- reconciliation/source-selection policy;
- alarms, timers, queues or MV3 event registration;
- network/image code;
- New Tab / DOM code;
- `core/storage.js` as a persistence service.

This module is on the Normal Sync retry/publication path and authority-transition cleanup path, but **not** on New Tab startup/first-paint. The extraction adds no storage read/write compared with 1.32.0.1: existing I/O calls moved with their helpers. `background-core.js` passes its existing `SPACE_IDS_FOR_SYNC` set into journal enumeration so the extraction does not allocate a second space-lookup structure.

Permanent protection lives in `tests/sync-pending-journal-13202.test.mjs`, the 1.31.5 fault-injection tests in `tests/corrective-1315.test.mjs`, the 1.32.0.4 deterministic concurrency/fault tests in `tests/corrective-13204.test.mjs`, the cumulative-journal/cross-Space tests in `tests/hardening-12414m.test.mjs`, and the existing runtime Sync scenarios. The boundary exists to make durable retry authority independently auditable **without** moving the atomic local-write contract or the Sync state machine.

### The most important Sync principle

> **Recovery must not decide ordinary Sync conflicts.**

Normal Sync is the primary synchronization algorithm. Recovery is a safety mechanism around it.

When working on Sync, read these ADRs first:

```text
docs/adr/ADR-004-recovery-vs-normal-sync.md
docs/adr/ADR-005-catastrophic-loss-confirmation.md
docs/adr/ADR-006-intentional-reset-authority.md
```

Also search `docs/REGRESSION-CATALOG.md` and the corrective tests for previous Sync incidents before changing apparently defensive code.

### Deletions are data

A tombstone is not merely the absence of a record. It carries information that an item was intentionally deleted.

When comparing remote sources, snapshots or restore candidates, visible-record equivalence is not automatically semantic equivalence if one source still carries authoritative deletion information.

Do not "simplify" source comparison by considering only records currently visible in the UI.

### Durable outbound journals fail closed

Normal Sync uses durable `storage.local` journals for cumulative local mutations and cross-Space transactions. These journals are retry authority, not disposable caches. A failed journal read must therefore never be interpreted as an empty journal/`null` pending mutation, and an authority-changing operation such as Sync disable or intentional-reset cleanup must not proceed if journal cleanup could not be verified. Successful storage reads may prove that no journal exists; storage failures only prove that the state is unknown.

As of 1.32.0.2, `background/sync-pending-journal.js` owns background-side validation/read/advance/clear mechanics, while `core/storage.js` still creates initial retry intent atomically with authoritative local state and `background-core.js` still decides when work is retried/published. As of 1.32.0.4, both sides share the same named persistence lock for journal mutation/acknowledgement. Authority transitions hold that lock across combined journal cleanup and their metadata commit, using the explicit already-held-lock `writeLocalMeta` option to avoid a nested non-reentrant Web-Lock request; if the metadata commit fails, removed journals are restored before unlock. The local writer also revalidates durable Sync authority using its already-existing transaction read. Do not collapse these three responsibilities into one module merely for structural symmetry.

This invariant prevents a second publication from starting over an unreadable earlier transaction and prevents stale pre-transition retry state from surviving a supposedly completed authority change. Preserve the existing journal schemas and idempotent publication order unless a demonstrated defect requires otherwise.

---

## 9. Intentional Sync reset is authoritative

MosaicSync has explicit reset behavior for cases where synchronized state is intentionally cleared/restarted.

The reset path is security/safety-sensitive because an old remote copy may still be visible transiently while browser Sync propagates changes.

Start with:

```text
src/shared/background/sync-reset-policy.js
src/shared/background/background-core.js
```

and read:

```text
docs/adr/ADR-006-intentional-reset-authority.md
```

The key principle is:

> **Once a valid intentional reset has authority, stale pre-reset data must not bootstrap itself back into authority.**

This rule applies especially to fresh/uninitialized installations, delayed browser-Sync delivery and quota-pressure staging.

Do not reorder bootstrap/reset checks without a regression that demonstrates the intended authority ordering.

---

## 10. Recovery: safety layer, not Sync 2.0

Recovery exists to protect against catastrophic/incomplete synchronized state. It stores complete Personal + Work safety generations around normal Sync.

The Recovery subsystem is deliberately divided into focused owners:

```text
src/shared/background/recovery-generation-format.js
    Representation and validation of immutable Recovery generations.

src/shared/background/recovery-generation-store.js
    Storage, publication, verified reads and generation selection.

src/shared/background/recovery-generation-lifecycle.js
    Retention, cleanup and lifecycle policy.

src/shared/background/recovery-continuity.js
    Catastrophic-loss continuity/restart behavior.

src/shared/background/sync-source-policy.js
    Coherent Restore/atomic-source selection policy.
```

The main background coordinator still calls these owners from:

```text
src/shared/background/background-core.js
```

### Recovery invariants

- Recovery is a **consumer** of valid profile state, not a competing merge engine.
- Recovery failure may reduce safety coverage; it must not corrupt valid normal Sync state.
- Publication is immutable/chunks-first/root-last according to the established design.
- Cleanup must preserve independently verified fallback evidence.
- Catastrophic-loss decisions require the established confirmation/grace rules.
- Quota-pressure cleanup must not erase the very live-core evidence Recovery uses to decide whether the cloud is catastrophically empty.

Before changing Recovery, read ADR-004 and ADR-005 and run the Recovery test group.

---

## 11. Browser adapters: keep browser differences at the edge

MosaicSync follows a shared-core/small-adapter design.

### Shared Firefox-default platform module

```text
src/shared/core/platform.js
```

This is copied into both builds, then Chromium replaces the platform module with:

```text
src/chrome/core/platform.js
```

Examples of intentional differences include Top Sites behavior:

- Firefox can use Firefox-shaped options for `topSites.get(...)`.
- Chromium's API accepts no Firefox-style options object.

That difference belongs in the platform adapter, not in shared New Tab logic.

### Background adapters

```text
src/firefox/background/background-adapter.js
src/chrome/background/background-adapter.js
```

They provide capabilities such as:

- browser-cached favicon lookup;
- tab-native favicon resolution;
- protected-URL handling;
- optional permission behavior;
- platform-specific reset/data-collection policy.

The shared coordinator validates the adapter and then uses those capabilities without hard-coding Firefox/Chromium behavior throughout the Sync/Recovery core.

Before changing this boundary, read:

```text
docs/adr/ADR-003-shared-core-browser-adapters.md
```

A historical regression leaked Firefox Top Sites arguments into Chromium even though most tests still passed. This is exactly why generated browser/parity tests exist.

---

## 12. Chromium's `browser` shim

Shared MosaicSync code uses the `browser` API shape.

Chromium receives:

```text
src/chrome/core/browser-shim.js
```

During build, `tools/build.mjs` also injects the Chromium shim into the generated New Tab HTML before the shared bootstrap scripts run.

Do not manually add the shim to the canonical shared `newtab.html`. The build owns that browser-specific transformation and tests protect it.

---

## 13. Artwork and favicon pipeline

Artwork spans several layers and has important privacy rules.

Relevant production files include:

```text
src/shared/background/background-core.js
src/shared/core/image-data.js
src/shared/core/image-limits.js
src/shared/core/image-optimizer.js
src/shared/core/image-worker.js
src/shared/core/local-assets.js
src/shared/core/svg-safety.js
src/shared/newtab/builtin-icons.js
src/shared/core/platform.js
src/*/background/background-adapter.js
```

The background core owns much of the automatic favicon discovery/recovery pipeline, including bounded remote fetches, page icon discovery, native browser-cache fallback, quality decisions and proactive recovery jobs.

### Privacy boundary

Automatically learned site artwork and browser-derived Frequently Visited information are device-local unless an existing explicit user-data path says otherwise.

User-selected artwork may synchronize according to the existing quota/storage policy.

Read:

```text
docs/adr/ADR-002-device-local-browser-derived-data.md
PRIVACY.md
```

Do not "improve Sync" by sending browser-history-derived artwork or Frequently Visited candidates across devices.

### Remote image safety

Remote images cross an untrusted network/data boundary. Existing code deliberately uses:

- HTTP(S)-only validation;
- bounded response reads;
- deadlines/timeouts;
- MIME/content checks;
- image dimension limits;
- SVG safety rules;
- cancellation/abort paths;
- local optimization before persistence where appropriate.

Do not replace bounded streaming with an unbounded `arrayBuffer()`/`blob()` convenience path without proving equivalent limits.

---

## 14. Frequently Visited

Frequently Visited looks like ordinary shortcut UI but has different data ownership.

The synchronized profile stores the relevant user preference/configuration. The browser-derived candidate sites themselves are device-local/session-owned.

Relevant areas include:

```text
src/shared/newtab/newtab.js
src/shared/newtab/frequent-geometry-bootstrap.js
src/shared/core/storage.js
src/shared/core/platform.js
src/*/core/platform.js
```

Important rules:

- browser-derived site candidates do not become synchronized profile content;
- persistent localStorage first-paint data may retain only safe enable/count truth, not browser-history site candidates;
- session projections own device-local FV candidates;
- removing Top Sites permission clears/suppresses current device-local presentation without silently changing the synchronized preference;
- first-frame geometry is reserved early so shortcut rows do not visibly jump when FV appears;
- favicon-bearing FV cards should not become visible in an intermediate missing-artwork state.

Several tests exist specifically because these details caused visible startup regressions in the past.

---

## 15. Profile import/export is a trust boundary

Start with:

```text
src/shared/core/profile.js
src/shared/core/importer.js
src/shared/core/http-url-safety.js
src/shared/core/image-data.js
src/shared/core/svg-safety.js
```

Profile files and imported data must be treated as untrusted input.

Existing protections cover issues such as:

- package shape/version validation;
- maximum input size;
- normalization before persistence;
- hostile object keys/prototype-pollution concerns;
- unsafe URL rejection;
- untrusted/oversized image handling;
- asset-envelope integrity.

Never let imported raw objects become authoritative simply because they came from a MosaicSync-looking file.

---

## 16. Localization

Runtime UI localization source catalogs live under:

```text
src/shared/core/i18n-locales/
```

The English catalog defines the expected key set. `tools/build.mjs` validates that all source locale catalogs have matching keys and generates compact runtime catalogs.

Manifest locale strings are separately sourced from:

```text
src/shared/manifest-locales.json
```

and generated into browser `_locales/` directories during build.

Rules:

- New user-facing text must go through the locale system.
- Layouts that contain translated labels must tolerate long words and expanded translations; do not shorten a translation merely to hide a responsive-layout defect. Prefer resilient wrapping/grid ownership and cover representative long translations with regression tests.
- Do not add an English-only fallback directly in a UI path and consider localization finished.
- Do not manually edit generated runtime locale files under `dist/`.

Use the localization and hardcoded-UI tests when changing visible strings.

---

## 17. Permissions and privacy

Current permissions are intentionally minimized and optional capabilities remain optional where possible.

Browser manifests live at:

```text
src/firefox/manifest.json
src/chrome/manifest.json
```

Shared permission policy lives under files such as:

```text
src/shared/core/permissions.js
src/shared/core/permission-platform.js
src/shared/core/platform.js
```

with browser overlays where needed.

Before adding or broadening a permission:

1. prove the product requirement cannot be met safely with the existing surface;
2. check both Firefox and Chromium behavior;
3. review `PRIVACY.md`;
4. add positive and negative tests;
5. update relevant documentation/store disclosures.

Do not broaden permissions merely to make an implementation easier.

---

## 18. Concurrency and event-driven MV3 behavior

The background runtime is an MV3 event-driven environment. It can suspend and restart. New Tab pages and the background worker can also observe/write storage concurrently.

Important files include:

```text
src/shared/core/concurrency.js
src/shared/core/storage.js
src/shared/background/background-core.js
src/shared/background/runtime-utils.js
```

The project deliberately uses serialized mutation paths, cross-context locking, durable expectation/signature state and re-read-before-destructive-action patterns in places where ordinary in-memory assumptions are unsafe.

Do not assume:

- one JavaScript context owns all writes;
- an in-memory flag survives MV3 worker restart;
- a storage event is necessarily remote;
- matching timestamps prove two payloads are identical;
- a read taken before an `await` is still current afterward;
- a local cache fingerprint proves shared `storage.session` still contains the same bytes.

If code looks more defensive than a normal single-page application, first search the regression catalogue and historical corrective tests. Much of that defense is there because a simpler version already failed.

---

## 19. Build system: how shared source becomes two extensions

The canonical build command is:

```bash
npm run build
```

which executes:

```text
tools/build.mjs
```

Conceptually the build does this:

```text
src/shared
   |
   +---------------------------+
   |                           |
   v                           v
Firefox generated tree     Chromium generated tree
   ^                           ^
   |                           |
src/firefox overlay        src/chrome overlay
                               |
                               +-- browser shim / Chrome-specific platform
```

The build also performs deterministic generated steps such as:

- browser locale generation;
- compact runtime locale catalogs;
- bootstrap configuration generated from canonical constants;
- Chromium New Tab shim injection;
- runtime data preparation;
- file hashing into `build-manifest.json`.

When changing build behavior, preserve deterministic output and browser parity unless a real browser difference requires divergence.

---

## 20. Tests: where the 1,000+ checks actually live

Tests are real source files under:

```text
tests/
```

They are part of the GitHub/source package. They are **not** injected from memory and they are not shipped in the normal Firefox/Chrome runtime ZIPs.

A single `.test.mjs` file may contain many individual Node test cases, which is why the total test count is much larger than the number of files.

The release-authoritative regression command is:

```bash
npm test
```

It rebuilds both browser trees and then runs:

```text
tests/*.test.mjs
```

Targeted groups exist for faster development feedback:

```bash
npm run test:groups
npm run test:startup
npm run test:newtab
npm run test:sync
npm run test:recovery
npm run test:security
npm run test:browser
npm run test:core
npm run test:release
```

These groups are convenience subsets. They do **not** replace full `npm test` for release confidence.

### Correct way to fix a bug

For an important reproduced defect, prefer this sequence:

```text
1. Reproduce the bug with a focused regression test.
2. Prove that test fails against the unfixed source.
3. Make the smallest production correction.
4. Prove the focused regression now passes.
5. Run relevant subsystem groups.
6. Run the full suite.
7. Run browser/release certification appropriate to the change.
8. Keep the regression permanently.
```

Do not weaken, delete or rewrite a failing historical regression merely to make the suite green unless you can prove that the old invariant is intentionally obsolete.

### Historical tests are intentional

Many filenames contain old version numbers, for example:

```text
corrective-1301811.test.mjs
corrective-1301838.test.mjs
corrective-1311.test.mjs
```

Those names identify the release/incident that caused the test to be added. They are permanent regression history, not stale tests that should be renamed to the current version.

---

## 21. Real-browser smoke tests

Node tests cannot reproduce every browser lifecycle/API/rendering failure. MosaicSync therefore has real-browser smoke tooling.

Useful commands:

```bash
npm run smoke:probe
npm run smoke:firefox
npm run smoke:chrome
npm run smoke:browsers
```

`smoke:probe` reports which supported browser/driver binaries are available.

The real-browser lanes use isolated temporary profiles. They do not reuse the developer's normal browser profile or production MosaicSync data.

Do not silently convert a missing browser/driver into a successful full certification. If the real-browser gate cannot run, use the explicit mechanical certification level instead.

---

## 22. Release certification

The canonical full certification command is:

```bash
npm run certify
```

A constrained environment that genuinely cannot launch the required browsers may run:

```bash
npm run certify:mechanical
```

but that result is intentionally **not** equivalent to full browser certification.

The certification pipeline is designed to build confidence in layers:

```text
canonical build
    |
full regression suite
    |
runtime reachability
    |
real Firefox + Chromium smoke
    |
performance benchmark / size checks
    |
generated release contracts
    |
deterministic public packaging
    |
packaged release contracts
    |
clean-source ZIP extraction
    |
rebuild + retest + repackage in clean tree
    |
byte-for-byte artifact comparison
```

Full release certification is fail-closed. A failed required gate is a failed certification, not a warning that may be ignored.

Read:

```text
docs/adr/ADR-008-deterministic-release-certification.md
```

---

## 23. Packaging and what goes into each ZIP

Public packaging is owned by:

```text
tools/package.py
```

The normal public release produces three artifacts:

```text
mosaicsync-<version>-firefox.zip
mosaicsync-<version>-chrome.zip
mosaicsync-<version>-github-ready.zip
```

### Firefox and Chrome ZIPs

The browser ZIPs are built from the corresponding generated `dist/` runtime tree. Development documentation and the `tests/` directory are therefore not installed into users' browsers.

### GitHub-ready source ZIP

The source ZIP contains the source repository material required for review/development, excluding generated artifact/output/temp/cache classes defined by `tools/package.py`.

A root document such as `DEVELOPER-GUIDE.md` belongs in the GitHub/source package but not in the installed Firefox/Chrome extension.

Packaging is deterministic: entry order, timestamps, paths and compression behavior are controlled so clean-room reproduction can compare release artifacts byte-for-byte.

---

## 24. Performance and size

New Tab startup performance is a product requirement, not merely a benchmark concern.

Useful commands:

```bash
npm run bench
npm run size
```

Do not "simplify" first-paint/startup code by moving work onto the critical path without measuring the result.

Likewise, do not chase tiny line-count or package-size reductions if they remove a correctness boundary or make future maintenance harder. Use the size/performance gates as evidence, not as aesthetic targets.

---

## 25. Security-sensitive areas

Treat these areas as high-risk and require focused regression evidence:

- profile import and parsing;
- arbitrary/remote image fetching;
- SVG handling;
- URL validation/navigation;
- Sync record decoding/merging;
- Recovery generation validation;
- browser permissions;
- storage object construction and hostile keys;
- cross-context concurrency;
- release/package integrity.

Relevant tests include dedicated security, hardening, import, profile, fault-injection and property/fuzz suites.

When reviewing a change, ask not only "does the happy path work?" but also:

> What untrusted input, stale async operation, interrupted write, partial browser-Sync delivery or MV3 restart could reach this path?

---

## 26. "I want to change X — where do I start?"

Use this table as a navigation map.

| Goal | Start with | Also read/test |
|---|---|---|
| Change shortcut/folder data semantics | `src/shared/core/model.js` | core + Sync tests |
| Change local persistence | `src/shared/core/storage.js` | startup/core/Sync tests; ADR-001 |
| Change New Tab behavior | `src/shared/newtab/newtab.js` | `newtab.html`, CSS, `test:newtab` |
| Change Settings behavior | `src/shared/newtab/newtab.js` | appearance/UI tests; ADR-007 if visual appearance is involved |
| Change first-frame/startup rendering | `src/shared/newtab/*bootstrap*.js`, `newtab-critical.css`, `storage.js` | startup tests, benchmark, ADR-001 |
| Change Sync merge/convergence | `src/shared/background/background-core.js`, `model.js` | `test:sync`, ADR-004/005/006 |
| Change remote Sync observation/applied-state policy | `src/shared/background/sync-remote-observation.js` | `test:sync` + `sync-remote-observation-13201.test.mjs`; background core remains effect owner |
| Change Restore source selection | `src/shared/background/sync-source-policy.js` | Sync + Recovery tests |
| Change intentional Sync reset | `src/shared/background/sync-reset-policy.js`, `background-core.js` | Sync/Recovery tests; ADR-006 |
| Change Recovery format | `recovery-generation-format.js` | Recovery tests; ADR-004/005 |
| Change Recovery storage/publication | `recovery-generation-store.js` | Recovery tests |
| Change Recovery retention/lifecycle | `recovery-generation-lifecycle.js` | Recovery tests |
| Change catastrophic-loss continuity | `recovery-continuity.js`, `background-core.js` | Recovery + Sync tests; ADR-005 |
| Change favicon discovery/recovery | `background-core.js`, browser background adapters | browser/core/favicon tests; ADR-002/003 |
| Change native Top Sites behavior | `src/shared/core/platform.js`, `src/chrome/core/platform.js` | browser/parity tests; ADR-003 |
| Change Frequently Visited | `newtab.js`, `frequent-geometry-bootstrap.js`, `storage.js`, platform adapter | startup/newtab/browser tests; ADR-002 |
| Change Bookmarks dialog UI | `src/shared/newtab/bookmarks-controller.js`, `core/bookmarks.js` | `test:newtab`, `bookmarks-controller-132003.test.mjs`; keep browser data device-local |
| Change image limits/processing | `image-limits.js`, `image-data.js`, `image-optimizer.js`, `svg-safety.js` | security/profile/favicon tests |
| Change profile import/export | `profile.js`, `importer.js` | import/profile/security tests |
| Change localization | `src/shared/core/i18n-locales/`, `manifest-locales.json` | localization/hardcoded-UI tests |
| Change permissions | manifests + `permissions.js`/platform permission modules | security/browser tests + privacy review |
| Change browser-specific behavior | `src/firefox/` or `src/chrome/` adapter/overlay | parity/browser smoke; ADR-003 |
| Change build generation | `tools/build.mjs` | release/browser tests + clean build |
| Change packaging | `tools/package.py`, `tools/release_contract.py` | release tests + deterministic reproduction |
| Change certification | `tools/certify-release.mjs` | maintenance certification tests; ADR-008 |
| Investigate an old-looking workaround | `docs/REGRESSION-CATALOG.md`, matching historical test | ADRs + release/QA history before deleting anything |

---

## 27. Things that may look strange but must not be casually simplified

A new developer will find code that looks more defensive or repetitive than a normal small extension. Before removing it, understand the historical reason.

### Do not make startup caches authoritative

They are accelerators only. See ADR-001.

### Do not synchronize browser-derived Frequently Visited candidates or automatic browser artwork

They are device-local by design. See ADR-002 and `PRIVACY.md`.

### Do not call browser-specific APIs directly from shared code when an adapter already exists

This previously caused a real Chromium Top Sites regression. See ADR-003 and the regression catalogue.

### Do not turn Recovery into another merge algorithm

Normal Sync owns convergence. Recovery owns safety copies and catastrophic recovery. See ADR-004.

### Do not declare catastrophic Sync loss from one transient empty observation

Browser Sync can deliver state in stages. See ADR-005.

### Do not let stale data override an intentional reset

Reset authority exists specifically to prevent old cloud/local state from resurrecting. See ADR-006.

### Do not repaint the full page behind an open Settings panel just because immediate preview feels simpler

That boundary protects against a real Firefox/Linux compositor failure. See ADR-007.

### Do not package from whatever happens to be in `dist/`

Fresh deterministic build ownership is intentional. See ADR-008.

### Do not refactor only because a file is large

The architecture is frozen unless there is a concrete reason to change it. See ADR-009 and the maintenance policy.

### Do not delete a path because grep suggests it is unused

MV3/event-driven/browser callback reachability is not always obvious statically. Require positive evidence that the responsibility is still fulfilled.

---

## 28. Architecture-change checklist

Before changing a frozen production boundary, answer these questions in the change/audit notes:

1. What concrete problem exists today?
2. Which current owner/boundary is affected?
3. Why can the problem not be solved without changing that boundary?
4. What is the smallest viable correction?
5. Which positive behavior must remain unchanged?
6. Which negative regression must become impossible?
7. Does the change affect permissions, privacy, schemas, persisted state, browser parity, First Paint, Sync or Recovery?
8. Which generated-browser and real-browser evidence is required?

If there is no demonstrated benefit, do not refactor merely for aesthetic cleanup.

The default after a successful fix and green certification is to **stop**, not expand into adjacent cleanup.

---

## 29. Suggested workflow for a new developer

### First hour

1. Read `README.md`.
2. Read this guide.
3. Read `docs/ARCHITECTURE.md`.
4. Read the ADR index and the ADRs relevant to your area.
5. Run `npm test` on untouched source.
6. Run `npm run test:groups` to see the available subsystem lanes.
7. Run `npm run smoke:probe` to understand browser-test capability on your machine.

### Before changing a subsystem

1. Find its owner in the navigation table above.
2. Search `docs/REGRESSION-CATALOG.md` for similar historical failures.
3. Search `tests/` for the file/function/storage key you intend to change.
4. Read the closest corrective/regression tests before editing production code.
5. Confirm whether Firefox and Chromium use the same path or an adapter boundary.

### While implementing

1. Keep the scope narrow.
2. Add/reproduce a regression first for a real bug where practical.
3. Change canonical `src/`, never generated `dist/` directly.
4. Preserve privacy, permission and data-ownership boundaries.
5. Run the smallest useful targeted test group repeatedly.

### Before release

1. Run the full suite.
2. Run reachability/release gates appropriate to the change.
3. Run real browser smoke when available.
4. Run benchmark/size review when relevant.
5. Run canonical certification.
6. Package from a fresh deterministic build.
7. Verify clean-source reproduction.

---

## 30. Useful commands

Development requirements: **Node.js 22+** and Python for packaging-related commands.

### Build

```bash
npm run build
```

### Full regression suite

```bash
npm test
```

### Targeted tests

```bash
npm run test:groups
npm run test:startup
npm run test:newtab
npm run test:sync
npm run test:recovery
npm run test:security
npm run test:browser
npm run test:core
npm run test:release
```

### Performance and size

```bash
npm run bench
npm run size
```

### Runtime reachability

```bash
npm run reachability
```

### Browser smoke

```bash
npm run smoke:probe
npm run smoke:firefox
npm run smoke:chrome
npm run smoke:browsers
```

### Package public artifacts

```bash
npm run release:package
```

or directly:

```bash
python tools/package.py
```

### Full release certification

```bash
npm run certify
```

### Mechanical-only certification when real browsers genuinely cannot run

```bash
npm run certify:mechanical
```

Do not present the mechanical-only result as full browser certification.

---

## 31. Glossary

### Authoritative state
The normalized saved MosaicSync profile that owns the user's real layout/settings data.

### First Paint
The semantic contract describing what may be shown before full authoritative hydration completes.

### Startup projection / render snapshot
Disposable derived data that makes the first frame fast. It is not an independent source of truth.

### Normal Sync
The primary cross-device synchronization mechanism using browser extension Sync storage.

### Record
A normalized Sync-level representation of a shortcut/folder/settings unit used for convergence.

### Tombstone
A synchronized deletion record. It communicates that an item was intentionally deleted and therefore carries real authority.

### Bootstrap
The process by which a fresh/uninitialized installation chooses/accepts an existing authoritative source instead of publishing arbitrary local defaults.

### Intentional reset
An explicit authoritative operation indicating that pre-reset synchronized state must no longer be allowed to resurrect as the active profile.

### Recovery
A safety layer around normal Sync that stores/reads complete verified Personal + Work generations for catastrophic recovery.

### Recovery generation
An immutable, validated complete-profile safety copy represented by Recovery metadata/root/chunk structures.

### Atomic/coherent source
A source whose Personal + Work data belongs together according to the established snapshot/publication rules, rather than a mixture assembled across incompatible generations.

### Device-local data
Data intentionally retained only on the current browser/device, such as browser-derived FV candidates and automatically learned browser artwork according to current policy.

### Browser adapter
A small Firefox/Chromium-specific implementation that supplies capabilities the shared core cannot express identically across browser APIs.

### Generated runtime
The `dist/firefox` or `dist/chrome` tree created deterministically from canonical source. Review/test/package it, but do not treat it as the editable source owner.

### Regression test
A permanent automated test added to prove that a previously discovered bug or dangerous behavior cannot silently return.

### Full certification
The canonical fail-closed release pipeline including real-browser smoke and clean-room deterministic reproduction.

### Mechanical-only certification
All supported non-browser certification gates in an environment that cannot run the real browsers. Useful evidence, but explicitly weaker than full certification.

---

## 32. Final rule for maintainers

MosaicSync has accumulated many protections through real failures, audits and browser-specific edge cases. The safest maintenance approach is:

> **Understand the owner, reproduce the problem, make the smallest correction, preserve the invariant, add a permanent regression, certify, then stop.**

The goal is not to make every file look fashionable or minimal. The goal is to keep MosaicSync understandable, deterministic, private, cross-browser and difficult to regress.

When a piece of code looks unusually defensive, assume there may be history behind it until the ADRs, regression catalogue and tests prove otherwise.

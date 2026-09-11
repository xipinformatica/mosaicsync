# MosaicSync permanent regression catalogue

This catalogue records high-value historical failures and the permanent tests that should make a recurrence obvious. It is not a complete changelog. Its purpose is to answer a future maintainer's first question when a familiar symptom returns: **have we seen this before, and which test protects it?**

## R-001 — Deferred secondary CSS / Firefox white-pill rendering artifact

**Historical symptom:** Firefox could briefly show a rounded white/native-control artifact during New Tab startup or first logo interaction when secondary styling activated and restyled already-painted launcher controls.

**Resolved in:** 1.27.8.8 final public correction.

**Permanent protection:**
- `tests/secondary-styles-on-demand-12788.test.mjs`
- `tests/performance-startup-12786.test.mjs`

**If it returns:** inspect secondary stylesheet activation and critical launcher ownership before changing bootstrap DOM geometry.

## R-002 — Settings wallpaper/dim changed only after Settings closed

**Historical symptom:** appearance changes were saved but the visible wallpaper/darkness did not update live while Settings was open; earlier direct full-page repaint approaches also exposed a Firefox/Linux blank/white Settings compositor failure.

**Resolved in:** 1.30.11, with the later Step-2.2 canvas-text correction retained in 1.30.18.11.

**Permanent protection:**
- `tests/stabilization-1265.test.mjs`
- `tests/corrective-1301811.test.mjs`
- `tests/snow-leopard-130.test.mjs`

**If it returns:** preserve ADR-007's isolated preview/full-page-deferred boundary.

## R-003 — Frequently Visited favicon appears after the card is already visible

**Historical symptom:** a Frequently Visited card could be committed visibly before its favicon finished decoding, causing the icon to appear later.

**Resolved in:** 1.30.18.11.

**Permanent protection:**
- `tests/corrective-1301811.test.mjs`
- `tests/corrective-1301812.test.mjs`

**If it returns:** inspect detached decode-before-commit and stale-render invalidation; browser-history artwork must remain session-only.

## R-004 — Slow Frequently Visited render resurrects stale/disabled content

**Historical symptom:** an older slow favicon/decode pass could finish after Frequently Visited had been disabled or replaced and reintroduce stale visible content.

**Resolved in:** 1.30.18.12.

**Permanent protection:**
- `tests/corrective-1301812.test.mjs`

**If it returns:** treat generation/intent freshness as part of the render commit, not merely the fetch/decode start.

## R-005 — Frequently Visited row causes first-frame shortcut-grid movement

**Historical symptom:** shortcut rows could briefly occupy the space intended for Frequently Visited and then jump when its geometry became known.

**Resolved in:** 1.30.18.18 and visually completed in 1.30.18.19.

**Permanent protection:**
- `tests/corrective-1301818.test.mjs`
- `tests/corrective-1301819.test.mjs`

**If it returns:** inspect pre-paint FV geometry reservation; do not persist browser-history cardinality just to reserve layout.

## R-006 — Transient empty Sync namespace mistaken for catastrophic loss

**Historical symptom/risk:** a temporary zero-byte/empty Sync observation during browser startup or delayed delivery could be mistaken for confirmed catastrophic remote loss.

**Hardened in:** 1.30.13/1.30.14 Recovery work and later Step-4 ownership extraction.

**Permanent protection:**
- `tests/corrective-13013.test.mjs`
- `tests/corrective-13014.test.mjs`
- `tests/recovery-continuity-1301824.test.mjs`

**If it returns:** preserve ADR-005's independent confirmation and persisted restart grace.

## R-007 — Browser-specific favicon adapter seam not exercised end to end

**Historical test gap:** shared favicon tests could pass while the real Firefox `tabs.query`/`tabs.onUpdated` or Chromium protected `_favicon` adapter context was wired incorrectly.

**Closed in:** 1.30.18.16.

**Permanent protection:**
- `tests/corrective-1301816.test.mjs`

**If it returns:** run generated Firefox and Chromium adapter-boundary behavior before changing shared favicon policy.

## R-008 — Withdrawn 1.30.18.26: visible New Tab shell but main initialization crashed

**Historical symptom:** shortcuts remained as a bootstrap-rendered but partly inert/aliased shell; Settings could react visually to CSS hover but could not be opened; Frequently Visited did not initialize.

**Root cause:** the attempted appearance-color extraction changed `normalizeHexColor`/`hexToRgb` dependency contracts while old one-argument production callers remained. Startup threw before later New Tab wiring completed.

**Withdrawn:** 1.30.18.26. Safe rollback: 1.30.18.27. Corrected extraction: 1.30.18.28.

**Permanent protection:**
- `tests/newtab-appearance-color-1301828.test.mjs`
- `tests/test-architecture-1301830.test.mjs`
- `tests/browser-smoke-1301833.test.mjs`

**If it returns:** require full generated/real-browser startup evidence; an isolated helper test is not sufficient certification.

## R-009 — Stale startup/persistence work overwrites newer active Space or meta intent

**Historical symptom/risk:** delayed startup repair or a stale structural writer could publish an older active-Space/meta view after a newer operation had already won.

**Resolved in:** Step 2.2, especially 1.30.18.10–1.30.18.12.

**Permanent protection:**
- `tests/corrective-1301810.test.mjs`
- `tests/corrective-1301811.test.mjs`
- `tests/corrective-1301812.test.mjs`

**If it returns:** inspect the single persistence lock and dedicated active-Space/meta ownership before adding cache-level patches.

## R-010 — Release source and packaged runtime can diverge through stale output/manual certification

**Historical maintenance risk:** a same-version source edit could theoretically be packaged from stale `dist/`, or a restricted environment could silently skip the real-browser gate and still appear fully certified.

**Closed in:** Maintenance Infrastructure M1/M2, 1.30.18.33–1.30.18.34.

**Permanent protection:**
- `tests/build-package-1301831.test.mjs`
- `tests/browser-smoke-1301833.test.mjs`
- `tests/maintenance-certification-1301834.test.mjs`

**If it returns:** preserve ADR-008. Full certification must fail closed and the package path must own a fresh deterministic build.

## R-011 — Shared New Tab leaked Firefox Top Sites arguments into Chromium

**Historical symptom/risk:** native device-favicon hydration in shared New Tab called `browser.topSites.get({ newtab, includeFavicon, limit })` directly. Chromium's API contract accepts no Firefox-style options, so that secondary hydration path could fail closed and abort later icon-maintenance work in the same idle task.

**Found by:** post-M6 external code-first audit of 1.30.18.37.

**Corrected in:** 1.30.18.38.

**Permanent protection:**
- `tests/corrective-1301838.test.mjs`
- `tests/test-architecture-1301830.test.mjs`

**If it returns:** shared New Tab must call `getNativeTopSites()`; browser-specific Top Sites argument shapes belong only in `core/platform.js`. The generated Chromium smoke must keep rejecting `topSites.get(options)`.
## R-012 — Position-collision repair required a second normalization pass

**Historical symptom/risk:** two valid top-level records with the same `position` could be assigned distinct slots by `repairTopLevelPositionsWithinCapacity()` while the returned array remained in pre-repair order. The next normalization/restart then reordered the grid with no user action, and profile export→import→export was not canonical after the first repair. Ordinary two-device Sync can produce the collision when different devices concurrently move different shortcuts into the same slot.

**Closed in:** 1.32.1.4.

**Permanent protection:**
- `tests/corrective-13214.test.mjs`

**If it returns:** preserve the fixed-point invariant `normalizeState(normalizeState(x)) === normalizeState(x)`. Capacity-bounded collision repair must return records ordered by their final unique positions, not by the pre-repair collision ordering.
## R-013 — No-op stale rebase manufactured bookkeeping changes

**Historical symptom/risk:** `rebaseConcurrentState(base, base, latest)` could reconstruct an untouched Space through Sync records and materialize workspace bookkeeping clocks already implied by Settings group clocks. User data stayed intact, but the returned local/Sync signature no longer matched `latest`, so a semantic no-op could look like a new change.

**Closed in:** 1.32.1.4 during the post-normalization chaos audit.

**Permanent protection:**
- `tests/corrective-13214.test.mjs`

**If it returns:** a workspace whose intended payload is byte-for-value identical to its base is not a mutation. Preserve the normalized latest workspace directly instead of reconstructing it through Sync-record materialization.


## R-014 — Delayed Space hydration replaced newer authoritative state

**Historical symptom/risk:** a normal Personal/Work switch or cross-Space drag preview could start local-asset hydration from state S0, receive a newer authoritative S1 update while awaiting, then assign the older hydrated S0 result to live `state`. `writeBaseline` could already represent S1, so the next user save looked baseline-current and could persist the stale workspace over an unrelated concurrent change.

**Closed in:** 1.32.1.6.

**Permanent protection:**
- `tests/corrective-13216.test.mjs`

**If it returns:** never assign awaited Space hydration directly into global state. Keep the candidate local, revalidate both UI-operation ownership and `stateMutationGeneration` after every relevant await, retry from current state after authority changes, and cancel superseded drag/switch generations. The regression must continue through the next local save and prove the concurrently added shortcut survives.

## R-015 — Non-safe numeric mutation clock stopped advancing

**Historical symptom/risk:** model trust boundaries accepted any finite number as a mutation timestamp. Above JavaScript's safe-integer range, adding one may return the same numeric value (`1e20 + 1 === 1e20`). A malformed/imported/remote clock could therefore pin later mutation ordering; deterministic conflict resolution might then fall through to device-id/stable-record tie breaking instead of recognizing the genuinely later user edit.

**Closed in:** 1.32.1.7.

**Permanent protection:**
- `tests/corrective-13217.test.mjs`

**If it returns:** keep logical mutation clocks inside the non-negative safe-integer domain at every model trust boundary. `nextMutationTime()` must fail closed at numeric exhaustion rather than return a non-advancing timestamp. Record ordering and reconstruction must apply the same rule to `modifiedAt`, `deletedAt`, `spaceMoveAt`, Settings stamps and workspace clocks.



## R-016 — Delayed Custom Branding child outlived its Settings owner

**Historical symptom/risk:** `openCustomBrandingDialog()` could begin while Settings was open, await secondary styles/module/device-local branding data, then call `showModal()` after Settings had already closed. A simple final `isSettingsOpen()` check would still be insufficient because Settings could close and reopen while the old request remained in flight, allowing stale work to attach to a later Settings session.

**Closed in:** 1.32.1.8.

**Permanent protection:**
- `tests/corrective-13218.test.mjs`

**If it returns:** preserve parent-lifetime ownership across every asynchronous child-opening boundary. Closing Settings must advance the Settings ownership generation; child work captures that epoch, keeps async results local, and may publish/show only when both the epoch and current Settings visibility still match.

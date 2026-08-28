# MosaicSync development

> **Current release: 1.30.9.** The versioned sections below are historical engineering policies and regression records. Older version numbers such as 1.26.6 are intentionally preserved to describe the release in which that behavior was introduced; they are not active release identifiers.

Requires Node.js 22+.



## 1.30.9 trusted-state efficiency and cleanup policy

1.30.9 is a zero-new-features refinement release on top of 1.30.8. Preserve the complete 1.30.8 Sync/evidence architecture unchanged. The live New Tab `state` has already crossed `normalizeState()`; controlled internal preference mutations may use `replaceWorkspaceTrustedNormalized()` only when the workspace being inserted is constructed entirely from an already-normalized workspace plus known-valid normalized values/timestamps. The ordinary persistence writer remains the final defensive boundary and still normalizes/projects before durable storage. Public/raw-state callers continue to use defensive wrappers. Background Personal/Work publication may reuse the `newState` already normalized by `pushLocalMutation()` rather than normalizing it again before complete profile snapshot publication. The watchdog may suppress only the duplicate pending-local retry that was already completed earlier in the same serialized alarm task; it must not skip pending recovery on foreground/startup/message checks.

### Mandatory next-release requirement: verified device-snapshot generation cache

The **next release after 1.30.9 (normally 1.30.10) must implement** the deferred device/profile snapshot decode cache unless an emergency corrective hotfix makes that technically impossible. This is no longer an optional backlog idea. The cache must be very small, worker-local and disposable, keyed by immutable complete-generation identity (at minimum device/profile identity plus commit/generation/slot and data fingerprint). Cache only generations that are complete and have passed chunk metadata checks, data fingerprint verification, decompression/JSON parsing and record/settings fingerprint validation. Never cache incomplete, malformed, fingerprint-failing or partially delivered generations, and never make correctness depend on the cache surviving an MV3 worker restart. Add explicit regressions proving: successful unchanged generations are reused; a changed generation is decoded again; incomplete delivery is never cached; a later completion of that same generation is accepted; worker-cache loss changes performance only, not results. Keep this requirement visible in future release planning and suggest it before any other optional performance work.

## 1.30.8 Sync same-key concurrency hardening policy

1.30.8 is a zero-new-features correctness release on top of 1.30.7. Preserve all 1.30.7 normalized fast paths, compact-baseline reuse, foreground single-flight, workspace-clock fallback, post-write authoritative ledger and five-minute semantic watchdog. The new invariant is that an unexpected synchronized core value actually delivered by the browser must not be forgotten merely because a nearly simultaneous local publication overwrites the same `storage.sync` key before the queued reconcile reads it. Background `storage.onChanged` therefore keeps a short-lived, bounded in-memory evidence set for valid Personal/Work record/settings values, including a deterministically newer `oldValue` displaced by an expected own write. Before semantic freshness checks/reconciliation and before Personal/Work commit-marker construction, MosaicSync repairs the current shared key through the existing `chooseNewerRecord()` rule. The evidence layer is short-lived worker-local state only: it is never synchronized, never exported and never changes the public schema. It protects values observed by the currently running background context; normal durable `storage.sync` and device/profile snapshots remain the reconstruction sources after a worker restart. No new permissions, transport, telemetry, backend, heartbeat, feature or visual change is allowed.

### Deferred optimization: device-snapshot generation decode cache

Do **not** implement this cache as part of 1.30.8. Revisit it in a later zero-feature performance release only after the new Sync concurrency path has accumulated stable hardware/cross-device evidence. The intended design is a very small worker-local cache of **successfully decoded and fingerprint-verified complete device/profile generations**, keyed by immutable generation identity (device/commit/slot/data fingerprint). It must be bounded, disposable on MV3 worker restart, and must never cache incomplete, malformed, fingerprint-failing or partially delivered generations. Measure real decode frequency and snapshot sizes first; suggest this optimization again when Sync correctness is stable and a performance-focused release is appropriate.

## 1.30.7 zero-feature performance/refinement policy

1.30.7 keeps the complete 1.30.6 correctness/privacy model and removes redundant work rather than changing product behavior. Trusted internal Cross-Space operations use normalized fast paths after a single trust-boundary normalization; storage writes may carry an exact compact persisted baseline through the transaction instead of rebuilding it from hydrated image-heavy state; favicon commits reuse the compact baseline already returned by local materialization. Simultaneous foreground Sync freshness requests are coalesced only while one background check is queued/running—there is deliberately no completed-result freshness cache that could hide a missed `storage.onChanged` delivery. Foreground interval throttling uses monotonic `performance.now()`, while persisted diagnostics retain wall-clock timestamps. Normal publication still rebases against the delivered remote ledger and still constructs commit markers from the authoritative post-write ledger. Equal workspace clocks continue to fall back to exact semantic signatures; only obviously changed clocks take the positive fast path. Expected own Sync echoes do not replace useful remote-delivery forensic evidence. Settings remains a single-scroll-owner surface. No new features, permissions, transport, telemetry, backend, schema or visual behavior are introduced.

## 1.30.6 Sync delivery resilience policy

1.30.6 remains strictly zero-new-features maintenance. Firefox/Chromium `storage.sync` remains the only synchronization transport; MosaicSync does not introduce a server, heartbeat/pulse key or shorter polling interval and cannot claim to force browser-account delivery. An already-open New Tab may request one throttled foreground freshness check when it becomes visible/focused or returns from bfcache; this must reuse the existing `mosaicsync:reconcile-if-needed` background message, the serialized `enqueue()` queue and the existing five-minute semantic watchdog. The foreground path may self-heal the existing watchdog alarm but must not create another timer. Sync forensics live under a dedicated `storage.local` diagnostics key, never normal meta and never `storage.sync`, and contain only timestamps/outcomes/revision identifiers needed to distinguish browser delivery delay from MosaicSync reconciliation failure. Normal Personal/Work publication must rebase candidate records/settings against the currently delivered remote snapshot before writing and must construct its dataset marker from the post-write ledger, preventing a missed Sync event plus a local edit from overwriting/masking a newer remote record. Preserve all 1.30.5 Settings scroll behavior and all existing merge/tombstone/cross-Space/profile safety rules.

## 1.30.5 Settings scroll-lifecycle refinement policy

1.30.5 remains strictly zero-new-features maintenance and deliberately preserves the 1.30.4 rendering experiment: `.settings-dialog` is the sole vertical scroll owner and `.settings-dialog .dialog-card` remains normal-flow content with `max-height:none` and `overflow:visible`. The only runtime follow-up is to align locale-change scroll preservation with that architecture by saving/restoring `settingsDialog.scrollTop` instead of the now-non-scrollable `settingsForm`. Regression coverage stress-toggles Separate Light/Dark Wallpapers and Frequently Visited through their visibility-only paths and protects the scroll-owner contract. Do not change `hidden`/`display:none`, wallpaper preview timing, permission flow, native-dialog/container choice, scroll anchoring or overscroll behavior in this release; hardware results must still isolate the 1.30.4 scroll-frame hypothesis.

## 1.30.4 Settings single-scroll-owner isolation policy

1.30.4 remains strictly zero-new-features maintenance. The reproduced Firefox blank Settings failure survived the unpublished 1.30.3 native-dialog removal, so the next diagnostic variable is scroll ownership only: `.settings-dialog` owns vertical scrolling and `.settings-dialog .dialog-card` must remain normal-flow content with `max-height:none` and `overflow:visible`. Do not simultaneously change the Settings container primitive, `hidden` strategy, preview painting, storage-echo behavior or timing; the hardware result must prove or disprove the scroll-frame hypothesis cleanly. All validated 1.30.3 Space ownership, async cancellation, System-theme ordering, favicon timeout/recovery-queue, final-persistence and pointer-lifecycle fixes remain mandatory. 1.30.3 is an unpublished diagnostic candidate, not a public-history release.


## 1.30.3 Settings stability and async-ownership policy

1.30.3 remains strictly zero-new-features maintenance. The Settings surface must not use a native modeless `<dialog>`: real Firefox hardware reproduced freezes when Separate Light/Dark Wallpapers expanded on Linux and Windows and when Frequently Visited expanded on Linux. Settings remains a fixed, programmatically named ARIA dialog surface with explicit open/close/Escape/outside-click lifecycle; Separate Wallpapers must expand already-prepared controls without repainting both wallpaper previews in the checkbox gesture, and Frequently Visited has one parent visibility owner. A Space cannot switch while Settings is open. Async shortcut artwork and custom-wallpaper jobs must prove generation, owning editor/Space and live-surface identity after awaits before mutating state. System-theme reconciliation is generation-controlled and must resolve browser/media signals before painting. Every favicon quality subscan propagates completeness/timeouts; durable recovery-queue read-modify-write mutations rebase through a short serialized queue and reject non-finite timestamps. Continuous sliders may debounce persistence, but their final interaction persists immediately. No permission, synchronized/storage/profile schema, CSP or user-facing feature changes are allowed.

## 1.30.2 Snow Leopard refinement policy

1.30.2 is strictly zero-new-features maintenance on top of 1.30.1. The explicit Light/Dark selector may paint the already-existing page background immediately while Settings is open so a configured per-theme wallpaper always matches the selected appearance; this exception must stay narrow and must never invoke the broad Settings/grid renderer. Ordinary full-page appearance/background work remains deferred until Settings closes. Favicon final-quality completion must propagate partial original-origin scans instead of entering the device-local completed-audit ledger early; ledger read-modify-write operations are serialized and reject non-finite metadata. Manual detected-favicon discovery must revalidate its generation/URL after awaited bookkeeping before launching network work. Disposable render-manifest persistence must avoid identical writes, and Long Task diagnostics stay behind the developer-metrics gate. No permissions, synchronized/storage/profile schemas, CSP or user-facing features change.

## 1.30.1 Snow Leopard maintenance policy

1.30.1 is a maintenance-first corrective release that folds in the unpublished 1.30 release candidate. Keep the 1.27.9 persisted-state/draft separation, complete Personal+Work Sync recovery model, build-time canonical New Tab source, favicon safety/suitability policy and security boundaries. While Settings is open, never mutate a full-viewport wallpaper/background layer beneath the panel; apply the final full-page appearance only after close. Sync UI must distinguish an authoritative local publication from a foreign-device receipt. Automatic favicon quality follow-up remains bounded: a fast provisional result is followed by one complete bounded quality audit, completed audits are remembered device-locally, and upgrading to 1.30.1 re-opens older automatic favicons once so existing users receive the improved winner. The obsolete monolithic CSS and Personal-only snapshot writer are removed only after their useful tests are transferred to current runtime paths. Galician is supported; Arabic remains deferred pending dedicated RTL engineering.

## 1.27.9 Snow Leopard maintenance policy

- **Zero new features.** The release is limited to correctness, consolidation, test strengthening, package hygiene and measured low-risk optimization. No new UI surface, permission, storage/Sync/profile schema, CSP change, telemetry or remote code is allowed.
- Open Settings has an explicit persisted-baseline + pending-local-draft model. Incoming state becomes the new baseline, untouched controls refresh from it, and only unpersisted dirty fields are overlaid back onto the working state. Dirty means pending persistence, not focus; the latest local value wins while dirty and clears only when that write succeeds.
- The 1.27.8.9 Settings-open paint guard remains the visual lifecycle boundary. Draft merging happens before preview/reconciliation so the isolated preview reflects the merged user intent without allowing launcher/root repaint behind open Settings.
- Favicon discovery uses one reviewed suitability/preference policy for automatic winner comparison, manual picker ordering and bounded early termination. Raw pixel size alone must never terminate quality discovery. Early exit remains bounded for network/battery efficiency but requires strong provenance, geometry and sufficient resolution.
- `src/shared/newtab/` is the canonical maintained New Tab runtime source. The build copies its `newtab.js`, `newtab-critical.css` and `newtab-secondary.css` into Firefox and Chrome with no runtime import layer. Browser-specific background workers and overlays remain explicit.
- The historical monolithic `src/shared/newtab/newtab.css` is retained only for reviewed legacy/full-CSS regression assertions and is excluded from runtime packages. Runtime loads only critical + on-demand secondary CSS.
- All maintenance changes require failing-first behavioral regressions where a current correctness defect exists, plus positive preservation coverage. All 32 UI locales, both manifest locale trees, Sync safety tests, image/SVG/profile hardening and historical regression tests remain mandatory gates.
- Migration/compatibility code is not deleted merely because it is old. Direct upgrades may skip releases; retirement requires proof that an input can no longer occur.

## 1.27.8.9 corrective release policy

- Scope is frozen to the mascot restoration, first-frame Light theme correctness, drag/drop localization, Settings-open render lifecycle hardening, and general favicon candidate suitability. No Sync schema, permission, CSP, profile-format or bootstrap-DOM change is part of this release.
- Full launcher/root setting commits and grid rebuilds are deferred while Settings is open and coalesced into one authoritative commit on the animation frame after Settings closes. The model still adopts incoming storage/Sync state immediately; no own-write event is broadly ignored.
- The isolated appearance-preview layer remains the only wallpaper surface mutated while Settings is open. Theme-button transitions keep their existing dedicated live skin path.
- `appearance-bootstrap.js` sets `data-effective-theme` from the same disposable hint used for the first-frame background color so Light mode never starts with Dark launcher variables. Authoritative storage remains final.
- The drag/drop choice popover refreshes Move/Create-folder headings and helper lines through `t()` every time it opens.
- Favicon resolution uses a bounded suitability score: resolution saturates once tile-ready, while provenance and square geometry decide among sufficiently large candidates. There are no site-specific exceptions.
- The mascot's `brand-hello-pop` and `brand-easter-wave` keyframes are critical-owned again; logo hover never activates deferred CSS.

## 1.27.8.8 internal startup-style lifecycle candidate

- New Tab startup must perform **zero unsolicited insertion of `newtab-secondary.css`**. `secondary-style-bootstrap.js` is an idempotent provider only; it must not schedule `requestAnimationFrame`, timers, or other automatic CSSOM mutations merely because a New Tab opened.
- Any launcher-reachable secondary surface must await `ensureSecondaryStyles()` before becoming visible: Settings, Bookmarks, shortcut editor, folder popover, drag/drop choice menu, Frequently Visited context menu, toast feedback, and the brand hello animation. Secondary sub-surfaces opened only inside one of those already-loaded parents may rely on the parent boundary.
- UI that can appear automatically during startup/reconciliation must not depend on the secondary sheet. The Website Access prompt therefore remains fully styled by `newtab-critical.css`.
- Custom launcher native buttons that exist or can be inserted around first paint (`.settings-button`, `.bookmarks-button`, `.space-button`, `.add-slot`, `.edit-chip`, `.empty-ghost-tile`) explicitly use `appearance: none` in critical CSS.
- Keep launcher DOM bootstrap/adoption architecture unchanged unless real-hardware testing proves the pill persists after this CSS lifecycle fix. Do not combine a bootstrap-structure rewrite with the stylesheet experiment without evidence.
- The final architecture preserves strict CSP and packaged-only styles; no inline styles/scripts, remote CSS, telemetry, or page-hiding startup workaround is permitted.

## Internal candidate 1.27.8.6 launcher native-appearance policy

- Custom-styled launcher `<button>` controls that intentionally replace browser-native chrome must explicitly declare `appearance: none` in `newtab-critical.css`; do not rely on border/background overrides alone.
- The current protected launcher controls are `.settings-button`, `.bookmarks-button` and `.space-button`. The brand control is a `<span>`, not a native button, and does not need this reset.
- The reset belongs in blocking critical CSS so it is present before first paint and remains effective during later style recalculation. Do not add a late override, `!important`, or a new secondary-sheet launcher rule.
- This internal candidate intentionally left the delayed secondary stylesheet architecture unchanged. Real-hardware testing showed that was insufficient; the public 1.27.8.9 policy above supersedes that loader behavior while retaining the native-appearance hardening.

## 1.27.8.5 first-frame CSS ownership policy

- Launcher-visible New Tab components are permanently owned by `newtab-critical.css`. Deferred `newtab-secondary.css` must not re-declare their normal geometry, paint/compositor properties or launcher image-layer behavior after the first frame.
- In particular, `.settings-button` and its normal launcher states are critical-only. Re-declaring the fixed backdrop-filtered control in the secondary sheet can make Firefox rebuild its compositor layer a couple of frames after paint even when the declarations are identical.
- Launcher tile/folder-mosaic image rules are likewise critical-only. Combined rules that also serve secondary folder-popover tiles must be split so only `.folder-item-tile` declarations remain in the secondary stylesheet.
- Regression tests enforce CSS ownership in both directions: secondary/editor selectors stay out of critical CSS, and launcher-visible selectors stay out of secondary CSS.
- The historical monolithic `newtab.css` may remain as reviewed reference for legacy tests, but it is not part of the runtime loading contract. `newtab.html` must not link it and `secondary-style-bootstrap.js` must load only `newtab-secondary.css`.
- 1.27.8.5 is intentionally a narrow visual-integrity follow-up. It does not alter the 1.27.8.4 Frequently Visited Sync migration, wallpaper preview isolation, folder hydration scheduler, storage bootstrap, hover behavior, PCP instrumentation, permissions, Sync conflict semantics or image/navigation safety.

## 1.27.8.4 New Tab performance, appearance-preview and Frequently Visited policy

- New Tab first-frame CSS is split into a launcher-only critical sheet plus a genuinely secondary-only sheet. Critical and secondary runtime rules must not duplicate the whole monolithic source, and secondary UI styling must remain CSP-safe and packaged locally.
- The tiny pre-module local-storage bootstrap may start only the frozen authoritative local-state/meta/active-Space/asset-index read. The main module must consume that same Promise/result; it must not create an alternate persistence path or weaken normal normalization/concurrency checks.
- Deferred closed-folder artwork is pixel-only work. All child records remain authoritative immediately. Hidden artwork must hydrate in bounded idle chunks with yielding between chunks, and folder-open hydration must reject stale async completion if a structural mutation occurred meanwhile.
- Startup timing remains local, ephemeral diagnostics only. Paint/PCP and bounded long-task timing may be recorded in the current page context, but nothing may be persisted, transmitted or turned into telemetry.
- While Settings is open, separate Light/Dark wallpaper and darkness changes must paint only the isolated appearance-preview layer. The real root/page wallpaper/dim surface stays frozen until the dialog closes and the deferred authoritative commit runs, preserving the Firefox compositor workaround.
- Frequently Visited **Show** and **Count** are user profile preferences and synchronize through normal MosaicSync settings records. Actual Top Sites/history data, hidden-site data and the optional browser permission remain device-local. A receiving device whose synchronized preference is ON but whose permission is missing keeps the preference ON and exposes the existing user-gesture-only Grant permission action.
- Legacy device-local Frequently Visited migration must not allow a default OFF/5 installation to race against and overwrite another device's meaningful legacy ON/non-default preference.
- Shortcut hover remains transform/paint-only with no grid reflow; 1.27.8.4 intentionally makes the hover enlargement more noticeable while keeping layout geometry unchanged.

## 1.27.8.3 New Tab critical-path performance policy

- New Tab optimization must reduce work on the visible/interactive critical path rather than merely improving post-paint microbenchmarks. Local-only phase timings may be recorded in the page context for diagnosis, but they must never be persisted, transmitted, or turned into telemetry.
- The synchronous first frame uses a deliberately smaller critical stylesheet. The complete stylesheet is loaded immediately afterward by an external CSP-safe bootstrap; no inline event handler, `unsafe-inline` exception, remote stylesheet, or visual-feature removal is permitted.
- A bootstrap grid may become the authoritative interactive grid only after a strict structural match against current state, including revision/settings clocks, grid geometry, current order, shortcut IDs/titles/navigation targets and the first four folder-child IDs. Any uncertainty must fall back to the established full renderer.
- Closed folders remain fully authoritative at the record level. Startup may defer only hidden child artwork bytes beyond the four visible mosaic cells; opening the folder hydrates missing pixels immediately and post-paint idle work warms the remainder.
- Normal current-schema startup reuses the exact compact `storage.local` state as the optimistic-write baseline instead of projecting the hydrated render state. Legacy/migration paths still construct a canonical baseline explicitly.
- Authoritative local storage I/O should begin as early as possible and overlap secondary UI initialization without changing read/write/concurrency semantics.

## 1.27.8.2 New Tab startup-performance policy

- The synchronous render manifest is a first-frame visual cache, not authoritative state. A matching preview may remain visible while the authoritative content-addressed image decodes, but only when its `imageKey` matches the shortcut's current asset identity; stale previews must fail closed to the normal built-in/fallback path.
- Device-local image validation remains mandatory at the `storage.local` trust boundary. Once exact bytes have passed validation, their transient data-URL→asset-ID memo may be reused by normalization and write-baseline construction during the same startup instead of hashing the same bytes repeatedly. The memo is never persisted as a trust bypass.
- Custom wallpaper bytes do not compete with visible shortcut artwork on the first authoritative asset read. The compact state keeps the content-addressed wallpaper ID authoritative, the existing tiny appearance preview remains on screen, and the full wallpaper asset is hydrated immediately after the shortcut grid gets a frame to paint.
- A closed folder contributes only its first four children to the synchronous first-frame manifest/preview-generation workload because only four mosaic cells can be visible. The authoritative folder contents remain complete and unchanged.
- Full and preview tile images request asynchronous browser decode scheduling. Matching bootstrap artwork remains recognizable until the full image reports itself decodable; no image quality, CSP, URL validation, Sync, schema or security rule is weakened for performance.
- Performance regressions are tested with image-heavy startup fixtures. The benchmark must retain explicit comparisons for normalization/write-baseline work with and without a prevalidated asset memo.

## 1.27.8.1 distributed Sync validation and recovery-protection policy

- `syncStatus` describes whether the ordinary Personal+Work synchronized profile is usable; complete-profile recovery protection is tracked separately as `unknown`, `protected` or `limited`. A quota/size failure of the extra safety generation must never be silently discarded.
- Every production path that attempts `publishProfileDeviceSnapshot()` must propagate its outcome into local metadata. Work-only edits and cross-Space transactions are covered by the same rule as Personal edits/bootstrap/reconciliation.
- A failed target generation never flips the authoritative root. If chunk writes succeed but the root write fails, target chunks are cleaned up and the previous complete generation remains valid.
- Release-level Sync validation must include two independent production background instances sharing an emulated remote `storage.sync`, not only source-shape assertions. The harness must support partial/out-of-order delivery and missed `storage.onChanged` notifications, and convergence must be verified after the watchdog path.
- 1.27.8.1 intentionally does not change whole-record conflict/LWW/tombstone semantics; clock-skew and per-field shortcut merging remain separate design work.

## Internal candidate 1.27.8 complete-profile Sync safety policy

- Personal and Work are one readiness unit. A fresh profile must not become Sync-ready until both Spaces are explicitly complete.
- The device-owned fast snapshot remains payload-version compatible with 1.27.7 for Personal, but 1.27.8 adds validated Work records/settings and marks the generation as a complete profile.
- Full-profile generations are root-last and double-buffered. The active root retains a descriptor for the immediately previous complete generation so a receiver can fall back if the current root arrives before all current chunks.
- A trusted existing device may publish its complete local profile. A half-restored fresh profile with no applied Work/profile revision and default-empty Work must not publish that emptiness.
- Local edits made while a fresh profile is waiting are merged after a complete remote baseline arrives, then published as normal per-record changes; unrelated remote records are preserved.
- A complete profile snapshot may repair a torn compatibility ledger by merging any visible partial records under the existing deterministic conflict clocks and recommitting the dataset marker last.
- `syncStatus: ready` is a profile-level state. Personal-only success must never mask Work pending/integrity failure.

## 1.27.7 favicon state/render-consistency policy

Device-local automatic favicon/cache hydration intentionally does **not** advance synchronized workspace/core clocks. New Tab must therefore never suppress a `storage.local` state event solely because its `updatedAt`/settings clocks match a recent in-page write. Exact own-write echoes and genuine device-artwork changes are both handled through the existing Sync-signature/device-artwork fast path; a real background favicon update must be able to mutate the in-memory shortcut and patch the currently visible top-level tile, folder mosaic and open folder contents. If the fast path cannot prove the change is display-cache-only, the authoritative state/render path remains the fallback.

Manual **Choose detected favicon** discovery remains separate from the automatic resolver. If the shortcut already contains learned automatic artwork with provenance `favicon` or browser-native `firefox`, those exact validated pixels may be exposed as an already-known detected candidate and deduplicated against fresh discovery. Uploaded/user artwork and bundled built-in icons must never be relabeled as detected favicons. A successful page inspection that finds no candidates retains the normal empty-state message; if page-head inspection itself fails and no fallback candidate exists, the UI must report the localized inspection-failure state instead of falsely claiming that the website has no icons.

Regression coverage must exercise the production page-icon scanner against a fixture containing declared inline SVG and PNG favicon metadata, prove current learned-candidate provenance/deduplication, prove storage-event suppression cannot hide device-local artwork changes, and keep automatic `resolveFaviconForUrl()` byte-identical to 1.27.6 unless a future release explicitly changes automatic favicon behavior. No new permission, host-permission, state/Sync/profile-schema, CSP, telemetry or remote-code behavior is introduced by this consistency fix.

## 1.27.5 tile-artwork / favicon-permission / build-integrity policy

Contained top-level shortcut artwork uses a proportional 58/76 ratio (about 76%) across the supported 60–96 px tile-size range; bundled top-level MosaicSync icons use 78%. Tile dimensions, grid density and Cover-mode edge-to-edge behavior remain unchanged. The synchronous first-paint renderer and authoritative renderer must use the same ratio so startup cannot visibly resize artwork after hydration.

The manual **Choose detected favicon** cache is gated by a live `hasWebAccess({ refresh: true })` permission read before cache access. Redirect-origin `/favicon.ico` may share the existing two-wide ordered fallback batch, but the automatic `resolveFaviconForUrl()` ranking/winner/single-flight pipeline remains a protected baseline. The manual picker intentionally keeps ordered two-wide batches rather than a completion-order worker pool unless a future change can prove candidate-priority and network semantics remain stable.

The compact PSL build must emit deterministic semantic rule counts and SHA-256 metadata, reject implausibly small wildcard/exception sets, duplicate rules and embedded rule whitespace, and remain functionally equivalent to the authoritative source for exact/private/wildcard/exception/IDN behavior. Package-size regression checks cover total/category growth, missing categories and significant individual top-file growth; JavaScript and Python category classifiers must remain equivalent. Compact locale generation must preserve arbitrary Unicode, quotes, backslashes, newlines, placeholder-like text and other literal content exactly. `src/` is authoritative; generated compact runtime artifacts under `dist/` must never be edited directly.

## 1.27.4 runtime-size / favicon-picker lifecycle policy

The reviewed files under `src/shared/core/i18n-locales/` remain the authoritative human-readable 32-language catalogs. `tools/build.mjs` may generate a compact runtime representation in `dist/` only when exhaustive tests prove exact source→runtime key/value equivalence. Locale lazy-loading remains unchanged: English plus only the active locale are loaded, and compacting must not cause all catalogs to parse on New Tab startup.

The authoritative `src/shared/core/public_suffix_list.dat` remains the complete upstream PSL with provenance/comments. The build emits a rules-only runtime copy with a compact license/provenance header. Every non-comment rule and its order must be byte-text equivalent after trimming; no PSL rule may be removed or rewritten. Package-size monitoring is deterministic and category-based. `package-size-baseline.json` is a conscious release baseline, not a hard product-size ceiling; unexpected category/total deflated growth above the configured 15% tolerance must require an explicit baseline update.

The automatic favicon resolver remains the protected 1.27.2/1.27.3 baseline and must not be modified by manual-picker optimizations. Manual candidate discovery may use at most two simultaneous bounded fetch/decode jobs. A repeated exact-URL picker request may reuse only a tiny short-lived in-memory cache (30-second TTL, four-entry cap, explicit retained-character bounds); permission is still checked before cache use and refreshed before cache admission. Site-declared inline data favicons remain supported only through the existing declared-image decoding/SVG safety path. Closing the shortcut editor or changing its URL must increment the picker generation, release candidate DOM/data immediately and cause late async results to be ignored.

Detected-favicon accessibility metadata may expose dimensions and a localized Browser/Website source label without adding raw technical source strings to the UI. No discovered candidate except the one deliberately selected becomes persisted artwork. Obsolete CSS may be removed only when full-source/runtime searches confirm no static or dynamic use.

## 1.27.3 favicon-choice / folder-follow / recency-efficiency policy

The automatic favicon resolver remains a protected baseline: `resolveFaviconForUrl()` must remain byte-for-byte identical to 1.27.2 unless a future release explicitly changes automatic favicon behavior. The manual favicon chooser is a separate user-initiated path that reuses the same bounded fetch, image-dimension and SVG-safety primitives, returns at most eight deduplicated validated images, and never widens host permissions or introduces a remote favicon proxy. Choosing one makes those exact pixels explicit user artwork so automatic recovery cannot overwrite the user's selection; optional image Sync remains user-controlled through the existing checkbox.

Open folder popovers must remain visually attached while `.page` scrolls or the viewport resizes. Reposition work is coalesced through `requestAnimationFrame` so scroll events cannot create an unbounded layout loop. Recent mode remains presentation-only: top-level visual-slot dragover now stops propagation and advertises no-drop, while ordinary same-tab shortcut navigation records recency locally without scheduling a grid render that will be discarded by immediate navigation. Modified/background opens continue to schedule Recent rendering because MosaicSync remains visible.

Regression coverage must lock both chronological directions of built-in-icon/upload conflict resolution, automatic favicon resolver byte identity, favicon-choice bounds/deduplication, explicit-selection semantics, folder scroll/resize coalescing, Recent dragover containment, and localization completeness.

## 1.27.2 Recent-mode / editor / projection hardening policy

1.27.2 keeps **Recently opened** strictly presentation-only at the top-level grid. While Recent mode is active, top-level visual-slot drops must not create or move canonical Manual positions: Frequently Visited drag-to-grid and folder-child extraction-to-grid are blocked, top-level drag sources remain disabled, and normal Add shortcut ignores the Recent visual slot and selects a canonical free Manual position. Folder-internal reordering may continue because it does not depend on the top-level Recent projection. Manual mode retains the existing exact-slot drag/drop behavior.

The shortcut editor should fit without a visible internal scrollbar on normal desktop-height viewports by modestly tightening vertical spacing, image-preview size and action margins. The generic dialog overflow remains intact as a fallback for genuinely short viewports and localization/accessibility must not be weakened to remove scrolling.

Disposable render-manifest projection must allow-list `builtinIcon` and `colorTag` exactly like the session render snapshot. A shortcut claiming `imageSourceKind: "builtin"` without a valid `builtinIcon` must normalize to source kind `none`, allowing normal favicon recovery instead of creating a permanently icon-less malformed state. A deliberate synchronized built-in-icon choice remains normal last-writer-wins presentation metadata and may replace local uploaded artwork; this behavior is intentional and regression-tested.

Regression coverage must execute the real empty-slot drop path in Recent and Manual modes, execute folder popover positioning for one-line/two-line/clipped/clamped/flipped geometry, and mechanically compare classic first-paint Recent ordering against the authoritative sorter across varied inputs.

## 1.27.1 folder-popover positioning policy

1.27.1 is a presentation-only correction to 1.27.0. The `.shortcut-label` element intentionally reserves a two-line slot (`min-height: 34px`) for grid alignment, so its element rectangle is not a valid visual anchor for one-line folder titles. Folder popover placement must measure the actually rendered visible text line boxes and use their bottom edge, with a 3 px nominal gap. Line boxes clipped beyond the label viewport must not influence the anchor. If text-range geometry is unexpectedly unavailable, placement may safely fall back to the label element rectangle.

The existing horizontal centering, 12 px viewport clamping, estimated-height collision handling and above-the-tile fallback remain unchanged. No permissions, storage/Sync/profile schemas, favicon behavior, CSP, telemetry, remote code, localization strings or feature semantics change in this patch.

## 1.27.0 feature / presentation policy

1.27.0 adds synchronized shortcut metadata for `builtinIcon` and `colorTag`. Both fields are strict allow-list values at the model boundary. A built-in icon is packaged MosaicSync UI artwork, not imported SVG/user markup: selecting one clears shortcut image bytes, local/sync asset IDs and automatic favicon state, and automatic favicon recovery must not overwrite it. Built-in icon metadata synchronizes as part of the shortcut record without consuming image-asset quota. Shortcut color tags are visual metadata and synchronize with the shortcut. The local state schema is 18 and the Sync record schema is 10; older records without these optional fields continue to normalize to the empty/default values.

The **Recently opened** order is a device-local presentation mode. Its mode and bounded per-shortcut last-opened timestamps live only in `localStorage` under the centralized `SHORTCUT_ORDER_PREF_KEY` / `SHORTCUT_USAGE_PREF_KEY`; they must never enter MosaicSync profile exports, browser Sync records or canonical shortcut `position` fields. Manual order remains authoritative and drag reordering is disabled only while the recent presentation is active. The synchronous first-paint projection and authoritative renderer must use the same recency semantics to avoid a startup layout jump.

The lightweight `storage.session` render snapshot is also a presentation boundary. It must carry only allow-listed `builtinIcon` / `colorTag` values (including folder children), and the authoritative visual-reconciliation signature must include those fields. This guarantees an older or incomplete disposable startup projection is repainted from authoritative state instead of leaving a built-in icon/color visually stale.

Folder **Open all in background** reuses the existing final HTTP(S)-validated background-tab path for each child. It introduces no new data model. Folder popovers must remain visually close to their visible tile/label (`4px` nominal gap) while retaining viewport clamping and above/below collision handling.

All 1.27.0 user-visible labels, icon names and color names remain in the 32-locale UI catalog. Do not hardcode new user-facing English. The release does not broaden permissions, CSP, remote code, telemetry or favicon network behavior.

## 1.26.17.7 optional-permission recovery policy

Frequently Visited stores user intent separately from the browser's optional `topSites` grant. If the preference is enabled while the grant is unavailable, MosaicSync must keep the preference enabled, render no Top Sites data, show a localized direct permission-recovery action, and request the permission only from that explicit user gesture. Denial/revocation must never force an OFF state or require an OFF → ON toggle to recover.

`permissions.onAdded` / `permissions.onRemoved` and one delayed post-start reconciliation keep the UI aligned with the browser's live permission state. If a grant becomes available again, suggestions refresh automatically; if it remains unavailable, the recovery action remains available. Profile import preserves the remembered Frequently Visited preference independently from the installation-local permission state. No permission is silently granted, and the manifest permission model is unchanged.

The exact-URL favicon single-flight optimization from 1.26.17.6 remains unchanged. Regression coverage must compose the production queue grouping with the real `applyProactiveFaviconResults()` stale-result checks so a shared resolver result cannot hydrate an ID that changed URL, was deleted, or moved into a Space that no longer allows automatic icons while networking was in flight.

## 1.26.17.6 performance/stability policy

The favicon recovery engine may coalesce only resolver jobs with the **exact same normalized shortcut URL and the same quality mode**. Distinct pages on one origin remain independent because page-level metadata can legitimately advertise different icons. The concurrency limit applies to distinct resolver jobs; a shared validated result may fan out to multiple matching shortcut records, but every record still goes through the existing stale-state re-read, per-ID applicability checks, durable backoff and atomic device-local commit path.

Frequently Visited may reuse its explicit-shortcut host `Set` only while both the in-memory state identity and `stateMutationGeneration` are unchanged. A state replacement or generation advance must rebuild the Set so local edits, imports, Sync restores and cross-Space changes cannot leave stale duplicate filtering.

Production New Tab performance diagnostics remain local development instrumentation only. `console.debug` performance output must be gated by `devMetricsEnabled()` / `MOSAICSYNC_DEV_METRICS === true`; no telemetry or remote reporting is introduced.

The 1.26.17.5 URL/profile hardening remains a frozen safety boundary. Behavioral regression coverage now executes the classic first-paint renderer against hostile shortcut/Frequently Visited URLs and verifies fail-closed behavior when the shared URL helper is absent. Prototype-pollution tests also assert that dangerous own keys do not survive on normalized settings, Spaces, folders, shortcuts or nested children.

## 1.26.17.5 shared HTTP(S) validation / import hardening policy

Shortcut URL acceptance is centralized in `src/shared/core/http-url-safety.js`, a deliberately tiny script with no import/export syntax so the exact same validator can be used by synchronous classic first-paint code and ES-module code. It accepts only syntactically valid `http:`/`https:` URLs up to 2048 characters and otherwise returns an empty string. Do not reintroduce independent shortcut-scheme regexes in model/storage/import/render code unless a different URL semantic is genuinely required.

`render-bootstrap.js` remains a disposable synchronous first-frame optimization. The shared URL helper is loaded immediately before it at the bottom of New Tab; it must not be moved into the head/startup-I/O path or expanded with networking, timers, storage reads or other work. If the helper is unavailable, the bootstrap must fail closed and leave rendering to the authoritative module path.

Profile normalization must continue to reconstruct fresh allow-listed objects. Regression coverage deliberately injects checksum-valid `__proto__`, `constructor` and `prototype` keys at multiple profile/package levels, including nested folder children and the asset envelope. Accepted inputs must normalize those keys away; rejected inputs must leave existing state and `Object.prototype` untouched.

- `npm run build` — generates `dist/firefox` and `dist/chrome` from the shared source plus browser overlays.
- `npm test` — builds and runs the permanent regression suite.
- `npm run bench` — runs the reproducible 200-shortcut worst-case microbenchmark.
- `python tools/package.py` — creates deterministic Firefox/Chrome runtime ZIPs from `dist/`.

The runtime ZIPs should be created from `dist/firefox` and `dist/chrome`; tests, fixtures and documentation are development-only and are not shipped inside the extension packages.

## 1.26.17.4 import/navigation hardening policy

Profile imports retain the intentionally generous 256 MiB abuse ceiling, but the `File.size` boundary must be checked before `File.text()` in every import entry point so an oversized local file cannot force a large allocation before structural validation. The parser keeps its independent post-read character limit. The specific too-large UI error remains localized through every supported MosaicSync UI catalog.

Shortcut URLs are normalized to HTTP(S) at the model/profile/Sync trust boundaries. The authoritative New Tab navigation sinks also fail closed independently: top-level tiles, folder-item anchors, permission-resume navigation and “Open in new tab” must never navigate a shortcut whose current URL is not valid HTTP(S). This is defense-in-depth and must not loosen the central model invariant.

A user-confirmed `.mosaicsync` restore remains an authoritative profile replacement. When Sync is enabled, `bootstrapLocal()` intentionally publishes that restored profile as the synchronized source; historical Sync tombstones must not silently override an explicit backup restore. Concurrent local writes continue through the existing write-baseline/rebase architecture; audit-driven changes to self-write suppression require a reproducing behavioral test rather than a speculative rewrite.

Historical upgrade maintenance is keyed from the `previousVersion` range that needs repair. Do not gate old migrations on the current `VERSION` literal. Frequently Visited below 900 px keeps the current configurable show-and-wrap behavior; do not reintroduce the obsolete rule that hid card 4 and later.

## 1.24.11 engineering policy

1.24.11 treats 1.24.10 runtime behavior as frozen. Persistent/session key names and runtime tuning limits live in `core/constants.js`; non-module first-paint bootstrap scripts may duplicate only the two session-render key literals they must access before modules load. Runtime caches must be explicitly bounded. Build output is generated from shared source plus browser overlays, and `build-manifest.json` records the SHA-256 hash of every generated runtime file.

The regression suite intentionally tests failure paths as well as happy paths: legacy inline-profile migration, corrupt local assets, invalid session snapshots, localization completeness, accessible dialog naming, bounded URL/cache behavior, favicon recovery, Sync semantics, asset/profile integrity, and Firefox/Chrome parity.

## 1.24.12 security/correctness policy

1.24.12 keeps the 1.24.11 runtime/profile architecture frozen while hardening trust boundaries and concurrent local writes. New Tab mutations retain a compact write baseline; `storage.js` re-reads the latest compact state inside the asset-write lock and three-way rebases only the caller's delta when another tab committed first. Disjoint settings fields are merged independently, while same-field/same-record conflicts retain the existing deterministic MosaicSync ordering.

Profile v2 import requires the asset envelope to contain exactly the content-addressed assets referenced by the compact profile state. Remote SVGs are admitted only if self-contained and free of active/embed/external-resource constructs. CSP/XSS, asset/input bounds, same-extension runtime messaging, and long-lived cache limits are permanent automated contracts.

## 1.24.13 storage-failure policy

1.24.13 keeps the 1.24.12 architecture and behavior frozen. A failed atomic `storage.local` state/asset commit must leave the complete previous transaction intact: MosaicSync must never retry by publishing compact state without the referenced local assets. Background silent-write suppression is transactional as well; if the local write fails, both the in-memory and `storage.session` suppression markers are removed so a later legitimate change cannot be accidentally ignored.

The Firefox text-platform passthrough intentionally declares the same `(value, locale, key)` call shape as the Chrome overlay while remaining a no-op.

## 1.24.14 optimization policy

1.24.14 keeps correctness reads and conflict semantics unchanged. Detailed Sync usage accounting is demand-driven by Settings rather than recomputed after every mutation. The source package includes the deterministic 200-shortcut benchmark fixture so future micro-optimizations can be measured before they are accepted. Image-heavy writes use a per-operation asset-ID memo only to avoid recomputing the same pure hash within one transaction; it is cleared immediately after persistence and is not a long-lived image cache.

## 1.24.14b favicon-quality policy

1.24.14b is intentionally narrow. The normal favicon-first path is unchanged. Only an existing low-resolution icon undergoing an explicit quality retry may probe additional same-origin conventional static icon paths, with `/icon.ico` first. A high-quality result can satisfy the retry before HTML/manifest discovery, which keeps authenticated or WAF-protected page shells out of the critical path. No domain-specific favicon mapping is used.
## 1.24.14c authenticated-deep-link favicon policy

1.24.14c keeps the fast favicon-first resolver and the 1.24.14b conventional-path quality probes. If a credential-free quality fetch of a deep shortcut redirects to a different origin (for example, an account/login provider), MosaicSync now inspects the original site's public root for declared application icons before considering redirect-destination artwork. The recovery probe accepts root metadata only when the root itself remains on the original origin. No host-specific mapping or third-party favicon service is used; image fetches retain the existing bounds, MIME/SVG validation, no-referrer policy, and `credentials: "omit"`.



## 1.24.14d Chrome native-favicon quality policy

Chrome's `_favicon` endpoint is a browser-local fast fallback, but the requested output size is not treated as intrinsic source quality: Chrome may upscale a small cached favicon. Native pixels therefore carry unknown quality metadata and remain eligible for the same generic quality-recovery pipeline as other automatically learned favicons. The upgrade path also treats the historical `firefox` source-kind label as browser-native/reconstructable artwork on Chrome. Firefox manifests intentionally omit Chrome-only `version_name`; the human-facing release label remains available through MosaicSync's internal `VERSION` constant and UI.
## 1.24.14e favicon resolver policy

The resolver is deliberately two-stage. The first pass favors latency: browser-local artwork and `/favicon.ico` may be displayed immediately as provisional device-local pixels. The first quality follow-up is not a failure and becomes due immediately, with the existing alarm remaining the MV3 durability fallback.

The quality pass favors authority: HTML/manifest-declared artwork is inspected before guessed filenames, including cross-host CDN artwork permitted by the all-sites Website Access grant. Authenticated deep-link redirects still trigger recovery from the original site's public root. Only after declared discovery has failed to reach high quality may `/favicon.ico` and the conventional quality guesses run, and those guesses share a 1.5-second post-discovery fallback budget so they cannot consume the main 8-second discovery deadline.

Chrome's private `_favicon` cache is read before the optional host-permission gate because it is browser-local. It is a provisional fallback only and carries unknown intrinsic quality. Brand-new Chrome sites do not need to be visited first: when MosaicSync Website Access has already been granted, the same declared-site network resolver runs even with an empty Chrome favicon cache. Without that optional host permission, MosaicSync cannot independently fetch a never-visited website and correctly falls back to browser-local data only. No third-party favicon service or hostname-specific mapping is used.


## 1.24.14f UI-polish policy

Donation is live at `https://ko-fi.com/mosaicsync`; both Welcome and Settings route through the shared `DONATE_URL` constant and no “coming soon / being prepared” UI state remains. User-facing donation copy continues through the reviewed localization catalogs.

Anchored help tooltips must not rely on escaping a scrolling dialog's `overflow` rules. While visible, the existing localized tooltip DOM node is moved to `document.body`, positioned with `position: fixed`, clamped to a safe viewport margin, flipped below the anchor when there is insufficient room above, and restored to its original parent when hidden. This keeps one source of localized content and avoids clipping in every supported language.

## 1.24.14g adversarial-hardening policy

1.24.14g keeps Sync conflict semantics and favicon resolver ordering unchanged. Read-only Sync status requests stay on the serialized background queue but cannot persist a durable Sync error when the inspection itself fails. Firefox data-collection permission revocation clears pending cross-Space journals before disabling Sync, matching the explicit disable path. Viewport-portaled tooltips must remove themselves if their original UI host has already been disconnected.

Profile import remains independent of browser Sync quota. Its pre-parse length check is a deliberately extreme 256 Mi-character abuse/OOM ceiling, not a normal profile-size product limit, and profile format v2 is unchanged. Content-addressed local projection fails closed if a single transaction ever presents two different payloads for one asset ID. Permanent tests cover same-shortcut concurrent conflicts, destination-first cross-Space interruption/replay, the collision guard, profile-size boundaries, tooltip teardown, and read-only background-error isolation. The favicon-learning network/queue architecture is deliberately deferred to 1.24.14h.

## 1.24.14h favicon-queue policy

Click-triggered favicon learning is split into three phases: a short serialized eligibility/preflight read, browser/native plus remote quality resolution outside MosaicSync's state/Sync mutation queue, and a short serialized commit. The commit always reloads current local state and re-finds eligible shortcut targets before applying pixels through the existing optimistic-rebase write path. This prevents a slow favicon host from delaying Sync reconciliation while preserving deletion and concurrent-edit safety.

The separate tab-favicon work queue is bounded to three simultaneous jobs and to the existing pending-navigation entry cap; repeated `tabs.onUpdated` events for one tab replace queued stale work with the newest snapshot. The favicon resolver itself, permissions, profile/storage/Sync schemas and localization remain unchanged.
## 1.24.14i proactive favicon hardening

The 1.24.14h network/state-queue split remains intact. 1.24.14i makes proactive recovery Space-aware: pending work is validated against the shortcut's current Space and that Space's `autoSiteIcons` setting at prune/commit time, and an idempotent rediscovery is an unchanged success rather than a stale failure. Behavioral tests cover the real batch engine and scheduler instead of relying only on source-text canaries. No persisted schema, profile format, Sync namespace, permission, or localization changes were introduced.

## 1.24.14j favicon commit-failure policy

The proactive favicon architecture from 1.24.14h/i remains unchanged: network discovery runs outside the serialized state/Sync queue and commits re-read current state. 1.24.14j hardens the seam with the generic background `enqueue()` contract. `enqueue()` intentionally resolves failed tasks as `{ ok: false, error }`; the batch engine must treat that shape as a transient commit failure and retain the durable recovery item through normal backoff rather than deleting it as stale. Permanent tests compose the real queue wrapper with a throwing commit on Firefox and Chrome. Equal-clock Sync settings records are also pinned against the existing deviceId tie-break, including a missing-deviceId case. No conflict algorithm, persisted schema, permission, UI string or favicon discovery rule changes.


## 1.24.14k duplicate-record-ID policy

Every Sync-addressable record inside a workspace must have a unique ID across top-level shortcuts, folders, and folder children. `normalizeWorkspace()` repairs invalid duplicates before `flattenStateNormalized()` builds its ID-keyed `Map`, preserving all otherwise-valid records instead of silently allowing a later record to overwrite an earlier one. Profile files receive one additional file-boundary repair across Personal and Work so a hostile/hand-edited backup cannot leave an ambiguous same-ID record in both Spaces. This cross-Space repair is intentionally **not** part of general Sync reconciliation: legitimate cross-Space move/reconcile mechanics keep their existing IDs and conflict semantics.

## 1.26.17.2 per-appearance wallpaper darkness policy

When separate Light/Dark wallpapers are enabled, wallpaper darkness is part of each appearance rather than a shared global value. `lightBackgroundDim` and `darkBackgroundDim` travel with the synchronized visual settings and complete `.mosaicsync` profile backups; the legacy `backgroundDim` remains authoritative only when separate theme wallpapers are disabled.

The one-time migration from older state must preserve the appearance actually active after system-theme reconciliation: the active Light or Dark appearance inherits the legacy `backgroundDim`, while the opposite appearance starts at 0%. Older Sync records that do not contain the new fields must not erase values already migrated on a newer client. The synchronous appearance hint stores the **effective** current darkness so first paint never applies the other appearance's value during a later automatic theme switch.

Settings exposes independent darkness sliders beside the Light and Dark wallpaper choices and hides the legacy single darkness slider while separate wallpapers are enabled. These controls reuse the existing localized `Background darkness` string; no new hardcoded user-facing English is introduced. Runtime theme switching must resolve wallpaper and darkness together, including while the Settings preview layer is open.

## 1.26.17.1 Frequently Visited global-exclusion policy

Frequently Visited is a device-local discovery aid, not a per-Space duplicate list. Before a candidate is shown, MosaicSync builds one canonical host set from every shortcut in every stored Space, including shortcuts nested inside folders, and excludes any candidate whose canonical host is already present anywhere in MosaicSync. The helper iterates the `spaces` object rather than only the active compatibility aliases, so the behavior naturally covers future stored Spaces as well as Personal and Work. Matching semantics remain host-based and unchanged; this release only broadens the shortcut scope from active Space to all Spaces.

## 1.26.17 favicon, Sync self-heal and release-identity policy

1.26.17 treats automatic favicon retrieval as one coherent capability/recovery pipeline. The browser's live `permissions.contains()` result is authoritative for remote Website Access. New iconless shortcuts are targeted immediately; network work stays outside the serialized state queue; commit-time ownership is resolved again across Personal/Work; permission failures do not consume website retry budget; and Chromium may use its permission-free native favicon database even when remote Website Access is absent. A browser-native provisional icon is useful fallback artwork but must not pin a quality-only queue forever while Website Access is unavailable. Revoking Website Access drops quality-only recovery work that can no longer run while preserving genuinely missing-icon work for any source the platform can still use; a later explicit grant re-seeds upgrade candidates.

Chromium's `_favicon` endpoint can return the browser's generic placeholder for an unknown page. MosaicSync pins the private endpoint to `scaleFactor=1x`, avoids forced cache reuse, and learns successful generic-placeholder signatures from a reserved `.invalid` URL into a tiny bounded in-memory set. A failed sentinel probe is never cached. If the placeholder identity cannot be established for a native read, that native result fails closed and is not persisted; a later request can retry the sentinel. Browser-local misses without Website Access use a bounded retry cadence rather than remaining immediately due.

Remote favicon identity is determined from known image byte signatures before unreliable HTTP MIME labels; bounded inline `data:image/...` favicons use the same safety path. Remote SVGs are self-contained-only and their real root element must be found after XML prolog comments/processing instructions rather than by a raw first-`<svg` search. Intrinsic SVG/raster geometry validation is the actual pre-decode memory-safety boundary. Requested `createImageBitmap` resize dimensions are an additional bounded-output measure and must not be described as a guarantee that the browser decoder avoids intrinsic allocation.

Frequently Visited remains device-local. Its first-frame snapshot is bounded and stale-while-revalidate. The synchronous bootstrap filters the persisted hidden-domain list before painting; if that list exists but cannot be parsed/read safely, the disposable first-frame snapshot is skipped rather than failing open and flashing a possibly hidden site. Drag-to-grid and registrable-domain hiding remain browser-neutral and do not enter browser Sync or profile backups.

Firefox/Chrome Sync self-healing must not depend on a browser restart once changed extension-sync data is locally visible. `storage.onChanged` remains the fast event path and `reconcileIfNewCommit()` keeps revision markers as a cheap signal, but equal markers are not proof that all current remote records were applied: usable semantic records/settings are compared with the current local workspaces before the no-op exit. The periodic Sync watchdog performs the same verification and triggers a full merge when content disagrees. When a complete atomic device snapshot is available while the compatibility shared ledger is visibly partial, MosaicSync may apply the usable device core locally but must not immediately republish/repair that partial ledger; the watchdog revisits it after delivery settles.

Automatically learned/browser-native favicon pixels are intentionally **device-local for browser Sync** but are intentionally included in an explicit complete `.mosaicsync` profile export so a user can transfer the full profile between MosaicSync installations. Recovery retry diagnostics, Website Access UI memory, disposable render snapshots and Frequently Visited hidden-domain state remain excluded from profile exports.

Release identity has exactly one canonical, browser-valid numeric version string. Firefox manifest, Chrome manifest and `version_name`, shared `VERSION`, Settings labels, build manifest, package names, README/current docs, release notes and current-version tests must match exactly. MosaicSync never uses a separate internal/display/technical version. Corrective releases therefore use another valid numeric component (for example `1.26.17.1`) rather than a letter suffix. Unpublished candidate numbers do not receive standalone entries in the public `CHANGELOG.md`; their changes are folded into the next published release.

## 1.26.12 remote-image and local-asset integrity policy

Remote favicon decoding must remain bounded *before* `createImageBitmap` whenever MosaicSync can determine intrinsic dimensions from the resource header. Raster candidates with known geometry above the shared 4096px / 8-million-pixel background limit are rejected before optimization or raw-data fallback; safe SVG favicons likewise have their root raster geometry checked before decoding. PNG, GIF, JPEG, ICO/DIB and all standard WebP container variants stay covered by the pre-decode metadata path.

Content-addressed `storage.local` pixels must not be trusted solely because an ID is already listed in the local asset index. Exact bytes that were already hydrated/verified may use the in-memory fast path; otherwise the persisted value is checked before reuse. Missing/corrupt bytes are repaired atomically with the compact state write, while a valid-but-different value under the same content ID fails closed as a collision. Keep the verification cache pruned to live asset IDs so normal shortcut edits do not add repeated image reads or unbounded memory.

## 1.26.11 appearance lifecycle regression policy

1.26.11 keeps the 1.26.9 runtime appearance/wallpaper isolation architecture unchanged and closes its highest-value automated test gap. Permanent Firefox/Chrome behavioral tests execute the production preview/commit functions rather than only matching source text. They must prove that a live theme switch while Settings is open updates the isolated preview immediately, leaves the real `.page` background untouched, commits the authoritative background exactly once after the real Settings `close` event plus one animation frame, clears the preview state, and suppresses that commit if Settings is reopened before the frame runs.

The preview surface is a fixed first child of `#page`, not a DOM sibling. Native `<dialog>` top-layer painting remains above it. Do not move runtime DOM solely for terminology; keep the paint-isolation behavior stable.

The legacy favicon-quality upgrade repair is determined solely by the historical `previousVersion` range that needs repair. Do not reintroduce a current-`VERSION` allowlist: it creates dead historical entries and forces unrelated future release edits without changing migration semantics.

The current release is `1.30.9` across both browser manifests, Chrome `version_name`, shared `VERSION`, Settings labels and package filenames. Historical/internal-candidate references remain historical.

## 1.26.9 live appearance / wallpaper paint-isolation policy

1.26.9 completes the 1.26.5/1.26.8 Firefox paint workaround without reopening the original disappearing-Settings failure path. While Settings is open, Light/Dark/System theme skin changes remain immediate through `applyThemeSkinVisual()`, and the matching effective wallpaper now changes immediately as well.

The important invariant is that the real full-viewport `.page` background still **must not** be mutated while the open Settings surface is painted. `applyPageBackgroundVisual()` therefore mirrors the effective color/wallpaper onto the paint-contained `#appearancePreviewLayer` while Settings is open and marks one deferred authoritative commit. The preview layer is a simple fixed child surface containing a plain `object-fit: cover` `<img>` with no CSS `background-image`, filters, or backdrop effects. After Settings closes, the existing next-frame `commitDeferredAppearanceVisual()` updates the real `.page` background through normal `applySettings()` and hides/resets the preview layer. This also protects any unrelated Settings control that calls `applySettings()` while the dialog is open: the background portion is automatically routed to the safe preview layer.

Do not remove the preview layer by restoring direct `page.style.backgroundImage` / `page.style.backgroundColor` writes under an open Settings dialog, and do not duplicate persistence logic for wallpaper settings. State continues through the ordinary audited writer.

The 1.26.8 release remains the historical intermediate step that restored live theme skin but intentionally deferred the wallpaper itself.

The current version string must be `1.26.9` everywhere: Firefox/Chrome manifest versions, Chrome `version_name`, shared `VERSION`, Settings label, build manifest and package filenames. Historical release references remain historical.

## 1.26.7 folder drag-out stability policy

1.26.7 is a narrow functional fix on top of the 1.26.5 stable architecture. A shortcut nested in a folder may be dragged onto an empty top-level grid slot. The operation is implemented in shared `core/model.js` as `moveShortcutOutOfFolder()` so Firefox and Chrome use the same tested state transition. The UI continues to persist through the ordinary `saveState()` path; there is no drag-specific storage queue or message type.

The transition must preserve the shortcut ID/content, update mutation clocks, renumber remaining folder children, collapse a two-child folder to the remaining top-level shortcut, reject occupied destinations without partial mutation, and persist exactly once through the normal state writer. No new user-facing strings are required.

The current version string must be `1.26.7` everywhere: Firefox/Chrome manifest versions, Chrome `version_name`, shared `VERSION`, Settings label, build manifest and package filenames. Historical release references remain historical.

## 1.26.5 Settings appearance-isolation policy

1.26.5 is rebuilt from the clean 1.26.3 baseline after auditing and removing failed wallpaper-freeze workarounds. The current version string must be `1.26.5` everywhere: Firefox/Chrome manifest versions, Chrome `version_name`, shared `VERSION`, Settings label, build manifest, QA metadata and package filenames. Historical release references remain historical.

The Settings dialog is a paint-safety boundary. While `settingsDialog.open` is true, a change to the configured/effective appearance must **not** call `applySettings()` or otherwise mutate root `data-effective-theme`, `color-scheme`, page wallpaper/background styling or canvas-contrast styling. The appearance selector may update its own selected state immediately and state persistence continues normally. Active Light/Dark wallpaper changes follow the same rule. One deferred final appearance is committed from the Settings `close` event on the following animation frame, after the dialog has left its painted state.

Theme-wallpaper persistence uses the ordinary audited `saveState()` / `writeLocalState()` pipeline and its existing optimistic rebase, local-asset transaction and Sync-journal guarantees. Do not reintroduce the 1.26.2 compact `writeThemeWallpaperSettings()` writer, the 1.26.3 `mosaicsync:set-theme-wallpapers` background message, own-write echo signatures, separate theme-wallpaper persistence queues, or async visual-decode scheduling. Those mechanisms did not solve the paint failure and duplicated established persistence logic.

The 1.26.4 inline wallpaper-gallery experiment is rolled back. The 1.26.3 visual Light/Dark cards remain and continue to use the existing gallery. Bookmark folder colors, GitHub project links and unrelated 1.26.3 behavior remain intact. No new permissions, remote services, state/Sync/profile schema or custom-wallpaper binary behavior is introduced.

## 1.26.3 UI isolation policy

1.26.3 is the stabilization follow-up to 1.26.2. The current version string must be `1.26.3` everywhere: Firefox/Chrome manifest versions, Chrome `version_name`, shared `VERSION`, Settings label, build manifest, QA metadata and package filenames. Historical release references remain historical.

The Separate light/dark wallpapers controls must not persist directly from the New Tab document. The UI may update its three primitive in-memory fields and visible preview immediately, but the canonical compact write is owned by the background context through `mosaicsync:set-theme-wallpapers`. The UI path must not call `writeThemeWallpaperSettings()`, `saveState()`, `warmSessionRenderCache()`, render-manifest persistence, profile hydration/normalization or full `render()` as part of this preference transaction.

A New Tab pre-registers a lightweight echo signature derived from the compact Sync-relevant state plus local artwork references before sending the background message. An exact matching local-storage event is adopted only as the new compact write baseline and returns without hydration or rerender. Any concurrent state that does not match that exact echo signature follows the ordinary reconciliation path.

Light/Dark wallpaper selection uses visual buttons and the existing MosaicSync wallpaper gallery; do not reintroduce native `<select>` controls for these two selectors. Bookmark folder colors intentionally remain device-local, but when assigned they fill the full folder row/card with computed readable contrast rather than a subtle edge-only marker.

The canonical GitHub project URL is `https://github.com/xipinformatica/mosaicsync`; Settings and Welcome place it immediately after MPL 2.0 and before Support. No new permission, remote wallpaper provider, state/Sync/profile schema or custom-wallpaper binary behavior is introduced.

## 1.26.2 UI/persistence stabilization policy

1.26.2 is a focused correction to the 1.26 workflow features. The current version string must be `1.26.2` everywhere: Firefox/Chrome manifest versions, Chrome `version_name`, shared `VERSION`, Settings label, build manifest, QA metadata and package filenames. Historical changelog/QA references remain historical.

The Bookmarks dialog is modal. Its transient folder-color palette must be appended to the active `bookmarksDialog` *before* entering the Popover top layer, so it remains inside the modal's non-inert DOM subtree and can receive pointer/keyboard input in both Firefox and Chromium. The selected color must remain a bounded device-local preference and be visibly applied without changing bookmark data.

Light/dark wallpaper toggles/selectors must never call the generic image-aware `saveState()` path. They use `writeThemeWallpaperSettings()`, a compact settings-only transaction that patches only `themeWallpapersEnabled`, `lightBackgroundPreset` and `darkBackgroundPreset`, serializes with ordinary local writes, rebases concurrent-tab settings through the established field-level rules, and records the same durable Sync mutation journal when Sync is active. Heavy artwork hashing/projection is forbidden on this UI path. A concurrent rebase is the only case where the active Space is rehydrated.

No permissions, state/Sync/profile schema versions, localization keys, remote providers, bookmark data, or custom-wallpaper binary storage rules change in this release.

## 1.26.0 workflow feature release

1.26.0 adds narrowly scoped New Tab workflow improvements without introducing a third-party wallpaper service or new permissions. The current version string must be `1.26.0` everywhere: Firefox/Chrome manifest versions, Chrome `version_name`, shared `VERSION`, Settings label, build manifest, QA metadata and package filenames.

Light/dark wallpaper selection synchronizes only fixed built-in preset identifiers (`themeWallpapersEnabled`, `lightBackgroundPreset`, `darkBackgroundPreset`) through the existing settings record. Custom wallpaper bytes remain in the established device-local asset path; the existing current background is the fallback whenever a per-appearance preset is not selected. This changes local state schema 16→17 and Sync schema 8→9, while profile format stays v2.

The default-Space preference, bookmark-folder color map and Frequently Visited enable/count preferences are device-side UI preferences, not Sync state. The default Space and bookmark colors intentionally remain device-local because their semantics are device-specific and bookmark folder IDs are not a safe cross-profile identity. Frequently Visited count is profile-exported because it is portable UI preference, but it still does not enter browser Sync.

Shortcut right-click opens a background tab; middle-click remains native anchor behavior. Editing stays on the three-dot action. `Alt+Shift+1` and `Alt+Shift+2` switch Personal/Work only while MosaicSync itself has focus and do nothing while a dialog or form control is active. Frequently Visited right-click actions are localized; bookmark creation accepts only HTTP(S) URLs and invokes the existing optional bookmarks permission from the explicit menu click.

Bookmark folder colors use a bounded seven-color palette in localStorage and are pruned when corresponding local bookmark-folder IDs disappear. No Unsplash or other remote wallpaper provider is part of this release. All newly exposed copy is present in every one of the 32 UI catalogs.

## 1.25.16.1 version-consistency hotfix

1.25.16.1 is a tiny packaging/UI consistency follow-up to the submitted 1.25.16 build. Firefox and Chrome must use the exact same current version string everywhere: manifest `version`, Chrome `version_name`, shared internal `VERSION`, user-visible Settings version label, build manifest, package filenames, QA metadata and current-version regression expectations. The runtime behavior, localization loader fix, permissions, Sync/storage/profile schemas, favicon architecture and UI strings are otherwise unchanged. Permanent tests require the Settings label and manifests to match the shared runtime version so a stale displayed version cannot ship again.

## 1.25.16 validator-clean locale loading

1.25.16 removes the AMO static-validator warning caused by `import(modulePath)` in the shared UI locale loader. The lazy-loading architecture remains, but every non-English catalog is now behind a fixed loader function whose `import()` argument is a literal bundled `./i18n-locales/*.js` path. Do not reintroduce variable/computed runtime import targets. Both Firefox and Chrome use public/internal version `1.25.16`; Chrome also exposes `version_name: 1.25.16`. No new UI strings, permissions, persisted schemas, Sync behavior, or profile-format changes are part of this release.

## 1.24.14m3 unified legal-link migration

1.24.14m3 is intentionally a link-only patch on top of 1.24.14m2. All in-extension Privacy and MPL links must target the unified single-file website anchors `#privacy` and `#license`; the retired `/privacy/` and `/license/` paths must not appear in runtime source. Technical browser version: `1.24.14.15`; Chrome `version_name`: `1.24.14m3`.

## 1.24.14m2 mascot pill rasterization fix

1.24.14m2 is intentionally a visual-only patch on top of 1.24.14m1. Welcome and Settings must render the Donate mascot “Thank you!” pill with an inset 1 px ring rather than a physical rounded border, avoiding the two bright edge pixels seen from border anti-aliasing. Keep its geometry, localized text, animation and interaction unchanged. Technical browser version: `1.24.14.14`; Chrome `version_name`: `1.24.14m2`.

## 1.24.14m1 EU localization and tooltip policy

1.24.14m1 is intentionally localization/UI-only on top of the 1.24.14m runtime. Every supported UI catalog must have exact key and placeholder parity with English, and the browser selector/autodetection layer must recognize every published locale. The eleven added EU locales are Bulgarian, Croatian, Estonian, Greek, Hungarian, Latvian, Lithuanian, Maltese, Romanian, Slovak and Slovenian; together with the existing catalogs MosaicSync covers all 24 official EU languages. Chrome platform adaptation is regression-tested so browser-brand inflection cannot leave Firefox/Mozilla wording in the new Chrome catalogs.

Localized mascot greetings must be content-sized rather than assuming English string width. Viewport-portaled help tooltips must become non-renderable before their active fixed-position class is removed or the node is restored to its clipped wrapper; this prevents Firefox from painting a transient legacy-position frame during CSS teardown. These UI rules do not alter Sync/storage semantics.

## 1.24.14m convergence, retry and localization hardening

1.24.14m is the corrective release from the comprehensive 1.24.14l self-audit. Live Sync records compare the cross-Space namespace-generation marker (`spaceMoveAt`) before ordinary modification time; this removes a three-device winner cycle while keeping tombstones stronger than stale ordinary edits. Property tests permanently require the merge primitive to be commutative, associative and idempotent.

Sync-relevant New Tab writes also persist `mosaicsync.pending-sync-mutation.v1` atomically with the compact local state. The journal keeps the oldest unsent before-state and newest local after-state, so multiple edits coalesce without losing deletions. Publication failure leaves the journal intact; startup and the five-minute Sync watch retry it before any remote-revision short-circuit, and journal IDs prevent an older completion from clearing newer work. Cross-Space moves continue to use their existing independent destination-first transaction journals.

Mutation clocks use `nextMutationTime()` to advance beyond observed record/workspace clocks, including imported future clocks. User-facing dynamic Sync and automatic-icon status is rendered through localization keys instead of background-generated English; warning metadata is structured (`syncSkippedAssets` / `syncFastSnapshotFallback`) and the local meta schema advances to 11. All 21 catalogs retain identical keys/placeholders, browser timing copy is cadence-neutral, and Polish/Swedish/Korean Space terminology is consistent. The favicon engine, local asset GC architecture, device-snapshot commit ordering and profile format are deliberately unchanged.

## 1.24.14l fault-injection hardening

1.24.14l keeps the 1.24.14k/j model and favicon behavior intact and focuses on persistence failure boundaries. Local content-addressed assets now carry an optional `pendingGcIds` retry list inside the existing local asset-index object. The list is written atomically with the compact state and current asset index whenever old pixels become stale. If post-commit deletion fails or the browser stops before cleanup completes, a later startup re-reads current compact references under the asset write lock and only deletes IDs that are still unreferenced. This is an additive field inside the existing asset-index schema, not a schema-version change.

Per-device Sync snapshots retain root-last double buffering. Before a chunked publish, only the inactive target slot may be cleared; after the new root commits, chunks not named by the new root are best-effort reclaimed. This prevents stale historical chunk tails/opposite slots from consuming Sync quota indefinitely while preserving the previous authoritative generation if the new root write fails. Snapshot gzip decoding also enforces the decompressed-byte ceiling incrementally while streaming.

The live-state ID invariant is pinned explicitly: record IDs are unique within each Space, but the same logical ID may temporarily exist in both Personal and Work during destination-first cross-Space convergence. Hostile profile import remains the boundary that repairs ambiguous cross-Space duplicate IDs.


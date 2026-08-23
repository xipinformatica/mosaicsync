## 1.26.13b

- Fixed a Firefox-only Frequently Visited regression introduced in 1.26.13. Firefox now imports the shared `getNativeTopSites()` browser adapter before calling it, so enabling Frequently Visited correctly loads native Top Sites instead of silently falling back to an empty cached list.
- Added permanent Firefox/Chrome regression coverage that verifies the Frequently Visited code imports the platform adapter it calls, plus an executable Firefox adapter test confirming the expected `browser.topSites.get()` options and result bound.
- No UI, permissions, Sync/profile schema, first-frame snapshot, drag/drop, hidden-domain, wallpaper, folder or favicon-hardening behavior changed.
- Public release label is `1.26.13b`; Chromium-compatible technical manifest version is `1.26.13.1`.

## 1.26.13

- Removed the **Frequently Visited** startup layout jump by caching a tiny bounded, device-local display snapshot in MosaicSync's existing first-frame render manifest. New Tabs can paint the last known suggestions with the shortcut grid immediately, then refresh them asynchronously without delaying first paint or synchronizing browser-history data.
- Frequently Visited cards can now be dragged directly onto an empty grid slot to create a normal MosaicSync shortcut at that exact position; the existing context-menu action remains available.
- Added **Hide this site** to Frequently Visited. Hiding is persistent and device-local, uses the bundled Mozilla/Public Suffix List to block the whole registrable site family (including subdomains), and does not enter Sync or profile backups.
- Added a one-time, non-blocking Website access callout for existing users when automatic favicon learning is enabled, useful shortcuts still need icons, and HTTP/HTTPS host access has not been granted. Website access remains an optional permission requested only from a user gesture.
- Completed the 1.26.12 remote-image hardening: SVG root geometry is now parsed with quote-aware opening-tag scanning so a literal `>` inside a quoted attribute cannot hide oversized dimensions, and unknown raster dimensions fail closed before remote browser decoding.
- Added localized **Hide this site** text to all 32 UI catalogs and focused Firefox/Chrome regression coverage for the new Frequently Visited, permission and image-safety behavior. No Sync/profile schema or required-permission changes were introduced.

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

> **INTERNAL CANDIDATE — not a public MosaicSync release.** Superseded by public 1.27.8.9.

# MosaicSync 1.27.8.3 publication notes

## Scope

1.27.8.3 is the second focused New Tab performance pass for older/slower desktop CPUs. It targets work that still sat on the first-visible/first-interactive path after 1.27.8.2: blocking CSS, late authoritative local-storage I/O, cold-start destruction/reconstruction of an already-valid bootstrap grid, invisible closed-folder artwork, and eager construction of a future-write baseline.

It does **not** change Sync/profile/state schemas, synchronized conflict/tombstone semantics, permissions, host permissions, CSP strength, navigation safety, image/SVG trust-boundary validation, import handling, telemetry policy, remote-code policy or artwork quality.

## Mozilla Add-ons concise changelog

New Tab performance follow-up for older/slower computers. MosaicSync now loads a much smaller critical launcher stylesheet before first paint, overlaps authoritative local-storage I/O with UI setup, safely adopts an exact-matching cold-start bootstrap grid instead of rebuilding it, hydrates only the four visible artwork cells of closed folders before perceived completion, and reuses the exact compact persisted state as its future-write concurrency baseline. Added local-only startup phase timings for profiling. The full renderer remains the fallback whenever bootstrap adoption is uncertain. No new permissions, Sync/schema changes, CSP relaxation, telemetry or image-quality reduction.

## Mozilla Notes to Reviewer

This release changes only New Tab startup/render scheduling and local asset hydration. There are no permission, host-permission, Sync schema, profile format, remote-code, telemetry or CSP changes.

The main performance changes are:

1. `newtab-critical.css` is a reviewed subset of the existing New Tab styles needed for the visible launcher shell. It is the only stylesheet linked synchronously in `newtab.html`. `secondary-style-bootstrap.js`, an external packaged script, waits through two `requestAnimationFrame` callbacks so the critical launcher receives a paint opportunity, then appends the existing complete `newtab.css`. No inline event handler or `unsafe-inline` exception is used.
2. `newtab.js` begins `readLocalStorageRaw()` immediately after its core module graph evaluates, so extension-storage IPC overlaps localization/listener setup. Heavy state normalization is still intentionally deferred until the bootstrap/session projection has had a paint opportunity.
3. The cold authoritative path can adopt the already-painted bootstrap grid only after a strict structural match: active Space, state/settings clocks, rows/columns/tile size/brand visibility, current ordering, shortcut IDs/types/titles/navigation targets, and first-four folder child IDs. If any check fails, the established `render()`/`grid.replaceChildren()` path runs unchanged.
4. Current-schema startup hydrates image bytes for only the first four children of closed folders. All child records, URLs, positions and `localImageAssetId` references remain present and authoritative. Remaining pixels are loaded in one idle batch after perceived completion or immediately if the folder is opened before that batch.
5. Normal current-schema startup clones the exact compact state already read from `storage.local` as the optimistic-write baseline rather than immediately projecting the hydrated render state back into compact form. Migration paths still construct a canonical write baseline explicitly, and the existing write transaction still normalizes/canonicalizes the baseline before rebase.
6. Startup timing markers are stored only in `globalThis.__mosaicsyncStartupTiming` inside the current New Tab page. They are neither persisted nor transmitted and are not telemetry.

Regression coverage includes both Firefox and Chrome, visible-only folder asset reads, deferred folder completion, compact-baseline reuse, early local-read ordering, CSP-safe critical/secondary CSS delivery, strict bootstrap-adoption fallback, folder-child identity checks and non-persistent timing diagnostics. The full release suite passes 441/441 tests.

## Chrome Web Store changelog

Faster New Tab startup on older/slower PCs. Reduced blocking first-frame CSS, started local state I/O earlier, avoided an unnecessary cold-start grid rebuild when the cached grid exactly matches current state, deferred invisible closed-folder artwork, and removed an eager read-only write-baseline projection. No new permissions or behavior changes.

## GitHub Desktop commit

**Summary:** `Release MosaicSync 1.27.8.3`

**Description:** `Optimize the New Tab critical path with a smaller first-frame stylesheet, early local-storage overlap, strict cold bootstrap-DOM adoption, visible-only closed-folder artwork hydration, compact baseline reuse and local-only startup timing.`

## GitHub release

**Title:** `MosaicSync 1.27.8.3 — Faster New Tab critical path`

**Body:**

MosaicSync 1.27.8.3 is the second focused performance pass aimed at making New Tab feel immediate on older/slower desktop CPUs. The first-frame launcher now blocks on roughly one-third of the previous CSS source instead of the full stylesheet, while the complete UI stylesheet loads after the launcher has had a paint opportunity. The authoritative local state read begins earlier and overlaps UI setup, and an exact-matching cold bootstrap grid can be upgraded in place instead of being destroyed and recreated.

Closed folders remain fully authoritative but initially hydrate only the four child artworks that can actually appear in their mosaic; hidden child pixels are warmed after perceived completion or immediately on folder open. Normal startup also reuses the exact compact persisted state as the future-write baseline instead of projecting the image-heavy render state back into compact form.

The established full renderer remains the safety fallback whenever the bootstrap is not an exact match. Sync behavior, profile/state schemas, security validation, CSP, permissions, navigation safety and artwork quality are unchanged. Local startup timings are diagnostic only and never persisted or transmitted.

Full release validation: 441/441 tests passing for the final source tree before packaging.

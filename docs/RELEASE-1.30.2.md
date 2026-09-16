# MosaicSync 1.30.2 publication notes

## Public predecessor

MosaicSync 1.30.2 is the direct maintenance successor to 1.30.1.

## Mozilla changelog

Zero-new-features Snow Leopard refinement release: Light/Dark theme switching now shows the matching configured wallpaper immediately while Settings remains open without invoking the broad launcher renderer; favicon quality completion no longer treats partial redirected/original-origin scans as complete; device-local favicon audit-ledger writes are serialized and reject non-finite metadata; cancelled manual favicon discovery cannot restart after awaited bookkeeping; identical render-manifest rewrites are avoided; and production Long Task diagnostics are developer-gated. No new permissions, schemas, CSP changes, telemetry, remote code or user-facing features.

## Notes to Reviewer

Corrective maintenance only. This release narrows the Settings appearance path so an explicit Light/Dark selection paints the already-configured matching wallpaper immediately while unrelated full-page work remains deferred. It also hardens favicon quality-audit completion/ledger concurrency, adds a stale async-cancellation check, removes one redundant local render-manifest write, and gates developer-only Long Task observation. No permission, storage/Sync/profile schema, CSP or remote-code changes.

## Chrome release notes

Zero-feature corrective refinement with immediate Light/Dark wallpaper switching, more accurate and race-safe favicon quality auditing, stale favicon-discovery cancellation, less disposable cache writing and developer-only performance observation. No new permissions.

## GitHub release title

`MosaicSync 1.30.2`

## GitHub release description

MosaicSync 1.30.2 continues the Snow Leopard refinement cycle without adding features. The Light/Dark appearance selector now updates its configured wallpaper immediately while Settings remains open, using a narrow page-paint path that avoids the broad launcher renderer. Favicon quality recovery now keeps partial original-origin scans provisional, serializes completed-audit ledger writes and rejects non-finite ledger metadata. The manual detected-favicon flow rechecks cancellation after awaited bookkeeping, the disposable first-frame render manifest avoids identical rewrites, and production New Tabs no longer install Long Task diagnostics unless developer metrics are enabled. Existing permissions, Sync/profile/storage schemas, CSP and security boundaries are unchanged.

## GitHub Desktop commit

**Summary:** `Release MosaicSync 1.30.2`

**Description:** Zero-new-features corrective refinement. Fixes immediate Light/Dark wallpaper switching, hardens favicon quality completion and concurrent audit-ledger writes, cancels stale manual favicon work after awaited bookkeeping, removes an identical render-manifest rewrite, and gates Long Task diagnostics behind developer metrics. 536/536 automated tests pass; no permission, schema or CSP changes.

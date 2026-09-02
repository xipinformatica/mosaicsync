# MosaicSync 1.30.18.11 publication notes

## Mozilla Developer Hub changelog

Completes the current Step 2.2 ownership/concurrency corrective pass. Active-Space and startup-repair ownership are now serialized under one persistence boundary, independent setup/UI meta changes preserve unrelated concurrent fields, and structural session warming can no longer write Frequently Visited data. Frequently Visited favicons now use bounded session-only first-paint derivatives and decode before atomic visible commit, while Light/Dark Settings previews update canvas text/shadows immediately without re-enabling the full-page repaint that is intentionally deferred while Settings is open. No feature, Sync/Recovery/profile schema, permission, CSP, telemetry or backend change.

## Notes to Reviewer

MosaicSync 1.30.18.11 is a zero-feature Step-2.2 corrective release based on the final 1.30.18.10 ownership/concurrency audit. It intentionally does not begin Step 2.3.

The existing cross-context Web Lock remains physically named `mosaicsync.local-assets.write.v1` so a rolling update cannot split old and new extension contexts into different lock domains. The source helper is renamed to `withPersistenceWriteLock()` because the lock now explicitly protects the broader persistence boundary. Ordinary structural profile persistence no longer writes the device-local active-Space pointer. The dedicated `writeActiveSpace()` path is the pointer owner, and structural session publication derives active Space from that persisted pointer while the lock is held, preventing a stale structural writer from visually restoring an older Space through the session accelerator.

Startup repair is no longer an unlocked replay of values inferred from the initial startup read. If active-Space or local meta appears missing/invalid, MosaicSync acquires the persistence lock and re-reads current `storage.local` authority before writing. Only values that remain missing/invalid are repaired. This prevents delayed startup materialization from overwriting a newer active-Space or meta write that completed after the original read began.

Independent setup/UI meta transitions now use `updateLocalMeta()`. That helper re-reads the current meta record under the persistence lock, applies only fields explicitly intended by the caller, preserves the current device identity/schema ownership, writes the merged record, and updates the disposable session meta accelerator before releasing the lock. Existing coherent Sync/status state-machine transitions retain full-record `writeLocalMeta()` semantics, which are themselves serialized through the same lock.

Frequently Visited keeps the physical key separation introduced in 1.30.18.10, but the remaining structural warm-up side door is removed: neither structural session publication nor `warmSessionRenderCache()` can accept or write an FV projection. The dedicated FV session writer is therefore the only browser-history candidate owner.

For FV first-paint artwork, native Top Sites favicons that exceed the small session projection budget are now reduced to a bounded 48 px derivative using the existing image optimizer rather than being silently dropped from the warm projection. FV cards are built in a detached fragment; each favicon is decoded before that fragment replaces the visible list, and decode failures are converted to the normal fallback before commit. A slow decode can therefore delay only the new detached strip, never expose a card that visibly gains its favicon after commit. The derivative remains browser-local disposable presentation data: it is not added to profile state, persistent localStorage, Sync, Recovery or export.

The Settings appearance safety boundary remains intact. While Settings is open, `applyPageBackgroundVisual()` continues to paint only the isolated preview layer and defer the expensive full-page wallpaper/background/dim commit. The lightweight `data-canvas-text` presentation attribute now updates before that early return, so Light/Dark preview text and shadows match the visible preview immediately rather than retaining the previous appearance until Settings closes.

New Firefox/Chrome regressions cover active-Space single ownership, session active-Space derivation, stale startup repair after newer authority, independent meta-patch interleaving, device-identity preservation, stable rolling-version Web Lock naming, structural/FV key isolation, bounded FV derivative generation, decode-before-visible-commit ordering, session-only FV privacy and Settings-open canvas-text ordering. Existing FV permission recovery, startup cache authority, Sync/Recovery, artwork, localization, CSP and release-contract suites remain intact.

No manifest permissions were added or removed. No synchronized/state/meta/profile/recovery schema version changed. No telemetry, analytics or MosaicSync-operated backend was introduced.

## Chrome Web Store release notes

Refines startup and persistence reliability without changing features. Active-Space and startup repair now have stricter single-owner concurrency rules, independent setup metadata updates preserve unrelated current fields, Frequently Visited favicon first paint is atomic with bounded session-only artwork, and Light/Dark Settings previews update text/shadows immediately while full-page background painting stays safely deferred. No permission, Sync/Recovery schema or privacy change.

## GitHub release title

`MosaicSync 1.30.18.11`

## GitHub release description

MosaicSync 1.30.18.11 closes the remaining Step 2.2 ownership/concurrency findings from the 1.30.18.10 audit. Active-Space has one physical pointer owner, startup repairs re-read authority under the persistence lock, independent meta patches preserve concurrent fields, and structural session warming no longer has an FV write path. Frequently Visited now keeps bounded session-only favicon derivatives and commits cards only after favicon decode settles, while Settings Light/Dark previews immediately update canvas text/shadows without sacrificing the deferred full-page repaint safeguard. The release remains zero-feature and preserves existing Sync/Recovery schemas, permissions, privacy and backend-free operation.

## GitHub Desktop

**Summary:** `Release MosaicSync 1.30.18.11`

**Description:** `Close Step 2.2 persistence ownership gaps and harden FV/appearance first-paint continuity.`

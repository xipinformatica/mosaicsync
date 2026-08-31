# MosaicSync 1.30.18.8 publication notes

## Mozilla Developer Hub changelog

Completes Step-1.2 first-paint hardening before cache consolidation: Top Sites permission removal now leaves a session-only suppression marker that survives a missing render snapshot and later background state writes, the early session handoff clears stale Frequently Visited cards from an older boot cache, and granting permission removes that marker without changing the synchronized Show preference. Shared session-cache dedup now verifies the actual browser.session value before skipping a write, preventing one extension context's stale in-memory fingerprint from being mistaken for shared-cache truth. Adds no feature, permission, normal Sync/Recovery/profile schema, CSP, telemetry or backend change.

## Notes to Reviewer

MosaicSync 1.30.18.8 is a zero-feature Step-1.2 hardening release before the maintainability plan begins physically consolidating startup/cache paths.

1.30.18.7 cleared the device-local `storage.session` Frequently Visited projection when the optional Top Sites permission was removed. Audit showed two lifecycle gaps: if no full session render snapshot existed there was nothing to clear, and a later generic background profile write could replace the explicit empty projection with `frequent: null` (the contract's preserve/no-op state).

1.30.18.8 adds one tiny device-local session-only suppression marker. Permission removal sets this marker regardless of whether a render snapshot currently exists. It is included in the same early `storage.session` read already used for startup acceleration, so the New Tab module can clear an older synchronous Frequently Visited strip even when the full session render state is absent. Generic background state writes consult the marker and preserve an explicit empty FV projection while it is active. Granting Top Sites permission clears the marker. The synchronized Show/Count preference, browser history and normal permission request flow are not changed.

The release also corrects the ownership assumption behind session-cache write deduplication. Render-state/meta fingerprints remain useful as a cheap candidate for a no-op, but a context now verifies the actual shared `storage.session` value before suppressing the write. This prevents a New Tab/background context from assuming that another extension context left the shared cache unchanged. Truly identical shared bytes still avoid the rewrite.

New cross-browser behavioral tests cover permission suppression with no render snapshot, survival across unrelated background writes, permission restoration wiring, multi-context session-cache mutation, true identical-byte no-write behavior, background-only Space renames and background favicon learning. Architecture documentation explicitly records the remaining browser-platform boundary: a background/MV3 worker cannot synchronously rewrite a New Tab page's localStorage render manifest. No additional persistent cache is introduced; Step 2 will use the now-tested session handoff to decide how to reduce/consolidate that persistent layer.

No manifest permissions were added or removed. No synchronized/state/profile/recovery schema changed. Work shortcut-grid safety, CSP, safe navigation, privacy boundaries, telemetry/analytics policy and backend-free architecture are unchanged.

## Chrome Web Store release notes

Hardens New Tab startup state before cache consolidation. Frequently Visited permission removal is now remembered in device-local session state even if no render snapshot exists, remains effective across unrelated background writes, and is cleared when permission is restored. Session-cache dedup also verifies the real shared browser session value before skipping writes, improving correctness across multiple extension contexts without changing features or Sync behavior.

## GitHub release title

`MosaicSync 1.30.18.8`

## GitHub release description

MosaicSync 1.30.18.8 completes the Step-1.2 hardening pass before Step 2 begins consolidating startup paths. It makes Frequently Visited permission invalidation durable across the browser-session lifecycle, hardens shared session-cache ownership across multiple extension contexts, and adds explicit no-New-Tab regressions for background Space-name and favicon changes. Existing features, Sync/Recovery schemas, permissions, privacy and security boundaries remain unchanged.

## GitHub Desktop

**Summary:** `Release MosaicSync 1.30.18.8`

**Description:** `Harden first-paint permission lifecycle and shared session-cache ownership before Step 2.`

# MosaicSync 1.30.7 publication notes

## Release status

MosaicSync 1.30.7 is a zero-new-features performance/refinement release on top of 1.30.6. It preserves the existing browser-native Sync and conflict model while removing repeated trusted-state normalization, compact-baseline reconstruction and duplicate foreground freshness work. No user-facing feature or permission surface changes.

## Validation

Automated release gates pass after final packaging: full regression suite, performance benchmark, reviewed package-size guard, ZIP integrity and clean-source reproducibility. The benchmark now includes a large image-heavy Cross-Space move/Sync-intent path so future regressions in the new normalized fast path are visible.

## Mozilla Developer Hub changelog

Zero-new-features performance/refinement release. Trusted internal Cross-Space operations now reuse already-normalized state instead of repeating full image-heavy normalization; local writes and favicon commits reuse exact compact persisted baselines instead of rebuilding them. Simultaneous foreground Sync freshness requests from multiple New Tabs share one in-flight reconciliation while preserving immediate post-check freshness, and the foreground throttle now uses a monotonic clock. Publication avoids redundant serialization when the delivered remote record already wins, workspace clock changes use a positive fast path with semantic fallback for equal clocks, and unchanged Settings geometry avoids repeated root style writes. Proven-dead Settings CSS was removed without changing the single-scroll-owner architecture. No new features, permissions, synchronized/profile schema, backend, telemetry, remote code, heartbeat or watchdog-frequency change.

## Notes to Reviewer

Corrective/refinement maintenance only. 1.30.7 retains the 1.30.6 Sync publication rebase, post-write authoritative ledger, deterministic conflict/tombstone rules and five-minute semantic watchdog. The main runtime changes avoid duplicate work after trust boundaries: new internal normalized Cross-Space helpers bypass repeated `normalizeState()`/record/settings normalization when callers already hold normalized state; `writeLocalStateWithBaseline()` returns the exact compact state actually persisted and accepts a caller-declared compact optimistic baseline so New Tab and favicon paths do not reconstruct it from hydrated image-heavy state. Defensive public wrappers remain unchanged for raw/untrusted input.

Foreground `mosaicsync:reconcile-if-needed` requests are coalesced only while one foreground check is currently queued/running; there is no time-based completed-result cache, so a remote change delivered immediately after a completed check is not hidden. The existing five-minute watchdog remains unchanged. Expected own Sync echoes no longer overwrite the last unexpected remote-delivery forensic event, while watchdog diagnostics remain device-local in `storage.local`.

The Settings cleanup removes only dead `<aside>` `::backdrop` and superseded inner max-height declarations. The outer Settings surface remains the sole vertical scroll owner and the inner form remains `max-height:none; overflow:visible`. No permissions, network scope, CSP, synchronized/profile schema, telemetry, remote code or user-facing behavior changes.

## GitHub release title

`MosaicSync 1.30.7`

## GitHub release description

MosaicSync 1.30.7 is a zero-feature performance/refinement release. It removes repeated full-state normalization and compact-baseline reconstruction from hot Cross-Space/write/favicon paths, coalesces simultaneous multi-tab foreground Sync checks into one in-flight reconciliation, trims redundant publication serialization/storage work, and cleans proven-dead Settings CSS while preserving all 1.30.6 Sync correctness and privacy guarantees. The five-minute semantic watchdog, post-write authoritative ledger, conflict/tombstone behavior and user-visible UI remain unchanged.

## GitHub Desktop commit

**Summary:** `Release MosaicSync 1.30.7`

**Description:** `Remove redundant normalization/baseline work, coalesce simultaneous foreground Sync checks, trim serialization/style overhead, and preserve all 1.30.6 correctness/privacy behavior. Zero new features or permissions.`

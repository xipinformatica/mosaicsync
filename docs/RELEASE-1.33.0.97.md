# MosaicSync 1.33.0.97 publication notes

## GitHub release title

`MosaicSync 1.33.0.97`

## Firefox Add-ons — What's new

Fixed a rare Sync issue where an unrealistic future timestamp from another device could interfere with later shortcut changes. Your shortcuts and Recovery copies are preserved.

## Chrome Web Store — What's new

Fixed a rare Sync issue where an unrealistic future timestamp from another device could interfere with later shortcut changes. Your shortcuts and Recovery copies are preserved.

## GitHub release notes

- Ignores untrusted, excessively future-dated Sync clocks when comparing shortcut, deletion, move, Settings and dataset changes.
- Keeps legitimate future-dated clocks within a generous 402-day trust window; preserved local data and deletion evidence are not rewritten just to sanitize their timestamps.
- Prevents a poisoned Sync clock from exhausting the local mutation clock and prevents a poisoned revision from incorrectly choosing a stale atomic Recovery source. At the precise moving-window boundary, a pending edit waits with its local journal until a strictly newer timestamp is safe to publish.
- Adds regression coverage for ceiling values, Settings group clocks, tombstones and the Recovery source-selection boundary.
- Rolling-update limitation: a still-running 1.33.0.96 device can republish poisoned clocks until it also upgrades.
- No new permissions, telemetry, network endpoints or storage protocol changes.

Signed-in real multi-device Sync remains unverified; desktop browser validation remains recommended before publication.

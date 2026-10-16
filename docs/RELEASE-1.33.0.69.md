# MosaicSync 1.33.0.69 publication notes

**PRIVATE CANDIDATE — DO NOT PUBLISH before independent audit and real Sync certification.**

## Public changelog (cumulative from published 1.33.0.63)

- Improves concurrent/offline Sync conflict handling across Personal and Work.
- Adds durable deletion safeguards that help prevent stale changes from restoring deleted shortcuts.
- Fixes remote-reset edge cases so old deletion history and interrupted changes cannot overwrite shortcuts restored into a new Sync history.
- Improves independent Space synchronization and localized waiting statuses in 34 languages.
- Adds font-independent + icons with precise centering and High Contrast / forced-colours visibility.
- No new browser permissions, telemetry or external network destinations. Existing shortcuts and backup files remain compatible.

## Reviewer notes

This candidate adds an atomic, local-only cleanup of obsolete deletion evidence when a peer-initiated explicit Sync reset is observed. The existing persistence lock protects the transition, and the old deletion-evidence journal is removed in the same storage.local.set as the await-remote authority metadata. The first complete post-reset bootstrap also clears old pending Sync mutations before enabling the new authority, covering ambiguous storage errors where the earlier cleanup may have rolled back pending journals. No Sync protocol, recovery snapshot, browser permissions, network requests, UI or translations change from 1.33.0.68; changes since the public 1.33.0.63 include internal Sync repair-witness and deletion-safety metadata. Test with an old-epoch tombstone, a peer reset marker, a complete replacement profile reusing a shortcut ID, then a torn update: the replacement shortcut must remain live. Full signed-in multi-device Sync validation remains an internal release gate.

## GitHub release title

`MosaicSync 1.33.0.69`

## Release gates

Independent source and simulated-browser audit; red/green regression; full suite; reproducible packages; six GitHub jobs; real signed-in two-device Sync verification.

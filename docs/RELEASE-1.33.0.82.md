# MosaicSync 1.33.0.82 publication notes

**PRIVATE STABLE CANDIDATE — NOT APPROVED FOR PUBLICATION.**

## GitHub release title

`MosaicSync 1.33.0.82`

## Proposed simple store changelog (cumulative since last confirmed public 1.33.0.63)

- Makes synchronization and recovery more reliable, especially when computers reconnect after a Sync reset or receive changes out of order.
- Improves the safety of keeping local changes and avoids accepting incomplete Personal and Work layouts.
- Adds a clearer warning before clearing the synchronized copy: update and connect your other computers and let them finish syncing first.
- Includes small accessibility improvements. No tracking, new permissions, or new account requirements.

**Known limitation:** If another computer remains offline through a Sync reset, it may need you to choose which layout to keep when it reconnects. Export a backup first. This situation is not claimed fixed by 1.33.0.82.

## Mozilla reviewer notes

Based byte-for-byte on the independently audited 1.33.0.71 K1 source (SHA-256 `882c573dcf268f9adabac490f1800edba0d1e7ae9eb9ab6d6e30f711e0cfec46`). Version updates plus a confirmation-only user-interface warning in `src/shared/newtab/newtab.js`, translated in 34 UI locales. The production background, Sync/Recovery logic, permissions, schemas and persisted formats are unchanged. Experimental Stage 3B code from private builds .72–.81 is not included. All existing K1 reset and Recovery protections remain.

Before publishing, require an independent exact-package audit, six GitHub release jobs for the exact committed bytes, and real signed-in Chrome/Firefox two-device reset testing (or explicitly mark it NOT PERFORMED). Publication requires owner authorization.

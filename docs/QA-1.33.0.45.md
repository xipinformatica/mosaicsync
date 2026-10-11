# MosaicSync 1.33.0.45 QA / release-candidate checklist

## Scope and authoritative baseline

- Based on the published 1.33.0.44 GitHub-ready source SHA-256 `0cbc903f3fa794d549bf79b7817a4a6968f6b4c4f9a3279c73e4c3149629fa90`.
- Neofix stage 1: fix the Chrome/Chromium callback-only message listener incompatibility at existing browser versions. Chrome manifest still supports version 104; Firefox retains its established API. No Sync/Recovery protocol modifications.
- Storage-full profile import now advises about extension storage limits, suggests smaller-image backups, and cautions users to back up their current layout before deleting imagery.
- All 33 UI locale catalogs updated. No new permissions, CSP or storage format changes.

## Validation

- Red-before-green: `tests/neofix-133045.test.mjs` checks actual background registration/commands with callback-only Chrome semantics in both browser adapters. Unsupported and foreign-sender requests still receive no privileged replies. The .44 implementation fails these tests.
- Complete Node regression inventory, all focused groups, release identity, runtime reachability, package contracts, package-size census.
- Rebuild all three ZIPs from the extracted GitHub-ready source and compare byte-for-byte checksums.
- **Browser smoke requirement:** install packaged code in a *real* Chrome/Chromium at or below 147 and current Chrome, plus Firefox; use a clean profile to complete Welcome setup and verify a background round trip. If unavailable, explicitly report it as NOT CERTIFIED and do not claim a real-browser GO.

## Known limitations / exclusions

- Repairing other devices with historically poisoned Sync clocks remains a separate protocol investigation.
- Some image-heavy backups may exceed the fixed Chromium storage allocation even on a fresh installation. The import aborts without losing the existing profile; this release improves advice but does not raise permissions or limits.
- Neofix icon redesign, QA automation improvements and architectural extractions remain deferred.

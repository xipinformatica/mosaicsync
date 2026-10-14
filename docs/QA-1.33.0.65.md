# MosaicSync 1.33.0.65 QA / release-candidate checklist

**PRIVATE HOLD — not approved for public release.** Baseline: corrected .64 source ZIP SHA-256 `b288a19c1742b1b0a1a7c168c1e18b0d1e67b4e34b96580bb945a9a459c3c0c9`.

## Mandatory verification

1. On an initialized profile with Personal torn and Work healthy, Work changes still arrive and Settings shows a **waiting** headline with an explanatory sentence, not **Sync ready** or an empty detail.
2. Repeat in reverse: Work torn, Personal healthy. The healthy Space must continue syncing while the other waits.
3. Verify the waiting warning remains after the healthy Space clears its own Sync warning, and that a completed repair restores the ordinary ready state.
4. Check both waiting strings in all 34 locales, especially Catalan, Spanish and Italian; the English warning persisted by older builds must translate through `translateText`.
5. Run the .64 48-scenario matrix, missed-event deletions, retired-device mixed-version tests, partial-delivery safeguards, and real-Chromium RX/RXR to ensure the protocol behavior is unchanged.
6. Compare `sync-ledger-repair.js`, `storage.js`, Sync schema and permissions byte-for-byte with corrected .64. Only the final pending-warning assignment in `background-core.js` may change in the protocol orchestration.
7. Full automated suite, deterministic rebuild of all three ZIPs, independent browser audit, GitHub six-job release gate, and real signed-in two-device verification before publication.

## Known limitations

Retired author device IDs or an old .63 peer can keep their own Space waiting until a new edit or missing witness arrives. Witness metadata is not garbage-collected. Deletions authored on .63 do not benefit from .64 durable evidence. Remote-initiated reset handling, real Firefox, and actual signed-in Chrome/Firefox two-device convergence remain unverified. No production publication authorized.

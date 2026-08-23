# MosaicSync 1.24.14l QA contract

1. Firefox and Chrome technical manifest versions are `1.24.14.11`; Chrome exposes `version_name: "1.24.14l"` and Firefox must not contain `version_name`.
2. `VERSION` is `1.24.14l`. Direct upgrades from technical versions 1.24.14 through 1.24.14.4 still receive the one-time favicon-quality repair.
3. A failed/broken `storage.local.remove()` after an otherwise successful local state+asset commit must not forget stale artwork forever: the asset index persists a bounded `pendingGcIds` retry ledger and later startup cleanup rechecks the authoritative compact state before deleting.
4. If a pending-GC asset becomes referenced again before cleanup, cleanup must preserve its pixels, restore it to the active asset index, and clear the stale retry marker.
5. Device snapshot decompression must stop while streaming once `DEVICE_SNAPSHOT_MAX_DECOMPRESSED_BYTES` is exceeded; the full oversized decompressed payload must not be accumulated before rejection.
6. Chunked per-device snapshot publication may delete only the inactive target slot before writing. The currently authoritative slot must remain untouched until the new root manifest has committed.
7. If the new root-manifest write fails after new chunks were written, the prior root+active chunks remain authoritative and the failed inactive generation is best-effort cleaned.
8. After a successful root flip, obsolete opposite-slot/stale-tail chunks may be reclaimed; the chunks named by the committed root must remain.
9. Live model normalization intentionally permits the same logical record ID in Personal and Work during cross-Space convergence, while within-workspace and hostile-profile duplicate-ID hardening from 1.24.14k remains unchanged.
10. No Sync schema, state schema, profile format, asset-store schema version, permission, CSP, localization catalog, favicon discovery ordering, or user-facing feature change is introduced by 1.24.14l.

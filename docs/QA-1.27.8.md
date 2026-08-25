# MosaicSync 1.27.8 QA / complete-profile Sync recovery checklist

## Release identity
- [x] Firefox manifest version = `1.27.8`.
- [x] Chrome manifest version + `version_name` = `1.27.8`.
- [x] Shared `VERSION`, visible New Tab version label, README, CHANGELOG and build manifest = `1.27.8`.
- [x] State schema remains 18, Sync record schema remains 10; local Sync bookkeeping meta schema = 12.

## Complete-profile device safety snapshot
- [x] A trusted device snapshot carries Personal and Work in one verified generation.
- [x] Personal remains decodable by 1.27.7 during rolling upgrade; 1.27.8 validates the added Work half before treating it as a complete profile.
- [x] Snapshot chunks are written before the tiny authoritative root.
- [x] Publication alternates slots and retains the immediately previous complete profile generation.
- [x] If a newly visible root is missing/corrupt, the previous independently verifiable profile generation remains available.
- [x] Legacy Personal-only device snapshots remain readable but are never granted complete-profile repair authority.

## Fresh-profile protection
- [x] Personal alone cannot finalize initial Sync.
- [x] A fresh device waits for either a complete Personal+Work profile snapshot or independently usable Personal and Work compatibility ledgers.
- [x] Missing or torn Work is not interpreted as an intentionally empty Work Space.
- [x] An explicitly valid zero-record Work dataset/settings pair is accepted as intentionally empty.
- [x] `syncStatus: ready` cannot be produced from a profile whose Work core is not usable.
- [x] A half-restored device with no previously applied Work/profile revision is not allowed to publish a complete-profile recovery snapshot from its temporary local view.

## Local edits while waiting
- [x] A shortcut created while the device is waiting for the complete remote profile is preserved.
- [x] When the complete remote profile arrives, incoming and waiting-local records merge through the existing deterministic record clocks.
- [x] Unrelated remote shortcuts survive; the temporary local view is never treated as authoritative replacement data.
- [x] Only after the complete baseline is known can the merged local delta be published.

## Work self-healing
- [x] A verified complete profile can supply the baseline for an incomplete/mixed Work compatibility ledger.
- [x] Any newer visible Work records still merge by existing per-record clocks instead of being discarded.
- [x] A coherent Work dataset marker is recommitted after repaired records/settings.
- [x] A legacy Personal-only safety snapshot does not immediately repair a partial shared ledger.
- [x] Existing Work/profile revision bookkeeping is required before an upgraded local profile is trusted as a recovery source.

## Existing concurrency and safety semantics
- [x] Different-shortcut concurrent edits still rebase instead of overwriting one another.
- [x] Same-shortcut conflicts still converge deterministically.
- [x] Cross-Space moves and unrelated additions remain preserved.
- [x] Tombstone behavior remains bounded and preserved through profile publication.
- [x] Failed local atomic writes, import hardening, CSP/navigation guards, SVG/image bounds and favicon safety regressions remain green.

## Shortcut hover
- [x] Mouse hover scales the tile by only `1.018` and applies `brightness(1.045)`.
- [x] The effect uses paint-only transform/filter properties and does not change grid size, spacing or reserved label geometry.
- [x] Active state remains restrained and reduced-motion continues to disable transitions.

## Automated validation
- [x] `npm test`: 417/417 tests pass.
- [x] `npm run bench`: completed successfully on the final source.
- [x] Final package-size baseline regenerated from the 1.27.8 runtime.
- [x] No new permissions, host permissions, CSP relaxation, telemetry, remote code or external service.

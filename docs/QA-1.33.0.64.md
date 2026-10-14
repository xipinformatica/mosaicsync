# MosaicSync 1.33.0.64 QA / release-candidate checklist

**PRIVATE HOLD — not approved for public release.** Baseline: frozen .63 source ZIP SHA-256 `9fcf118d33b2a74bb2671021039bca1e2356f7f97c9994224e1707dccbf7b94a`.

## Mandatory verification

1. Same-slot and different-slot concurrent additions and renames converge in Personal and Work, both browser modules and both LWW/server-wins transport models.
2. Offline delete vs stale rename never resurrects, including when a storage.onChanged event is missed and after worker restart.
3. A genuinely partial download, even longer than two Sync watch periods, does not cause an incomplete marker to be published or a stale deletion to be accepted.
4. The post-write dataset marker fingerprints the actual published ledger, not pre-normalized records.
5. No immutable Recovery snapshot feeds an automatic torn-ledger merge.
6. The waiting state is accurate and exits after a coherent ledger arrives.
7. Mixed .63/.64 and old device IDs, sync quota exhaustion, explicit reset, backup import and cross-Space moves are reviewed.
8. Full automated suite, deterministic build/package and independent real-browser audit pass; then GitHub six-job gate and real two-account verification.

## Known limitations

The test-only two-process relay is not a signed-in browser. A repair requires witnesses from all record-origin device IDs; old/offline clients may keep Sync waiting. The new metadata consumes Sync quota and must be evaluated with large profiles. No production publication authorized.

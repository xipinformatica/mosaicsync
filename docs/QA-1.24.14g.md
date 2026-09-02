# MosaicSync 1.24.14g QA contract

1. Firefox and Chrome technical manifest versions are `1.24.14.6`; Chrome exposes `version_name: "1.24.14g"` and Firefox must not contain `version_name`.
2. `VERSION` is `1.24.14g`; direct upgrades from technical versions 1.24.14 through 1.24.14.4 still schedule the one-time 1.24.14e favicon-quality recheck, while 1.24.14f does not repeat it.
3. Read-only `mosaicsync:get-sync-status` work remains serialized but its transient failures do not persist `syncStatus: "error"` or overwrite `lastSyncError`. Mutating/background lifecycle failures keep the existing durable error behavior.
4. Firefox Sync data-collection permission revocation clears pending cross-Space journals before disabling Sync, matching the explicit Sync-disable path. Chrome has no equivalent data-collection permission event.
5. A viewport-portaled help tooltip whose original parent has been disconnected is removed from the document on hide/cleanup rather than left orphaned in `document.body`.
6. Profile import has a 256 Mi-character abuse/OOM pre-parse ceiling only; this is not tied to Firefox/Chrome Sync quota, profile format v2 is unchanged, and no new user-facing string is introduced.
7. Local content-addressed asset projection fails closed with internal code `LOCAL_ASSET_COLLISION` if two different payloads ever map to the same asset ID during one projection transaction. Normal content-derived IDs and stored asset format are unchanged.
8. Regression coverage includes deterministic same-shortcut concurrent editing, interrupted/replayed cross-Space move semantics, collision-guard behavior, profile-size boundary logic, tooltip orphan teardown, and read-only background error isolation.
9. The favicon-learning network phase remains intentionally unchanged for 1.24.14g; its serialized-queue architecture is reserved for 1.24.14h.
10. Firefox/Chrome parity, security, concurrency, profile, storage, localization, benchmark and reproducible-build contracts must continue to pass.

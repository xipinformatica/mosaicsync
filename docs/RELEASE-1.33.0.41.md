# MosaicSync 1.33.0.41 publication notes

This is a narrow corrective over the completed but unpublished 1.33.0.40 baseline. The last confirmed published version may differ; use cumulative notes when publishing to the stores.

## AMO / Chrome Web Store changelog

Restoring a profile backup now repairs this device even if its previous profile contained damaged timestamps. Profile imports also avoid overwriting changes saved by another MosaicSync tab during import. No new permissions.

## Mozilla Notes to Reviewer

`stampImportedProfileState()` distinguishes backup-file clocks (capped at 366 days ahead of current wall time) from already-stored local clocks. The latter remain causally authoritative even when a device's genuine JavaScript clock was set years ahead; only stored clocks beyond the maximum representable JavaScript Date timestamp (`8_640_000_000_000_000`) are excluded. An explicit New Tab import may use `nextProfileImportMutationTime()` for already-stored cloud clocks during `bootstrap-local` on both Spaces, while routine publication/reconciliation and normal edits retain strict `nextMutationTime()` semantics. A full Firefox/Chrome two-device generated-runtime test now confirms a restore overrides an old Work edit from a clock skewed 400 days ahead; this failed on the originally packaged .41 and passes with the correction. This release repairs local profile usability; devices and historical cloud copies already carrying impossible timestamps may still not converge through Sync, a separate out-of-scope limitation.

After confirmation, New Tab rereads the authoritative persisted profile, stamps the imported state against the fresh read, and passes the precise compact baseline into `writeLocalStateWithBaseline({ requireUnchangedCompactState })`. Under the existing persistence lock, the import aborts with `PROFILE_IMPORT_STALE_BASELINE` if another tab wrote newer authority. Welcome retains its existing fresh-state read, but does not gain the New Tab overwrite guard. No Sync/Recovery wire-format, state-schema, permission, CSP, telemetry or privacy changes. Tests: `tests/trust-boundary-133041.test.mjs`, `tests/sync-distributed-12781.test.mjs`, and the full inherited suite.

## GitHub release title

`MosaicSync 1.33.0.41`

## GitHub release description

MosaicSync 1.33.0.41 improves the reliability of restoring a profile backup:

- Backup imports can repair a profile whose internal timestamps were already damaged.
- Importing will not silently erase changes another tab saved during the import.
- No new permissions or data-format changes.

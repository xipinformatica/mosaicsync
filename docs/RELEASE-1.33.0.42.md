# MosaicSync 1.33.0.42 publication notes

Narrow Journey 4 correctness and security follow-up to the approved 1.33.0.41 baseline. If store release history is behind, prepare cumulative notes rather than claiming the intermediate builds were public.

## Firefox Add-ons / Chrome Web Store changelog

Restoring a profile during setup now protects changes made in other tabs while you choose which profile to use, and returns to the starting-layout choice so the import can be retried. New shortcuts no longer accept URLs containing a username or password. Existing shortcuts and browser bookmarks stay available. No new permissions.

## Mozilla Notes to Reviewer

Welcome now retains the exact `ensureLocalStorage().compactBaseline` alongside its in-memory `profile` starting-source candidate. Only after the user chooses local authority does it call `writeLocalState(candidate.state, { requireUnchangedCompactState: candidate.compactBaseline })`, reusing the persistence-lock guarded check introduced in 1.33.0.41. A concurrent saved workspace change results in `PROFILE_IMPORT_STALE_BASELINE` with no layout/journal publication; staged branding is rolled back, now preserving absence versus the default record. Welcome now discards that stale candidate and returns to source selection so a new profile file can be chosen without reloading. New Tab already had this guard, but both contexts show a distinct localized retry message.

The existing shared navigation validator remains backward-compatible to avoid dropping existing credential-containing shortcut records during migration. A separate credential-free **authoring** validator applies to the New Tab shortcut editor, bookmark drag-to-shortcut and Frequently Visited shortcut creation, and imported Firefox native shortcuts. Browser-bookmark display, search, and explicit native bookmark creation retain HTTP(S)-only compatibility, including URL credentials. Existing stored shortcut URLs and profile/import compatibility are intentionally unchanged. Credentials already present in legacy synchronized states are not scrubbed by this narrow release and remain a known risk requiring a separate migration policy.

No change to Sync or Recovery merge logic, logical-clock policy, wire formats, permissions, CSP, telemetry, persisted schemas, or browser support floor. The existing multi-device poisoned-cloud limitation is unchanged. The unclassified remaining save-error presentation paths remain backlog; no generic catch-all suppression was introduced.

## GitHub release title

`MosaicSync 1.33.0.42`

## GitHub description

- A backup restored during setup will no longer overwrite another tab's newer changes.
- Profile-import conflicts return to the source choices so you can retry.
- Newly entered shortcuts do not accept URLs with embedded usernames or passwords; existing shortcuts and browser bookmarks remain available.
- No new permissions or Sync/Recovery format changes.

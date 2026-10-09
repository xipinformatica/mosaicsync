# MosaicSync 1.33.0.40 publication notes

1.33.0.39 was an internal stepping stone and was not published. These notes therefore describe the cumulative 1.33.0.38 → 1.33.0.40 change.

## AMO / Chrome Web Store changelog

Improves profile-import resilience and makes local save failures safer and clearer. Deliberately extreme timestamps in an imported profile can no longer make later edits impossible, and if device storage cannot save a change MosaicSync now keeps that edit live in the current tab and shows a clear localized message instead of raw browser error text.

No new permissions are introduced.

## Mozilla Notes to Reviewer

MosaicSync 1.33.0.40 is a cumulative trust-boundary/failure-resilience corrective over the last published 1.33.0.38. The intermediate 1.33.0.39 build was not published.

The first part hardens whole-profile import logical-clock authority. Imported record/workspace/Settings clocks may influence the fresh replacement stamp only within a generous bounded future-skew window. Implausibly distant values near `Number.MAX_SAFE_INTEGER` cannot become authoritative and exhaust subsequent edits. The replacement stamp also observes the current authoritative profile, including both Spaces, fine-grained Settings clocks and existing cross-Space namespace generations, so a deliberate import still outranks the state it replaces. New Tab and Welcome/setup share one model-owned `stampImportedProfileState()` implementation.

The second part hardens device-local persistence failure handling. The atomic local profile/assets/journal write already failed closed and left the previous persisted transaction unchanged. 1.33.0.40 now classifies quota exhaustion separately as `STORAGE_LOCAL_QUOTA_EXCEEDED`; other failures retain `STORAGE_LOCAL_WRITE_FAILED`. Browser-specific raw error text is preserved only as the diagnostic `cause`.

At the New Tab boundary, these stable error categories are converted into localized MosaicSync-owned guidance. The quota message explicitly states that the latest change was not saved and gives only recovery actions that can actually make progress: remove the image/wallpaper just added, or free space from another MosaicSync tab, then retry. The generic local-save failure asks the user to retry immediately and warns that the unsaved change may be lost if this tab closes or another tab/device updates MosaicSync first.

The existing intentional live-intention behavior is preserved: a failed save does not roll the visible in-memory profile back and does not advance the compact durable baseline. Repeated failures keep the same user intention live; a later successful save carries it into the authoritative transaction and advances the baseline only after persistence succeeds.

All 33 UI locale catalogs contain the two new persistence-failure messages. No `unlimitedStorage` permission is added; Firefox and Chromium permission scope is unchanged.

No Sync protocol, Recovery format, profile schema, CSP, telemetry, network or privacy behavior changes are introduced.

Permanent behavioral protection is in `tests/trust-boundary-133039.test.mjs` and `tests/trust-boundary-133040.test.mjs`.

Final certified suite: **1414/1414 PASS across 200 test files**.

Canonical groups: Startup 292/292, New Tab 600/600, Sync 357/357, Recovery 225/225, Security 255/255, Browser/parity 315/315, Core 252/252, Release 517/517.

Mechanical checks: 200/200 test files grouped with 0 ungrouped; reachability 0/0/0; 503 JS/MJS syntax checks; 93 JSON parses; 38 relative Markdown links with 0 broken.

## GitHub release title

`MosaicSync 1.33.0.40`

## GitHub release description

MosaicSync 1.33.0.40 strengthens two failure boundaries since 1.33.0.38.

- Imported profiles can no longer use deliberately extreme logical timestamps to make later edits impossible.
- Explicit imports still outrank the current profile, including Settings and cross-Space ordering state.
- Device-local quota failures are distinguished from other save failures.
- Failed edits remain live in the current tab and can be committed by a later successful save.
- User-facing save failures now use clear localized MosaicSync messages rather than raw browser diagnostics.
- Browser permissions remain unchanged; `unlimitedStorage` is not added.

No new features, Sync/Recovery-format changes, profile-schema changes or privacy changes are included.

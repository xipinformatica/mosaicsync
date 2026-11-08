# MosaicSync 1.33.0.92 publication notes

## GitHub release title

`MosaicSync 1.33.0.92`

## Firefox Add-ons — What's new

**More reliable Sync when storage is full**

MosaicSync can now safely free space taken by older Recovery safety copies when your shortcuts and layout need room to sync. Your newest safety copy on each device stays protected, and your local changes are never discarded.

## Chrome Web Store — What's new

**More reliable Sync when storage is full**

MosaicSync can now safely free space taken by older Recovery safety copies when your shortcuts and layout need room to sync. Your newest safety copy on each device stays protected, and your local changes are never discarded.

## GitHub release — changes since 1.33.0.91

- Normal shortcut/layout Sync writes that encounter a genuine storage-capacity limit can automatically invoke the existing **Safe cleanup** for independently verified superseded Recovery copies, then retry a single time.
- Keeps the newest complete Recovery generation for **every** device and rechecks Sync just before deletion using the established cleanup safeguards.
- Separates quota capacity from Chrome's temporary write-rate limits; never deletes Recovery copies due solely to a rate-limit error.
- Accounts for Firefox's tighter storage accounting, including the measured per-item overhead and the final one-byte boundary.
- Excludes Recovery publication itself, best-effort artwork, and Clear Sync reset from automatic cleanup.
- If safe cleanup cannot free enough room, keeps the existing error and local-data protections; no automatic deletion of a device's last Recovery copy.
- No new permissions, data format, telemetry, naming, UI or favicon changes. The previously approved 1.33.0.91 icon-correctness fix is retained.

## Scope and publishing

The production corrective is the independently reviewed Recovery-to-Sync v4 patch on canonical 1.33.0.91. The GitHub-ready source also preserves the already published 1.33.0.91 GitHub CI-only Firefox New Tab smoke and Firefox 159 system-access fixes. Version changes, release documentation and test identity pins are required for this new release; unrelated repository housekeeping is deferred.

**PRIVATE RELEASE CANDIDATE pending final publisher GitHub CI and independent review of exact .92 archives.** GitHub and the browser stores are owner-controlled. Automated and browser evidence in the separate verification report must not be confused with exact-commit GitHub CI completion.

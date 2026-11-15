# MosaicSync 1.33.0.98 publication notes

## GitHub release title

`MosaicSync 1.33.0.98`

## Firefox Add-ons — What's new

MosaicSync now loads less secondary interface code when opening a new tab. Recovery information, Settings and help tips load when needed, with more reliable handling when dialogs are closed and reopened. Your shortcuts, Sync data and browser permissions stay unchanged.

## Chrome Web Store — What's new

MosaicSync now loads less secondary interface code when opening a new tab. Recovery information, Settings and help tips load when needed, with more reliable handling when dialogs are closed and reopened. Your shortcuts, Sync data and browser permissions stay unchanged.

## GitHub release notes

- Promotes the independently audited 1.33.0.97 private modernization through Slice 18 to 1.33.0.98 without further production behavior changes.
- Defers secondary New Tab presentation and Settings/help logic until needed; eager static source graph is 24 modules and approximately 716 KB. This is a code-loading reduction, not a measured browser startup-speed claim.
- Keeps Recovery cleanup feedback accurate even when deferred presentation fails. A reopened Recovery dialog refreshes its current model after cleanup finishes.
- Preserves keyboard access and fallback presentation for help tips and Settings.
- Stabilizes the Bookmarks/Settings generated-runtime smoke harness: waits for actual ready state rather than relying on fixed delays (test-only Slice 18 change).
- No change to synchronized data or Recovery wire formats, storage migration, permissions, browser endpoints, telemetry or supported translations.
- Existing Sync and Recovery engines are unchanged by the late modernization slices. See the preserved private audit trail and tests for earlier New Tab fast-path improvements.

**Release gate:** Private automated and independent audits approved 1,855/1,855 tests on Slice 18 under Node 22.23.3. A real-browser extension run and the release CI gate on this exact 1.33.0.98 candidate remain required before public publication. No measured first-paint gain is claimed.

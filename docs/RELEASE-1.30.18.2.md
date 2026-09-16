# MosaicSync 1.30.18.2 publication notes

## Mozilla Developer Hub changelog

Improves Frequently Visited permission recovery. If the synchronized Show preference remains ON but this browser installation no longer has the optional Top Sites permission, MosaicSync now shows a localized one-click Grant permission action directly in the Frequently Visited area and highlights the same recovery in Settings. Normal updates with an intact permission remain silent. No Sync/state schema, manifest permission, telemetry or backend change.

## Notes to Reviewer

1.30.18.2 is a narrow Frequently Visited recovery-UX follow-up. The synchronized Show preference remains separate from the installation-local optional Top Sites permission. Startup/permission reconciliation checks the existing grant without prompting; when it is missing, cached Frequent cards are cleared and a localized user-gesture-driven Grant permission action is exposed in the launcher and Settings. Granting/restoring permission refreshes suggestions immediately. No new permission, Sync/state schema, remote code, telemetry or backend behavior is introduced.

## GitHub release title

`MosaicSync 1.30.18.2`

## GitHub release description

MosaicSync 1.30.18.2 makes a missing local Frequently Visited permission obvious and recoverable in one click, without changing the synchronized ON preference or prompting again when the permission is still valid.

## GitHub Desktop

**Summary:** `Release MosaicSync 1.30.18.2`

**Description:** `Add one-click Frequently Visited permission recovery without changing synchronized intent.`

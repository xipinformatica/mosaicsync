# MosaicSync 1.32.0.8 publication notes

## Mozilla changelog

Fixes a Welcome/setup Sync-authority race found by a complete persistence-intent audit. Start-empty and import choices now remain provisional until the user actually chooses the local copy, so an existing synchronized profile cannot be overwritten before the final source decision. No feature, permission, schema, Sync/Recovery format or browser-floor change.

## Mozilla Notes to Reviewer

MosaicSync 1.32.0.8 is a narrow authority correction built from 1.32.0.7. It does not add features or continue structural refactoring.

When the setup wizard was rerun on an already-initialized Sync device, the three local starting-source choices — Start empty, import current Firefox shortcuts, and import a MosaicSync profile — previously wrote their candidate state immediately to authoritative `storage.local` before Welcome checked whether an existing synchronized copy should win. The normal background local-state listener could therefore publish the provisional candidate before the later conflict panel asked the user to choose local versus synchronized authority.

1.32.0.8 keeps those local source candidates in Welcome page memory until authority is actually resolved. With Sync off or no remote signal, the candidate is committed immediately before local completion/bootstrap. If a remote signal exists, Welcome shows the conflict panel without changing authoritative state. “Use this computer” commits the candidate and then runs the existing local bootstrap. “Use synchronized copy” never commits the candidate and discards it only after the remote action succeeds. MosaicSync-profile device-local preferences are staged with the candidate and applied only if that candidate wins.

The 1.32.0.7 persistence-intent/durable-Sync-authority contract, pending journal subsystem, Recovery, Sync wire format, schemas and permissions are unchanged.

## Chrome Web Store release notes

Setup reliability correction: local setup/import choices remain provisional until the user chooses which copy should win, preventing premature Sync publication. No feature or permission changes.

## GitHub release title

`MosaicSync 1.32.0.8`

## GitHub release description

MosaicSync 1.32.0.8 fixes one narrow Welcome/setup source-authority race discovered by a full persistence-intent audit.

When setup was rerun while Sync was already initialized, Start empty or an import could briefly become authoritative before MosaicSync asked whether the local or synchronized copy should win. The background could publish that provisional candidate before the user made the final decision.

The three local starting-source candidates are now memory-only until source resolution. Local authority commits immediately before local bootstrap; synchronized authority discards the provisional candidate without committing it. Imported device-local preferences follow the same provisional lifecycle.

No feature, permission, persisted schema, Sync/Recovery wire format, first-paint path or browser-floor change.

## GitHub Desktop

**Summary:** `Release MosaicSync 1.32.0.8`

**Description:** `Keep Welcome setup/import candidates provisional until the user resolves local versus synchronized authority, preventing premature Sync publication.`

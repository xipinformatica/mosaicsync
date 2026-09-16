# MosaicSync 1.32.0.9 publication notes

## Mozilla changelog

Fixes a narrow cross-Space Sync durability gap found by an independent persistence-intent audit. Moving a shortcut between Spaces now always records semantic cross-Space intent; the locked persistence boundary uses fresh durable Sync authority to decide whether the dedicated crash-safe transaction journal is active. No feature, permission, schema, Sync/Recovery format or browser-floor change.

## Mozilla Notes to Reviewer

MosaicSync 1.32.0.9 is a single-purpose Normal Sync reliability correction built from 1.32.0.8. It does not add features or continue structural refactoring.

Two New Tab cross-Space move paths previously constructed the dedicated cross-Space Sync intent only when their cached `meta.syncEnabled && meta.syncInitialized` was true. That cache can briefly lag durable Sync metadata. During that interval a genuine cross-Space move still received the cumulative local mutation journal, but it could miss the dedicated per-move two-phase transaction journal. If opposite-direction moves accumulated before reconciliation, the combined diff was not a single inferable move and could fall back to independent Space publication, bypassing the destination-first crash-safety contract.

1.32.0.9 removes cached Sync authority from intent construction. Drag moves and shortcut-editor Space moves always describe the semantic cross-Space action. The existing locked persistence transaction already re-reads durable Sync metadata: if Sync durability is active it stores the dedicated journal; if durable Sync is inactive it ignores the intent. The inverse stale-cache case therefore remains safe and cannot resurrect Sync authority after disable/reset.

No background orchestration, journal schema, Sync wire format, Recovery behavior, persisted schema or permission changes are introduced.

## Chrome Web Store release notes

Cross-Space Sync reliability correction: Space moves now use durable Sync authority for their dedicated crash-safe transaction protection even if an open New Tab briefly has stale Sync status. No feature or permission changes.

## GitHub release title

`MosaicSync 1.32.0.9`

## GitHub release description

MosaicSync 1.32.0.9 fixes one narrow cross-Space Sync durability gap discovered by independent adversarial audit.

Cross-Space moves are semantic user intent regardless of a New Tab page's cached Sync status. Both drag and shortcut-editor move paths now always describe that intent, while the existing persistence lock re-reads durable Sync authority to decide whether the dedicated destination-first transaction journal is active.

This preserves separate crash-safe journals for opposite-direction moves even when an already-open page temporarily has stale Sync metadata. The opposite stale-cache direction remains protected: durable Sync OFF means no Sync journal is created.

No feature, permission, persisted schema, Sync/Recovery wire format, first-paint path or browser-floor change.

## GitHub Desktop

**Summary:** `Release MosaicSync 1.32.0.9`

**Description:** `Use semantic cross-Space intent plus fresh durable Sync authority so stale New Tab metadata cannot bypass dedicated two-phase move protection.`

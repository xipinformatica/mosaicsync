# MosaicSync 1.33.0.7 publication notes

## Mozilla changelog

Completes Snow Leopard II Step 3 and begins Step 4 by replacing unconditional inactive-Space background warming with intent-driven warming. MosaicSync no longer decodes the other Space background from broad New Tab lifecycle paths when the user may never switch Spaces; pointer/focus/drag/keyboard intent can warm the destination early, while the actual Space-switch path still awaits destination background readiness before visual commit.

No permission, persisted-schema, profile-format, Normal Sync/Recovery wire-format, CSP or browser-floor changes.

## Mozilla Notes to Reviewer

1.33.0.7 is a narrow Snow Leopard II asset/decode optimization. It changes only when an inactive Space background is speculatively preloaded. The active Space background path is unchanged, and `switchActiveSpace()` still owns correctness by awaiting `hydrateSpaceForOwnedOperation(..., true)` before committing the destination Space visually. No network, telemetry, Sync/Recovery or storage-authority behavior is added.

## Chrome Web Store release notes

Reduces unnecessary New Tab image work by warming inactive Space backgrounds only when Space-switch intent is detected, while preserving smooth destination-background readiness during actual switches. No permission or data-format changes.

## GitHub release title

`MosaicSync 1.33.0.7`

## GitHub release description

MosaicSync 1.33.0.7 closes **Snow Leopard II Step 3** at the measured 1.33.0.6 Bookmarks endpoint and begins **Step 4A — asset/image/decode frugality**.

Previously, four broad lifecycle paths called `preloadOtherSpaceBackgrounds()`: ordinary post-paint maintenance, enabling multiple Spaces, successful Space switching, and profile import reconciliation. With two Spaces enabled, those paths could allocate/decode the inactive Space background even when the user never switched Spaces.

1.33.0.7 removes the broad helper. A single destination Space is now warmed only from explicit intent: pointer hover, pointer down, keyboard focus, cross-Space drag intent, or the Alt+Shift Space shortcut. The existing bounded preload cache deduplicates overlapping hints.

This is only speculative warming. The actual `switchActiveSpace()` path remains the correctness owner and still awaits `hydrateSpaceForOwnedOperation(spaceId, isCurrentSwitch, true)`, so destination background readiness remains guaranteed even when no earlier hint ran.

Active-Space post-paint warming is unchanged. Sync, Recovery, storage authority, permissions and persisted formats are unchanged.

## GitHub Desktop

**Summary:** Release MosaicSync 1.33.0.7 — make inactive-Space background warming intent-driven

**Description:** Close Snow Leopard II Step 3 and begin Step 4 by removing unconditional inactive-Space background decodes while preserving correctness-owned destination readiness during actual Space switches.

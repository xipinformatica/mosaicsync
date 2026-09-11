# MosaicSync 1.33.0.8 publication notes

## Mozilla changelog

Continues Snow Leopard II Step 4 by narrowing Space-destination background warming to the single wallpaper that can actually be painted under the current Light/Dark appearance. Separate Light/Dark Wallpapers no longer makes Space intent or an actual Space switch decode/wait for the inactive appearance variant.

The actual switch still waits for the effective destination background before visual commit. No permission, persisted-schema, profile-format, Normal Sync/Recovery wire-format, CSP or browser-floor changes.

## Mozilla Notes to Reviewer

1.33.0.8 is a narrow asset/decode optimization. Space intent and the correctness-owned destination preload now use an effective-background-only helper. The active Space retains broader post-paint theme warming for later Light/Dark appearance continuity. Sync, Recovery and storage authority are unchanged.

## Chrome Web Store release notes

Reduces unnecessary Space-switch image decoding by warming only the currently effective destination wallpaper instead of the inactive Light/Dark variant as well. No permission or data-format changes.

## GitHub release title

`MosaicSync 1.33.0.8`

## GitHub release description

MosaicSync 1.33.0.8 continues **Snow Leopard II Step 4 — asset/image/decode frugality** with Step 4B.

When Separate Light/Dark Wallpapers is enabled, the previous destination warm path could prepare both appearance variants even though a Space switch can display only the wallpaper for the currently resolved appearance. This meant hover/focus/drag intent—and the correctness-owned switch itself—could decode or wait for an image that would not be painted.

1.33.0.8 introduces an effective-background-only preload primitive for destination Spaces. Explicit Space intent uses it, and `hydrateSpaceForOwnedOperation(..., true)` waits only for that effective destination background before the visual Space commit.

The active Space keeps its broader post-paint warm of the current background plus the alternate theme preset. That remains a deliberate continuity safeguard for later Light/Dark appearance changes.

No new cache, network path, telemetry, permissions, Sync/Recovery behavior or persisted format is introduced.

## GitHub Desktop

**Summary:** Release MosaicSync 1.33.0.8 — warm only the effective Space destination wallpaper

**Description:** Continue Snow Leopard II Step 4 by removing inactive Light/Dark wallpaper decoding from Space intent and correctness-owned switching while preserving active-Space appearance continuity.

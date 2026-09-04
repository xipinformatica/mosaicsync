# MosaicSync 1.30.18.43 publication notes

## Mozilla changelog

Fixes **Clear Sync copy** when Firefox Sync storage is already full. MosaicSync now arms the reset locally, clears its per-extension Sync namespace without requiring free quota, writes back only the tiny reset-intent sentinel, verifies the result, preserves this device’s local Personal/Work layout and turns Sync off so a new authoritative source can be chosen. The destructive warning and completion message are localized in all 33 MosaicSync UI languages. No permissions, CSP or Sync/Recovery wire-schema versions change.

## Mozilla Notes to Reviewer

MosaicSync 1.30.18.43 is a narrowly scoped corrective release for the explicit **Clear Sync copy** action.

The reproduced failure was quota-dependent. In 1.30.18.42 and earlier, `clearSyncData()` first attempted to add the small versioned `reset-intent` record and only afterwards removed the existing MosaicSync Sync records. If the extension’s Firefox `storage.sync` namespace was already at its quota, that first `set()` could throw `QuotaExceededError`; the deletion phase therefore never ran, making the Settings reset action unusable precisely when it was most needed.

1.30.18.43 changes only the explicit user-controlled reset ordering and its UI messaging. Before any remote deletion, MosaicSync preserves the local profile, disables automatic Sync locally and marks the reset intentional in device-local continuity state. It then calls `browser.storage.sync.clear()`. WebExtension Sync storage is scoped to the extension, so this clears MosaicSync’s own synchronized namespace and does not touch Firefox bookmarks, passwords, history or another extension’s storage. Because `clear()` removes data instead of adding data, it does not require free Sync quota.

After the clear, MosaicSync retires stale own-write/delivery suppression from the deleted namespace, writes the existing versioned `mosaicsync:*` reset-intent sentinel back with quota preflight intentionally skipped, and verifies that this valid sentinel is the only remaining Sync item. The sentinel schema is unchanged: existing 1.30.13+ peers continue to interpret it as an intentional reset and wait instead of republishing an old local profile. A later explicit **Use this device as Sync source** publishes a complete Personal+Work replacement and removes the sentinel only after that publication succeeds.

Failure handling is fail-safe. If the browser refuses the namespace clear itself, MosaicSync restores the pre-reset local control/continuity state because no remote deletion was committed. If the namespace was cleared but sentinel write/verification unexpectedly fails, the device remains Sync-off rather than automatically republishing its local data into an intentionally emptied namespace.

The local MosaicSync Personal and Work layouts are never deleted by this action. The Settings confirmation now explicitly states that synchronized shortcuts, folders, settings, synchronized images and Recovery copies stored in browser Sync will be removed, while the current device’s local layout remains. The warning and success message are present in all 33 supported runtime locales.

Permanent regressions cover Firefox and Chromium, including a mock where adding a reset sentinel while old Sync data exists always throws `QuotaExceededError`; the untouched 1.30.18.42 order fails that test and 1.30.18.43 passes by clearing first. Existing intentional-reset peer behavior and authoritative republish behavior remain covered.

No permission, CSP, browser capability, state/profile schema, reset-intent schema, Sync/Recovery wire-format or unrelated product behavior changes.

## Chrome Web Store release notes

Fixes **Clear Sync copy** when browser Sync storage is already full. The reset now clears MosaicSync’s own Sync namespace first, preserves the local layout, leaves a small intentional-reset marker so other devices do not resurrect old data, and turns Sync off until a new source is chosen. The warning is localized in all supported languages. No new permissions.

## GitHub release title

`MosaicSync 1.30.18.43`

## GitHub release description

MosaicSync 1.30.18.43 makes **Clear Sync copy** a reliable hard reset even when the browser’s extension Sync quota is already exhausted.

The previous marker-first reset could fail before deleting anything because writing the reset marker itself required free quota. The corrected path first protects the local device against accidental recovery/republish, clears MosaicSync’s per-extension `storage.sync` namespace, then writes back and verifies only the small intentional-reset sentinel. Local Personal and Work layouts are preserved and Sync is turned off so the user can deliberately choose a new authoritative source.

The destructive confirmation and completion text are localized across all 33 MosaicSync UI languages. No permissions, CSP or Sync/Recovery wire-schema versions change.

## GitHub Desktop

**Summary:** `Release MosaicSync 1.30.18.43`

**Description:** `Make Clear Sync copy quota-safe and preserve a clean intentional reset.`

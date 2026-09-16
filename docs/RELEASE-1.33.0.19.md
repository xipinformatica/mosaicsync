# MosaicSync 1.33.0.19 publication notes

## Mozilla changelog

Post-release correctness corrective. Whole-device Recovery cleanup now establishes a fresh verified current-device safety generation after freezing the target set and before final deletion revalidation, preventing opposite cleanups on two devices from composing to zero Recovery copies. Healthy unchanged reconciliation self-heals a missing current-device Recovery generation. Add/Edit Shortcut rapid-open reentrancy is closed before editor-state mutation, and a successful authoritative no-op Sync check clears stale non-quota error text while preserving explicit quota errors. No permission, schema, Sync/Recovery wire-format or browser-floor change.

## Mozilla Notes to Reviewer

1.33.0.19 does not reopen Snow Leopard II performance work. Device-mode Recovery cleanup freezes its original target roots, force-publishes and verifies a new complete generation for the acting device, then re-reads Sync and deletes only still-eligible roots from that frozen plan. The normal healthy reconcile path also repairs a missing own Recovery generation, covering mixed-version propagation. `openShortcutEditor()` now re-checks native dialog state after secondary-style readiness and before form mutation. Successful `already-applied` reconciliation clears stale non-quota background exception status; the explicit quota error remains sticky. No speculative fix was added for the historical `null has no properties` exception because its throw site was not reproducible.

## Chrome Web Store

Corrects distributed Recovery cleanup safety, self-heals a missing Recovery copy, prevents rapid Add/Edit Shortcut double-open errors, and clears stale non-quota Sync error banners after a proven healthy check. No permission or data-format changes.

## GitHub release title

`MosaicSync 1.33.0.19`

## GitHub release description

MosaicSync 1.33.0.19 is a narrow post-Snow-Leopard-II correctness corrective over the frozen 1.33.0.18 endpoint. It closes the independently reproduced distributed whole-device Recovery mutual-delete race with a post-plan verified survivor generation plus unchanged-state Recovery self-healing; closes Add/Edit Shortcut same-session native-dialog reentrancy before form mutation; and repairs stale non-quota Sync error lifecycle after successful authoritative `already-applied` checks while preserving explicit quota errors. Normal Sync/Recovery wire formats, schemas, permissions, privacy boundaries and browser floors are unchanged.

## GitHub Desktop

**Summary:** Release MosaicSync 1.33.0.19 — post-freeze Recovery and Sync-status corrective

**Description:** Add distributed Recovery survivor/self-heal protection, close Shortcut Editor rapid-open reentrancy, and clear stale non-quota Sync error state after healthy reconciliation without reopening Snow Leopard II performance work.

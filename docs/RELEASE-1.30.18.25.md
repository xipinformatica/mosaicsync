# MosaicSync 1.30.18.25 publication notes

## Mozilla Developer Hub changelog

Begins the final maintainability step with a source-ownership and complexity inventory only. Runtime behavior, permissions, data formats and browser functionality are unchanged.

## Notes to Reviewer

This is a zero-feature Step-5.1 audit/tooling release. It adds a deterministic source inventory and documents the existing ownership graph before any final cleanup work begins.

The inventory confirms that New Tab already has one canonical shared source owner from the earlier browser-boundary consolidation; there are no separate Firefox/Chromium New Tab implementations to merge. Firefox remains a tiny manifest/background-adapter overlay. Chromium keeps only its genuine platform/capability/store overlays. No production module is extracted, deleted or behaviorally changed in this release.

The only runtime-source edits are the unified 1.30.18.25 release identity. Sync, Recovery, first-paint/cache ownership, favicon policy, permissions, CSP, schemas and persisted data remain unchanged.

## Chrome Web Store release notes

Begins the final internal maintainability phase with source-ownership audit tooling only. Browser behavior, permissions and synchronized data formats are unchanged.

## GitHub release title

`MosaicSync 1.30.18.25`

## GitHub release description

MosaicSync 1.30.18.25 begins Step 5 with a reproducible whole-codebase ownership and complexity inventory, without changing runtime behavior.

The audit confirms that Firefox and Chromium already share one canonical New Tab implementation, so the final refinement phase will not duplicate or redo the Step-3 consolidation. Current browser overlays are explicitly classified as genuine capability/store differences, while the largest remaining canonical code owners are recorded as future responsibility-review candidates rather than automatically refactored.

No production algorithm is extracted or deleted in this release. Recovery remains frozen at the audited 1.30.18.24 Step-4 endpoint; Steps 1–3 remain frozen. Permissions, CSP, schemas, persisted payloads, Sync behavior, first-paint/cache ownership, favicon privacy policy and product behavior are unchanged.

## GitHub Desktop commit

**Summary:** `Release MosaicSync 1.30.18.25`

**Description:** Begin Step 5 with deterministic source ownership/complexity inventory and zero runtime behavior change.

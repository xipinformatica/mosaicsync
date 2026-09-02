# MosaicSync 1.30.18.23 publication notes

## Mozilla Developer Hub changelog

Refines Recovery internals by isolating retention and cleanup decisions behind a browser-neutral lifecycle boundary. Existing behavior, permissions, and data formats are unchanged.

## Notes to Reviewer

This zero-feature Step-4 release moves verified-generation classification, quota/fallback-retirement planning, and stale/orphan cleanup decisions into `recovery-generation-lifecycle.js`. The new module is synchronous and contains no browser storage, clock, timer, alarm, or continuity effects.

`background-core.js` still performs every `storage.sync` read/removal and local metadata write. It preserves the `.22` safety sequence: verify complete Personal+Work generations, take a fresh Sync view before deletion, revalidate eligibility, then remove keys. Schemas, keys, payloads, permissions, CSP, and user-facing behavior are unchanged.

## Chrome Web Store release notes

Recovery maintainability refinement with unchanged behavior, permissions, and synchronized data formats.

## GitHub release title

`MosaicSync 1.30.18.23`

## GitHub release description

MosaicSync 1.30.18.23 advances Step 4 with a pure Recovery lifecycle boundary while preserving 1.30.18.22 behavior.

Verified-generation classification, quota-capacity/fallback-retirement planning, superseded-generation retention, and stale/orphan GC eligibility now live in `recovery-generation-lifecycle.js`. Browser reads, removals, metadata writes, scheduling, normal Sync merging, journals, and catastrophic-loss continuity remain in the shared orchestrator.

Equivalence and interruption coverage pins verified-only safety slots, previous-generation fallback readability, local-observation aging, orphan grace, future-schema preservation, fresh-view deletion revalidation, failed-publication fallback safety, and MV3 restart determinism. No feature, permission, schema, persisted key/payload, privacy, or normal Sync change is included.

## GitHub Desktop commit

**Summary:** `Release MosaicSync 1.30.18.23`

**Description:** Isolate pure Recovery lifecycle planning while preserving verified fallback, quota, retention, GC, and interruption behavior across Firefox and Chromium.

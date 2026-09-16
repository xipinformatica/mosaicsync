# MosaicSync 1.30.18.21 publication notes

## Mozilla Developer Hub changelog

Refines Recovery internals by isolating generation storage/publication mechanics while preserving chunk-first/root-last safety, verified fallbacks, schemas, permissions and user behavior.

## Notes to Reviewer

This zero-feature Step-4 release adds one browser-neutral module: `src/shared/background/recovery-generation-store.js`.

The new module owns mechanical Recovery-generation work previously embedded in `background-core.js`: complete Personal+Work payload/chunk assembly behind the existing format module, verified-generation reads, own-generation selection, immutable chunk-first/root-last commit, failed-new-chunk rollback and post-write verification. Firefox and Chromium receive byte-identical generated copies.

Policy remains in the shared core. Publication trust, authoritative record/tombstone selection, normal Sync reconciliation, quota-capacity preparation, verified fallback retention, retirement, stale/orphan GC, mutation journals and catastrophic-loss quarantine/restart behavior are unchanged. The previous complete generation remains available until the new root is authoritative, and a failed root write removes only the new chunks.

The existing 96-part limit is now one named constant shared by encode and decode paths. No persisted key, schema, payload, permission, CSP, browser capability, privacy boundary or product behavior changes.

## Chrome Web Store release notes

Internal Recovery maintainability refinement with unchanged features, permissions and synchronization behavior.

## GitHub release title

`MosaicSync 1.30.18.21`

## GitHub release description

MosaicSync 1.30.18.21 advances Step 4 of the zero-new-features refinement program by giving immutable Recovery-generation storage and publication mechanics one browser-neutral owner.

The new store module assembles bounded complete-profile generations, reads and selects verified copies, commits chunks before the authoritative root, rolls back only new chunks on failure and verifies the committed generation. The existing format module continues owning keys, codecs and validation.

High-risk policy remains in the proven shared core: publication trust, normal Sync merging, quota-aware fallback retention, retirement, garbage collection, mutation journals and catastrophic-loss continuity are unchanged. No schemas, persisted keys, permissions, privacy rules or user-facing features changed.

## GitHub Desktop commit

**Summary:** `Release MosaicSync 1.30.18.21`

**Description:** Isolate Recovery-generation storage/publication mechanics behind a browser-neutral store while preserving all existing safety and Sync semantics.

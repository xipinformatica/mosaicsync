# MosaicSync 1.30.18.22 publication notes

## Mozilla Developer Hub changelog

Hardens Recovery retention: only a newly verified complete generation may retire an older fallback, and cleanup revalidates Sync immediately before deletion. No feature, permission or schema changes.

## Notes to Reviewer

This zero-feature Step-4 corrective release hardens the existing immutable Recovery-generation lifecycle.

After writing chunks and then the authoritative root, MosaicSync now verifies that the new root's own complete Personal+Work generation decodes before normal pruning. A torn root may still read through its embedded previous-generation descriptor for Recovery continuity, but that fallback read cannot prove the new root or consume a verified-retention slot. Periodic GC likewise counts only independently verified complete generations.

Known current-schema unreadable roots receive the existing elapsed-time plus repeated-observation orphan grace. Immediately before pruning or garbage collection removes keys, the extension re-reads and re-decodes `storage.sync`; a root completed by delayed chunk delivery is preserved. Unknown/future schemas are not deleted.

No key, schema, payload, permission, CSP, browser capability, privacy boundary, normal Sync policy or user-facing feature changed. Firefox and Chromium use the same generated shared implementation.

## Chrome Web Store release notes

Recovery safety hardening for interrupted Sync delivery, with unchanged features, permissions and data formats.

## GitHub release title

`MosaicSync 1.30.18.22`

## GitHub release description

MosaicSync 1.30.18.22 hardens Step 4 Recovery retention and cleanup without changing product behavior or persisted formats.

New immutable generations now verify their own complete Personal+Work root and chunks before older verified fallbacks may be pruned. Torn roots that remain readable through an embedded previous-generation fallback continue supporting Recovery, but cannot masquerade as a verified new copy. Retention and GC count only independently verified generations, current-schema unreadable roots receive conservative observation grace, and destructive cleanup revalidates a fresh Sync view immediately before deletion.

No schemas, keys, permissions, privacy rules, normal Sync semantics or user-facing features changed.

## GitHub Desktop commit

**Summary:** `Release MosaicSync 1.30.18.22`

**Description:** Harden Recovery publication verification, verified-only retention and revalidated stale-generation cleanup across Firefox and Chromium.

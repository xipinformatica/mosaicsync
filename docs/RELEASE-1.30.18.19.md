# MosaicSync 1.30.18.19 publication notes

## Mozilla Developer Hub changelog

Finishes Frequently Visited first-frame continuity for sparse/empty and missing-permission cases: the reserved FV geometry is now fully paint-hidden and remains stable while real browser-derived content hydrates. Also adds production-runtime catastrophic-Sync characterization before Step 4. No new features, permissions, Recovery/Sync schema or browser-history privacy-boundary changes.

## Notes to Reviewer

This is a narrow pre-Step-4 hardening release built from the certified 1.30.18.18 source.

The 1.30.18.18 fix correctly introduced a synchronous privacy-safe Frequently Visited geometry reservation before shortcut first paint, but a post-release source audit found two remaining presentation gaps. First, `aria-hidden` plus a hidden heading did not itself guarantee that normal placeholder card chrome was paint-hidden. Second, the reservation was based on the configured FV count while the authoritative live result could contain fewer sites, allowing the reserved row count to collapse after the shortcut grid had already painted.

1.30.18.19 makes the complete reservation paint-hidden while preserving layout. While FV remains enabled, sparse or empty authoritative results are padded only with invisible, non-interactive geometry cells up to the configured capacity. This keeps the responsive row capacity stable without persisting the actual browser-history-derived result count. If Top Sites permission is missing, the existing recovery control overlays the reserved FV geometry rather than adding another normal-flow row. Disabled FV still occupies zero startup space. Actual FV sites, titles, URLs and favicon pixels remain session/live-owned, and real favicon-bearing cards retain detached decode/fallback settlement before visible atomic commit.

The release also adds Recovery characterization against the generated Firefox and Chromium production backgrounds. A durable pending local Sync mutation is persisted, the remote Sync namespace is catastrophically emptied, and the real Recovery path is exercised. The test proves the pending mutation remains quarantined and cannot republish the empty namespace; it is replayed only after Recovery has reconstructed and verified authoritative remote state. Existing production-runtime coverage for worker restart grace, failed immutable-generation root commits, corrupt/decompression outcomes and quota-aware verified fallback preservation remains green.

No Recovery or Sync production logic was changed. `background-core.js` and both browser background adapters remain byte-for-byte unchanged from 1.30.18.18. No state/meta/Sync/Recovery schema, persisted key, permission, CSP, automatic-favicon Sync policy, telemetry/backend, browser-history persistence rule or product feature changes.

## Chrome Web Store release notes

Finishes a New Tab startup-layout fix for Frequently Visited and adds Recovery safety regression coverage. No new features or permissions.

## GitHub release title

`MosaicSync 1.30.18.19`

## GitHub release description

MosaicSync 1.30.18.19 is the final pre-Step-4 hardening release.

The Frequently Visited first-frame reservation introduced in 1.30.18.18 now fully owns stable configured geometry while the feature is enabled. The reservation itself is paint-hidden, sparse or empty live results retain the configured responsive capacity with invisible layout cells, and the missing-permission recovery control overlays that same capacity. This prevents shortcut rows from being displaced by a later change in FV row count while keeping browser-history-derived sites, titles, URLs, favicons and live cardinality out of persistent startup/profile/Sync data.

The release also strengthens the safety net for the upcoming Recovery-refinement phase. Generated Firefox and Chromium production backgrounds now prove that a durable pending local Sync mutation stays quarantined during catastrophic remote namespace loss and replays only after Recovery has rebuilt and verified authoritative remote state. Existing worker-restart, corrupt-generation, failed-root-commit and quota-fallback guards remain green.

Recovery/Sync production logic and schemas, the shared background core, browser adapters, permissions, CSP, automatic-favicon Sync policy, telemetry/backend model and product features are unchanged. With this release certified, Steps 1–3 are frozen and subsequent Step-4 work can focus narrowly on Recovery ownership/simplification behind the strengthened characterization suite.

## GitHub Desktop commit

**Summary:** `Release MosaicSync 1.30.18.19`

**Description:** Finish Frequently Visited first-frame geometry hardening and add production-runtime Recovery characterization before Step 4, without changing Recovery behavior or schemas.

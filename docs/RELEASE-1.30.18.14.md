# MosaicSync 1.30.18.14 publication notes

## Mozilla Developer Hub changelog

Completes Step 2 of MosaicSync's maintainability program. The persistent New Tab render manifest is reduced to a presentation-only cold-start cache: it keeps only an inert Personal-grid visual projection, Space labels and bounded artwork previews, while shortcut URLs, revision clocks, Frequently Visited state and the duplicated semantic First-Paint Contract are removed. Work shortcut structure is no longer persisted there. Cache reuse now checks visual equivalence, and authoritative navigation is installed only after current state wins. No product feature, permission, CSP, state/meta/Sync/Recovery schema, telemetry or backend change.

## Notes to Reviewer

1.30.18.14 is a zero-feature architecture cleanup completing Step 2. The disposable persistent render-manifest advances to v5 and becomes presentation-only: no URLs, FV state, revision clocks or duplicated First-Paint Contract; Work grid structure is not stored. Persistent boot cards are inert until authoritative state wires validated interactions.

No permissions, CSP, state/meta/Sync/Recovery schemas, telemetry or backend behavior change.

## Chrome Web Store release notes

Completes a startup-architecture cleanup with no feature changes. MosaicSync's persistent first-frame cache now stores only visual Personal-grid data, Space labels and tiny artwork previews; it no longer duplicates URLs, revision clocks, Frequently Visited state or Work grid structure. No permissions or Sync/Recovery schema changes.

## GitHub release title

`MosaicSync 1.30.18.14`

## GitHub release description

MosaicSync 1.30.18.14 completes **Step 2** of the staged maintainability program.

The disposable persistent New Tab render manifest has been reduced from a partial structural/profile copy to a presentation-only cold-start accelerator. It may keep an inert Personal-grid visual projection, Space-switcher labels and bounded artwork previews, but it no longer stores shortcut navigation URLs, state/settings revision clocks, Frequently Visited state or a duplicate semantic First-Paint Contract. When Work is active, no Work shortcut/layout structure is retained in the persistent cache.

Cold persistent cards have no navigation target. Once current session/local state is established, MosaicSync verifies visual equivalence and the authoritative renderer installs validated navigation and interactions. Cache adoption now depends on the visual facts that can actually be painted rather than duplicated mutation clocks.

The disposable render-manifest schema advances from v4 to v5. State, metadata, Sync and Recovery schemas remain unchanged, as do permissions, CSP, privacy boundaries, telemetry policy and the backend-free architecture.

With this release, Step 2 is complete; future roadmap work can move to Step 3 without reopening the settled first-paint/cache ownership boundary.

## GitHub Desktop commit

**Summary:** `Release MosaicSync 1.30.18.14`

**Description:** Completes Step 2 by reducing the persistent render manifest to a URL-free, clock-free, FV-free visual cache while preserving cold-start continuity and authoritative session/local ownership.

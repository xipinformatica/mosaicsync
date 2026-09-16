# MosaicSync 1.33.0.10 publication notes

## Mozilla changelog

Begins Snow Leopard II Step 5 with a measurement-only storage/background census. This release adds local developer tooling that inventories extension-storage call sites, background worker wake/listener topology, and representative cold-worker startup/Sync-watch storage operations in both generated browsers.

No production storage read/write path is removed or merged in this release. The census intentionally preserves distinct freshness boundaries around catastrophic Sync-loss detection, durable pending journals, reconciliation and destructive Recovery/device-snapshot cleanup. No permission, persisted-schema, profile-format, Normal Sync/Recovery wire-format, CSP or browser-floor changes.

## Mozilla Notes to Reviewer

1.33.0.10 is instrumentation/process only apart from the unified version bump. `tools/storage-background-census.mjs` is local developer tooling and does not run inside the extension, send telemetry or persist performance data. Its frozen Step-5A snapshot records static storage ownership and deterministic mocked cold-worker operation counts. Production storage/Sync/Recovery behavior is unchanged from 1.33.0.9.

## Chrome Web Store release notes

Begins Snow Leopard II Step 5 with local-only storage/background performance instrumentation. No production storage, Sync, Recovery, permission or data-format behavior changes.

## GitHub release title

`MosaicSync 1.33.0.10`

## GitHub release description

MosaicSync 1.33.0.10 begins **Snow Leopard II Step 5 — storage/background frugality** with a deliberately measurement-only Step 5A.

The new local developer command `npm run perf:storage-background` inventories direct extension-storage API ownership, background event-listener/wake topology and deterministic cold MV3-worker storage activity in representative startup and periodic Sync-watch paths. It runs only in the development/release environment and adds no product telemetry or extension-storage persistence.

The frozen census records **117 direct storage API call sites**, including **27 full `storage.sync.get(null)` sites**. Representative generated-runtime measurements are:

- established Sync-off startup: **7 local reads / 0 Sync reads**;
- established Sync-on startup: **13 local reads / 2 full Sync reads**;
- periodic Sync-watch alarm: **8 local reads / 3 full Sync reads**.

Firefox and Chromium generated runtimes produce the same deterministic counts in the harness.

Most importantly, this release does **not** turn those counts into speculative deletions. The two full Sync reads visible during initialized startup cross a real authority boundary: catastrophic-loss detection first establishes fresh namespace evidence, then pending durable-journal retry and delivered-core repair may change Sync authority before normal reconciliation obtains its own snapshot. The alarm path additionally reaches device-snapshot garbage collection, whose destructive cleanup owns an independent fresh pre-delete revalidation.

Step 5 therefore remains in progress. The next production optimization, if any, must target one concrete call path and prove snapshot equivalence with a red-before-green regression before a read can be reused or removed.

No permissions, persisted schemas, profile format, Normal Sync/Recovery wire formats, CSP, privacy boundary or browser floor change in 1.33.0.10.

## GitHub Desktop

**Summary:** Release MosaicSync 1.33.0.10 — add Step-5 storage/background census

**Description:** Begin Snow Leopard II Step 5 with local-only storage/wake instrumentation and frozen startup/alarm I/O measurements. No production storage read is removed; freshness and concurrency authority boundaries remain unchanged.

# MosaicSync 1.33.0.1 publication notes

## Scope

Snow Leopard II Step 0: local-only performance measurement infrastructure and immutable baseline. No user-facing feature or intentional production optimization.

## Mozilla changelog

Begins Snow Leopard II with developer-only performance baseline tooling: machine-readable benchmark distributions, deterministic New Tab DOM/module/storage-call budgets, package-size capture, and richer real-browser startup snapshots when browser drivers are available. No telemetry, remote code, permissions, Sync/Recovery data-format changes or browser-floor changes.

## Notes to Reviewer

1.33.0.1 changes release/developer tooling and test instrumentation only, apart from the normal version identity bump. Performance data stays local to the developer/test process; it is not written to extension storage or sent over the network. Production Sync, Recovery, New Tab behavior and persisted schemas are unchanged.

## GitHub release title

`MosaicSync 1.33.0.1`

## GitHub release description

MosaicSync 1.33.0.1 starts Snow Leopard II — Performance & Frugality from the frozen 1.32.1.8 correctness baseline.

This release deliberately does not optimize production behavior yet. It adds the measurement foundation required to prove future improvements: benchmark medians/p95 distributions, package-size accounting, initial New Tab DOM composition, static module-graph size, shared storage API call-site inventory, and real-browser startup phase/navigation/DOM snapshots when compatible drivers are available.

The immutable Step-0 baseline is stored in `docs/SNOW-LEOPARD-II-BASELINE-1.33.0.1.json`, and the journey tracker is `docs/SNOW-LEOPARD-II.md`.

No new permissions, telemetry, remote code, persisted-state schema, profile format, Normal Sync/Recovery wire format, CSP or browser-floor changes.

## GitHub Desktop

**Summary:** Release MosaicSync 1.33.0.1 — establish Snow Leopard II performance baseline

**Description:** Add local-only performance measurement tooling and freeze the pre-optimization DOM/module/I-O/package/benchmark baseline; no production optimization yet.

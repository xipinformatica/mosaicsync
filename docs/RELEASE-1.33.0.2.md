# MosaicSync 1.33.0.2 publication notes

## Scope

Snow Leopard II Step 1: deterministic New Tab critical-path census and finer local startup timing markers. No intentional user-facing optimization or behavioral change.

## Mozilla changelog

Completes Snow Leopard II Step 1 with a developer-only New Tab critical-path census covering parser bootstraps, static vs deferred modules, initial DOM ownership and eager element bindings, plus finer local startup timing markers for future real-browser measurements. No telemetry, remote code, permissions, Sync/Recovery data-format changes or browser-floor changes.

## Notes to Reviewer

1.33.0.2 changes developer/release measurement tooling and adds five local `performance.now()` startup phase stamps. Timing data remains in the in-page `__mosaicsyncStartupTiming` diagnostic object only; it is not written to extension storage or transmitted. Normal Sync, Recovery, persisted schemas and launcher semantics are unchanged.

## GitHub release title

`MosaicSync 1.33.0.2`

## GitHub release description

MosaicSync 1.33.0.2 completes **Snow Leopard II Step 1 — New Tab critical-path census**.

This release still does not apply a production optimization. It makes the startup ownership map explicit before we change anything: parser-time classic bootstraps, the static New Tab module closure, modules already deferred behind dynamic import, initial DOM ownership and eager DOM bindings.

The frozen census is `docs/SNOW-LEOPARD-II-CENSUS-1.33.0.2.json`. Key deterministic findings are 642 initial New Tab elements (534 secondary Settings/dialog), 200 eager element-ID bindings (165 secondary), a 24-module / ~654 KB static module closure, and 40 modules / ~1.10 MB already outside the startup closure through dynamic imports.

Five finer local startup phases were added so a compatible real-browser environment can separate shell localization, eager UI binding, module setup, session-cache readiness and authoritative state materialization. They stay local to the page and are neither persisted nor transmitted.

No new permissions, telemetry, remote code, persisted-state schema, profile format, Normal Sync/Recovery wire format, CSP or browser-floor changes.

## GitHub Desktop

**Summary:** Release MosaicSync 1.33.0.2 — freeze Snow Leopard II New Tab critical-path census

**Description:** Add deterministic parser/module/DOM/eager-binding census and finer local startup phases; no production optimization yet.

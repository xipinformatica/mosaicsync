# MosaicSync 1.33.0.25 publication notes

## AMO changelog

First-paint contract unification only. 1.33.0.25 changes no intended extension runtime behavior. Ownership completeness and bootstrap↔authoritative value parity now consume one shared test-only geometry declaration, so every property classified as parity-required is automatically value-compared by the real production owners. Reserved mutation probe names and a classified-value-divergence regression close the remaining contract-drift hole. Sync, Recovery, storage behavior, permissions, schemas and privacy boundaries are unchanged from 1.33.0.24.

## Notes to Reviewer

1.33.0.25 is test-contract/documentation hardening with no intended runtime logic change. `tests/helpers/first-paint-geometry-contract.mjs` is now the single test-only source of truth for geometry ownership; both the existing 1.33.0.23 real-renderer value comparison and the 1.33.0.24 completeness guard consume it. `tests/corrective-133025.test.mjs` proves that a newly classified parity property with divergent authoritative/bootstrap values fails value parity, and mutation probe names use a reserved test-only namespace. Production New Tab logic, background Sync/Recovery logic and persisted formats are unchanged apart from release identity strings.

## GitHub release title

`MosaicSync 1.33.0.25`

## GitHub release description

MosaicSync 1.33.0.25 is a no-runtime-behavior-change hardening release over 1.33.0.24. It removes the last independent-list gap in the first-paint regression architecture: completeness classification and real bootstrap↔authoritative value comparison now share one ownership declaration, so a newly classified parity property cannot escape value testing. Reserved mutation probes and a permanent classified-value-divergence guard make the contract self-verifying. Sync, Recovery, storage, permissions, schemas and privacy behavior are unchanged.

## GitHub Desktop

**Summary:** Release MosaicSync 1.33.0.25 — unify first-paint parity ownership

**Description:** Make first-paint completeness and real value parity consume one shared test-only ownership contract; add classified-divergence and reserved-probe guards with no intended runtime behavior change.

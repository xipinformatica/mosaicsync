# MosaicSync 1.33.0.24 publication notes

## AMO changelog

First-paint contract hardening only. 1.33.0.24 changes no intended extension runtime behavior. The permanent startup regression now discovers every geometry property actually written by the real authoritative `applySettings()` owner and the real synchronous bootstrap, requires complete/exclusive first-paint ownership classification, and mutation-tests that future one-sided geometry additions fail until classified. Sync, Recovery, storage behavior, permissions, schemas and privacy boundaries are unchanged from 1.33.0.23.

## Notes to Reviewer

1.33.0.24 is test-contract/documentation hardening with no intended runtime logic change. `tests/corrective-133024.test.mjs` executes the existing production bootstrap and authoritative `applySettings()` geometry owner, discovers the properties they actually write across the existing 60–96 px / 6–12 column matrix, and requires each authoritative property to be explicitly classified exactly once. It also mutation-tests an authoritative-only and a bootstrap-only new property so future ownership drift fails the suite. Production New Tab logic, background Sync/Recovery logic and persisted formats are unchanged apart from release identity strings.

## GitHub release title

`MosaicSync 1.33.0.24`

## GitHub release description

MosaicSync 1.33.0.24 is a no-runtime-behavior-change hardening release over 1.33.0.23. It closes the remaining first-paint contract completeness gap: the regression suite now discovers the geometry properties actually written by both production owners and rejects any newly introduced property until its ownership is explicitly classified. Existing value parity and artwork handoff semantics remain protected; Sync, Recovery, storage, permissions, schemas and privacy behavior are unchanged.

## GitHub Desktop

**Summary:** Release MosaicSync 1.33.0.24 — first-paint ownership completeness

**Description:** Harden the first-paint parity contract so new authoritative/bootstrap geometry responsibilities cannot escape explicit classification; no intended runtime behavior change.

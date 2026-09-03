# ADR-008 — Release artifacts come from a fresh deterministic build and full certification fails closed

**Status:** Accepted / frozen

## Decision

Release packaging owns a fresh canonical build and all ZIP modes share the deterministic ZIP policy. `npm run certify` is the definition of full certification and includes the real Firefox + Chromium browser-smoke lane plus clean-source byte-for-byte reproduction.

`npm run certify:mechanical` is explicitly non-authoritative for full certification and must report that browser smoke was skipped.

## Why

Shipping stale `dist/` output or silently skipping browser execution can make the reviewed source and shipped package disagree. The withdrawn 1.30.18.26 release also demonstrated that isolated/unit success is not sufficient proof that a real New Tab completes initialization.

## Do not casually change

Do not package existing `dist/` without rebuilding. Do not add a second ZIP metadata policy. Do not make unavailable browser automation an implicit pass in the full certification path.

## Evidence

- `tests/build-package-1301831.test.mjs`
- `tests/browser-smoke-1301833.test.mjs`
- `tests/maintenance-certification-1301834.test.mjs`
- `tests/test-architecture-1301830.test.mjs`

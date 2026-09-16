# QA — MosaicSync 1.25.16

## Scope

Validator-clean maintenance release on top of 1.24.14m3.

- Firefox manifest version: `1.25.16`.
- Chrome manifest version and display version: `1.25.16`.
- Shared UI locale loading keeps lazy loading but replaces the variable `import(modulePath)` target with a frozen table of literal import loader functions.
- No user-facing strings, permissions, CSP, state/Sync/profile schemas, storage architecture, favicon resolver behavior, or UI geometry changes.

## Verification

- Full automated suite: **141/141 passing**.
- Runtime locale loader contains no variable-path `import()` call.
- All 31 non-English catalog imports remain literal, bundled relative paths; English stays statically imported.
- Existing localization parity/autodetection tests cover all 32 UI languages.
- Firefox/Chrome runtime parity and deterministic build-manifest hashing remain enforced.

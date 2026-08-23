# QA — MosaicSync 1.25.16.1

## Scope

Version-consistency hotfix on top of the submitted 1.25.16 validator-clean build.

- Firefox manifest version: `1.25.16.1`.
- Chrome manifest version and `version_name`: `1.25.16.1`.
- Shared internal runtime `VERSION`: `1.25.16.1`.
- Firefox and Chrome Settings version label: `MosaicSync · 1.25.16.1`.
- The 1.25.16 literal-path lazy locale loader fix is unchanged.
- No user-facing copy, permissions, CSP, state/Sync/profile schemas, storage architecture, favicon resolver behavior, or UI geometry changes.

## Verification

- Full automated suite must pass after a clean rebuild.
- Runtime manifests, shared `VERSION`, Chrome `version_name`, and both Settings labels are regression-pinned to the same current release.
- Runtime locale loader contains no variable-path `import()` call.
- All 31 non-English catalog imports remain literal bundled relative paths; English remains statically imported.
- Firefox/Chrome runtime parity and deterministic build-manifest hashing remain enforced.

# MosaicSync 1.33.0.85 publication notes

**PRIVATE HOLD — for technical review only.**

## GitHub release title

`MosaicSync 1.33.0.85`

## User-facing changes since 1.33.0.84
- New shortcuts get clearer, shorter website names when a site supplies suitable information. Tesla and Le Monde are two examples.
- Website homepages and individual articles or documents are named more appropriately.
- When you save a name already suggested by the website, MosaicSync no longer changes that name again just after saving.
- Existing shortcut names and names you enter manually stay as they are.

## Reviewer notes
- The change is isolated to automatic naming selection and duplicate post-save title lookups, plus test/version/docs changes. No new permissions, external services, Sync/Recovery changes, storage formats, or abandoned generation-protocol code.
- Lookup and redirects use the existing bounded and permission-guarded background implementation. No network request while typing.
- Prior public store version should be confirmed before final cumulative release notes (project previously stated .71 was live).
- Signed-in two-device tests NOT PERFORMED; six GitHub exact-commit jobs NOT PERFORMED for this private candidate. Known offline-reset limitation remains.

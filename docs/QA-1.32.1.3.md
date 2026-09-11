# MosaicSync 1.32.1.3 QA / release-candidate checklist

## Scope

Narrow correctness/security-hardening corrective over 1.32.1.2. It closes the confirmed adversarial audit defects without reopening Journey 3 or changing Normal Sync/Recovery wire formats.

## Corrective invariants

- No successful top-level mutation may create a position outside the active `rows × columns` grid.
- Full-grid add/move/ungroup/shrink operations reject before destructive mutation.
- Recoverable legacy/imported layouts with at most 96 top-level records expand/reflow deterministically into the visible 12×8 product envelope.
- Profile structure is bounded before recursive/hash-heavy work.
- Imported raster bytes must match the claimed supported image container and safe source-dimension/pixel envelope.
- Failed Custom Branding import rollback may undo only the exact branding value written by that import; a newer save survives.
- Failed Settings profile import cannot install rejected candidate state into live authority before durable commit succeeds.
- Branding remains device-local and outside Normal Sync, pending journals and Recovery.

## Permanent regressions

`tests/corrective-13213.test.mjs` exercises full-grid cross-Space rejection, explicit boundary rejection, legacy position repair/grid expansion, folder-child extraction capacity, genuine raster controls versus fake MIME-labelled bytes, checksum-valid hostile branding, deep profile structure rejection, 96-record profile ceiling, conditional branding rollback, Settings-import authority ordering, Welcome rollback ownership, cross-context branding adoption and bounded New Tab producer contracts.

Existing Custom Branding/profile tests now use real tiny raster fixtures rather than text bytes mislabeled as images.

## Architecture / compatibility contract

- Profile format remains v3.
- No permission or host-permission changes.
- No Normal Sync, pending-journal or Recovery wire-format changes.
- No persisted-state schema change.
- No CSP, telemetry, remote-code or service changes.
- No browser-floor change.

## Final automated verification

Final counts, package sizes, reachability, benchmark and clean-room reproduction are recorded after the publication tree is frozen.

## Certification environment

Browser capability is reported honestly by the release certifier. Mechanical certification must not be described as real-browser certification when the required browser/driver pairs are unavailable.

## Clean-room publication contract

The GitHub-ready source ZIP is extracted into a fresh directory, rebuilt and retested, then all three publication artifacts are rebuilt and compared byte-for-byte with the originals before handoff.

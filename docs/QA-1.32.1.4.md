# MosaicSync 1.32.1.4 QA / release-candidate checklist

## Scope

Narrow model-normalization corrective over 1.32.1.3. It closes the independently discovered fixed-point defect without changing Normal Sync/Recovery formats or reopening broader architecture.

## Corrective invariants

- `normalizeState(normalizeState(x))` is semantically identical to `normalizeState(x)` for valid and repairable workspace state.
- Two independently edited top-level records targeting the same visible slot are repaired to unique visible positions in one pass.
- The repaired array order matches final assigned position order before the normalizer returns.
- Ordinary two-device record-level Sync merge collisions satisfy the same fixed-point invariant.
- Profile export→import→export is canonical after collision repair when the export timestamp is held constant.
- `rebaseConcurrentState(base, base, latest)` preserves `latest` exactly for an unchanged workspace rather than manufacturing bookkeeping-only changes.
- Existing visible-capacity, hostile-profile, raster-validation, Branding rollback and failed-import authority protections from 1.32.1.3 remain unchanged.

## Permanent regressions

`tests/corrective-13214.test.mjs` covers the minimal same-position reproduction, an ordinary two-device Sync record merge that independently targets the same slot, profile package round-trip canonicalization, exact no-op stale-rebase preservation, and 2,500 seeded collision-heavy normalization fixed-point cases across supported grid sizes and repairable legacy positions.

## Architecture / compatibility contract

- Profile format remains v3.
- No permission or host-permission changes.
- No Normal Sync, pending-journal or Recovery wire-format changes.
- No persisted-state schema change.
- No CSP, telemetry, remote-code or service changes.
- No browser-floor change.

## Final automated verification

Final counts, package sizes, reachability, benchmark, unknown-unknowns audit rerun and clean-room reproduction are recorded after the publication tree is frozen.

## Certification environment

Browser capability is reported honestly by the release certifier. Mechanical certification must not be described as real-browser certification when the required browser/driver pairs are unavailable.

## Clean-room publication contract

The GitHub-ready source ZIP is extracted into a fresh directory, rebuilt and retested, then all three publication artifacts are rebuilt and compared byte-for-byte with the originals before handoff.

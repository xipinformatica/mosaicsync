# MosaicSync 1.33.0.61 QA / release-candidate checklist

Baseline: independently Chromium-audited ED-1 private candidate (ZIP SHA-256 `35edb3a6ffd9701daee9910f860a60fb3191bf7b9e745e858d2de8b0ba445322`) built on frozen published 1.33.0.60. The user pushed the candidate to `main` as GitHub commit `b63bce9881699b63be200f68ba07f135df1d3373`; all six GitHub Actions jobs passed on that candidate. 1.33.0.61 is a release-identity-only change on top of the audited ED-1 runtime, not a further logic patch.

## Scope and invariants

- Only production logic changes relative to published .60 are those already reviewed in `src/shared/newtab/newtab.js` and `src/shared/core/storage.js`. The .61 packaging step must not modify them.
- Durable recovery on rejected shortcut saves must not overwrite another tab's committed changes. Stable new-shortcut IDs prevent duplicate records on ambiguous writes.
- Failed add/edit/delete/move and Cancel must not leak into subsequent saves or Sync; retry delete must require a fresh confirmation.
- Cross-Space editor and drag moves must write the source tombstone; never publish a live shortcut with the same ID in both Personal and Work.
- No new permissions, telemetry, Sync/Recovery wire schema, storage migration, network destinations or translations. Approved `DEVELOPER-GUIDE.md` must remain byte-for-byte unchanged (SHA-256 `e18406e412a7ab2132d47aaa1511b305756e7944e51050b31459d753ca2e593e`).

## Existing evidence

- Independent Claude Chromium 141 audit of private candidate: 41/41 ED-1 checks across 3 runs; 26/26 Sync checks across 2 runs; M1/M3 and 150-second M0L/M2L passed; extra double-failure, ambiguous-write, concurrent-tab, delete, rename and drag cases passed.
- 1,559/1,559 mechanical tests passed on the candidate; production `dist/` matched clean rebuild.
- GitHub candidate `b63bce9` six jobs green: regression/package, Chromium 141, Chromium stable, Firefox 140, Firefox current, combined release gate.

## Required for this versioned candidate

1. Verify exact version identity across source constants, both manifests, UI, README, changelog, release notes, size baseline and built trees.
2. Run complete regression suite with test inventory and dedicated ED-1 tests.
3. Verify production ZIPs against release contract and deterministic clean-room source rebuild (byte-for-byte Firefox/Chrome/source ZIPs).
4. Push **1.33.0.61 source ZIP contents** to GitHub and require fresh six-job release gate for that exact commit before store submission.
5. Retain evidence and explicitly document accepted gaps: **Firefox storage fault injection not executed** and **receiving second-device Sync not executed**. Normal Firefox smoke is not fault-injection proof.
6. If feasible, separately verify Settings draft survival and upgrade-in-place from a populated .60 profile. Neither was independently established in the candidate audit.

## Known minor review notes (not altered in .61)

- N1: an ambiguous delete may have succeeded but still show a failed-save message; data and Sync tombstone are correct.
- N2: after a write failure followed by a failed recovery read, the next unrelated save may be refused once as a protective guard.
- N3: cross-Space intent regeneration derives device ID from caller upserts; no tested path triggered a problem.
- N4: after a successful move, the next New Tab may open the prior stored active Space; pre-existing in .60.
- Unrelated folder/reorder/Settings/import mutate-before-save paths remain outside this ED-1 fix.

## Status

RELEASE CANDIDATE: do not claim final GitHub .61 certification until its new workflow run succeeds. Do not imply Firefox fault injection or second-device receipt was tested.

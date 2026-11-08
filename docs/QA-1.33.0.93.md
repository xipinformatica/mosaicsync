# MosaicSync 1.33.0.93 QA / release-candidate checklist

**PRIVATE CANDIDATE — owner-controlled publication, pending independent final audit and exact-commit GitHub CI.**

## Baseline and authorized scope

- Source: canonical 1.33.0.92 GitHub-ready ZIP SHA-256 `ccaac4a5aacaf2565f10fa62eaf04d5d8419f440556444533e435af44878020f`.
- Product correction: exact, unchanged `mosaicsync-1.33.0.92-clear-sync-quota-and-r1-v3.patch`, SHA-256 `a5acce6d8c24a8066ba839055c3827d04f21a031d8e36b0284ee1725e2ad855b`.
- Allowed changes besides patch: 1.33.0.93 version identity across manifests (and Chrome version_name), core VERSION, both New Tab displays, 15 version-pinned tests, CHANGELOG, README, README-DEVELOPMENT, package-size-baseline, regenerated build-manifest/dist, and this version's QA/RELEASE documents.
- DEVELOPER-GUIDE.md byte-identical to .92. No housekeeping, GitHub workflow, permission, CSP, telemetry, networking, naming, icon, Stage 3B or other Sync/Recovery modifications.

## Critical behavioral requirements

- Full Sync storage (Firefox whole-JSON namespace accounting; Chrome browser-specific large-number serialization): Clear Sync must create and durably verify both reset markers before retiring the remaining live namespace; no early empty namespace.
- On a failed or interrupted **locally initiated** Clear Sync, preserve the unsynced local layout and pending journals, do not auto-adopt obsolete cloud data, and show the existing source-choice UI until a new explicit choice or successful retry.
- A successfully verified reset returns to existing await-remote semantics. Peer-reset observation/rejoin, epoch continuity, journal retirement and old Recovery behavior must remain correct.
- **B1 (owner accepted):** If this device's own reset fails and another device resets later, this device waits for explicit choice rather than automatically following it; local unsynced edits are not silently dropped. The current source-choice UI uses existing labels, with no new strings or locale edits.
- No automatic Recovery cleanup during reset (`reclaimRecovery:false` unchanged); no new format, key, permission, network or telemetry surface.

## Required verification before publication

- Re-run full `npm test` (1,723 expected; 0 failed/skipped), focused `tests/corrective-1301843.test.mjs` (26 expected), test inventory, runtime reachability and release contracts.
- Rebuild the three deterministic production ZIPs twice from the GitHub-ready source with stock Python zlib; confirm all SHA-256 hashes byte-identical and `build-manifest.json` consistent.
- Compare browser-package members and source files with .92: only the three v3 patch product files plus version-only constants/manifest/newtab HTML may differ in shipped browser packages. Check no unauthorized changes to patched lines.
- Chrome and Firefox 140/current: validate full namespace, 512 items, real marker write refusals, write-rate refusal, failed first read, committed-then-error, restart between removal and durable marker, pending journals, explicit retry/source selection, remote reset observation, and sentinel-before-empty throughout.
- Confirm the original Stage 2E/2F/3A reset tests remain green; ensure neither legitimate peer resets nor observed reset epochs are blocked.
- Exact .93 commit must pass GitHub Actions mechanical, Chromium current/141, Firefox current/140, and combined RELEASE GATE. Check same source commit/tag assets before submission.

## Explicitly not claimed

- Signed-in multi-device browser Sync was not performed in the patch audit and remains **UNVERIFIED** unless the owner runs that test.
- This private candidate's browser results and exact-commit CI are **PENDING** until separately executed; do not confuse Claude's earlier .92 scratch-browser evidence with a test of the exact version-bumped .93 artifacts.

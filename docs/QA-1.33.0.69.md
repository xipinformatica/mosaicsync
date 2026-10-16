# MosaicSync 1.33.0.69 QA / release-candidate checklist

**PRIVATE — HOLD for independent Stage 2E audit and real signed-in multi-device Sync.**

1. Confirm the only production changes versus .68 are the remote-reset observer's opt-in flag and the atomic storage.local meta+journal commit, plus version identity.
2. Reproduce the old-epoch deletion issue against .68 and confirm .69 preserves the post-reset shortcut in Chrome and Firefox background simulations.
3. Inject storage.local failures at the atomic boundary and verify no split-brain authority transition, journal leak or data loss.
4. Verify explicit local reset, profile import, Restore, normal deletion evidence and concurrent-edit behavior are unchanged.
5. Repeat two-device, three-device, partial-delivery, mixed-version and deletion tests.
6. Run full tests, clean-room build, deterministic packages, six GitHub jobs and real signed-in multi-device Sync test before stores.

## Local audit preparation (15 October 2026)

- Corrected the legacy Stage 2D static assertion: ordinary metadata writes must preserve the deletion-evidence presence bit, but a peer-reset transition intentionally clears it.
- Added real production-background failure-injection scenarios in simulated Chrome and Firefox, including reject-before-commit and pending remove rejection. All retry safely.
- **Confirmed red-before-green corrective:** both simulated browsers showed resurrection of old-epoch shortcut `obsolete` after a synthetic commit-then-reject reset write, an intervening local edit, and a new authoritative remote profile. Two permanent tests failed before the code safeguard and pass afterward.
- **Production corrective in the same private .69 candidate:** upon accepting the first complete post-reset remote profile, the background now clears all previous-epoch pending mutation/cross-Space journals *before* marking Sync as active again. A failed removal aborts the rejoin. Local reset, normal bootstrap, normal Sync, Recovery and data formats are otherwise unchanged by this corrective.
- Local full suite: **1,610/1,610 PASS** with `npm test` after the corrective, including two red-before-green ambiguity regressions. Browser mock checks do not replace real signed-in multi-device validation.
- **PRIVATE HOLD:** independent Claude audit must examine ambiguous writes, races, partial delivery, worker restarts, mixed versions, any residual epoch-authority path, and potential rollback interference. Six-job GitHub gate and real signed-in two-Chrome then Firefox testing remain pending.
- GitHub `main` read-only verified on 15 October 2026: .67 at `892e477ad773...`, workflow #14 successful. Neither .68 nor .69 is published on GitHub main.

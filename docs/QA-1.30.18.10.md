# MosaicSync 1.30.18.10 QA / release-candidate checklist

## Release identity / packaging

- [ ] Firefox manifest/runtime/Settings version is exactly `1.30.18.10`.
- [ ] Chrome manifest/version_name/runtime/Settings version is exactly `1.30.18.10`.
- [ ] Dedicated FV session projection key is generated into both bootstrap configs and included in the existing batched early session read.
- [ ] GitHub-ready source and both browser ZIPs reproduce byte-for-byte from a clean extraction.
- [ ] Firefox and Chrome browser ZIPs pass the production release-contract scanner.

## Step 2.2 session-ownership regressions

- [x] Structural session render-state publication occurs inside the same cross-context persistence Web Lock as the authoritative local state commit.
- [x] An older structural transaction paused at session publication cannot be overtaken by a newer local transaction; after both settle, local and session structural state are the newer state.
- [x] `writeActiveSpace()` uses the same lock and republishes from the persisted active-Space pointer; concurrent calls settle with local/session active Space identical.
- [x] Frequently Visited candidates physically own `SESSION_FREQUENTLY_VISITED_PROJECTION_KEY`; FV refresh never writes `SESSION_RENDER_STATE_KEY`.
- [x] Top Sites permission clearing writes only the FV projection/tombstone and cannot revert a newer structural session snapshot.
- [x] `readSessionRenderCache()` validates structural state and composes the separately sanitized FV projection under synchronized enable/count truth and permission suppression.
- [x] Adversarial Firefox/Chrome tests pause structural, active-Space, FV and permission operations at the previously unsafe interleaving boundaries.
- [x] Cold browser startup with no warm FV candidates schedules live Top Sites acquisition with zero additional generic maintenance delay; warm cached startup keeps the 250 ms refresh delay.

## Preservation gates

- [ ] Full automated suite passes on the final versioned source.
- [ ] Work shortcut-grid authorization remains unchanged and stricter than global/device-local FV presentation.
- [ ] Known-artwork first-paint protection remains covered; known favicons must not flash fallback letters.
- [ ] Space-name startup continuity and persistent-manifest v4 ownership gate remain covered.
- [ ] Persistent localStorage still contains no browser-derived FV site candidates.
- [ ] Normal Sync/Recovery/state/profile schema versions are unchanged.
- [ ] Permissions, CSP, localization, privacy boundaries, telemetry policy and backend-free operation are unchanged.
- [ ] Runtime compressed-size delta versus 1.30.18.9 is small and reviewed.
- [ ] Benchmark/size/release-contract gates pass on the final versioned source.

## Manual browser checks before/after store publication

- [ ] Firefox: rapidly edit from two New Tabs and switch active Space; next New Tabs never visibly regress to an older Space/grid state.
- [ ] Firefox warm session: Personal/Work Frequently Visited remains continuous and does not disturb shortcut-grid state.
- [ ] Firefox cold browser restart: no persistent history cards appear, while current FV sites populate promptly after authoritative startup.
- [ ] Firefox: remove/restore Top Sites permission and confirm structural Space/grid state never changes while FV clears/restores.
- [ ] Firefox in Catalan (or another non-English locale): no English Frequently Visited heading/subtitle appears on first frame.
- [ ] Chrome: repeat concurrency, active-Space, warm/cold FV and permission lifecycle checks.

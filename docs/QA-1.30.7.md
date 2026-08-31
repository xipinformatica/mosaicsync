# MosaicSync 1.30.7 QA / release-candidate checklist

## Scope

1.30.7 is a zero-new-features performance/refinement release on top of 1.30.6. It deliberately preserves Sync conflict semantics, the post-write authoritative ledger, the five-minute semantic watchdog, privacy/security boundaries and the current Settings single-scroll-owner architecture. The release removes redundant internal work and adds tests/benchmark coverage around those fast paths.

## Automated release gates

- [x] Full Node regression suite passes after final 1.30.7 identity/build.
- [x] Performance benchmark passes and includes normalized Cross-Space move+intent.
- [x] Package-size guard passes with reviewed 1.30.7 baseline.
- [x] Firefox and Chrome version identity is exactly `1.30.7` everywhere.
- [x] Firefox and Chrome package hygiene passes.
- [x] GitHub-ready source contains complete build/test inputs and excludes generated/local junk.
- [x] Clean GitHub-ready extraction passes the full suite and benchmark.
- [x] Clean source rebuilds Firefox/Chrome release ZIPs byte-for-byte identically.
- [x] Exactly three release ZIPs are emitted: `mosaicsync-1.30.7-firefox.zip`, `mosaicsync-1.30.7-chrome.zip`, `mosaicsync-1.30.7-github-ready.zip`.

## 1.30.7 targeted optimization/correctness coverage

- [x] Defensive and normalized Cross-Space move/Sync-intent paths produce equivalent semantic output.
- [x] New Tab Cross-Space operations use normalized helpers after the existing trust boundary rather than full-state re-normalization.
- [x] `writeLocalStateWithBaseline()` returns the exact compact state persisted by the transaction and can consume a caller-declared compact optimistic baseline without re-projecting hydrated pixels.
- [x] New Tab persistence advances `writeBaseline` from the returned compact transaction baseline; automatic favicon commits reuse `ensureLocalStorage().compactBaseline`.
- [x] Twenty simultaneous foreground freshness requests in one background context perform one actual `storage.sync.get(null)` freshness read.
- [x] Foreground coalescing is in-flight-only; no completed-result cache can hide a newly delivered missed-event update.
- [x] Foreground interval throttling uses `performance.now()`; persisted forensic timestamps continue to use wall-clock `Date.now()`.
- [x] Publication immediately skips a record/settings write when `chooseNewerRecord()` returns the delivered remote object, avoiding redundant stable serialization without changing conflict resolution.
- [x] Changed workspace clocks take the positive mutation fast path; equal clocks still execute exact semantic-signature fallback.
- [x] Expected own `storage.sync` echoes do not replace useful unexpected-delivery diagnostic evidence.
- [x] Settings geometry CSS variables are not rewritten when columns/tile size are unchanged.
- [x] Dead Settings `<aside>` backdrop and superseded inner-height declarations are absent while the one-scroll-owner invariant remains protected.
- [x] All 1.30.6 missed-event recovery, publication rebase, Work/Personal convergence and diagnostics tests remain green.

## Required real-hardware checks

### Performance

- [ ] Older/low-power CPU if available: open several New Tabs, move a shortcut Personal↔Work, edit shortcuts and allow favicon hydration; confirm no visible regression and Cross-Space actions remain responsive.
- [ ] With many New Tabs open, refocus Firefox/Chrome and confirm no visible Sync/UI stall.

### Cross-device Sync

- [ ] Repeat the 1.30.6 delayed-delivery test with two already-running browsers; foreground recovery should still apply any data already exposed by local `storage.sync`.
- [ ] If native browser **Sync Now** is still required, treat the remaining delay as browser-account delivery rather than bypassing the documented WebExtension boundary.
- [ ] Concurrent local + remote edits continue to converge with no lost shortcut or duplicate.

### Existing Settings hardware gate

- [ ] Windows 11 / Firefox: Separate Light/Dark Wallpapers repeated toggles leave Settings painted and interactive.
- [ ] Linux Mint 22.3 Cinnamon/X11 / Firefox: Separate Light/Dark Wallpapers and Frequently Visited repeated toggles leave Settings painted and interactive.

## Automated result

- Final source/runtime regression suite: **584/584 passed**.
- Clean GitHub-ready extraction regression suite: **584/584 passed**.
- Benchmark: PASS in working tree and clean extraction.
- Reviewed runtime size baseline: `package-size-baseline.json` / `artifacts/package-size-report.json`.
- Firefox/Chrome byte-for-byte rebuild reproducibility from GitHub-ready source: PASS.
- ZIP integrity: PASS.

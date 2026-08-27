# MosaicSync 1.30.8 QA / release-candidate checklist

## Scope

1.30.8 is a narrow zero-new-features Sync concurrency hardening release. It preserves 1.30.7's performance optimizations and adds one safety layer for a demonstrated same-key `storage.sync` race in which a newer browser-delivered value could be overwritten between MosaicSync's pre-write snapshot and its own write before the authoritative post-write read could observe it.

## Automated release gates

- [x] Full Node regression suite passes after final 1.30.8 identity/build.
- [x] Performance benchmark passes with the 1.30.7 normalized Cross-Space fast-path guard retained.
- [x] Package-size guard passes with reviewed 1.30.8 baseline.
- [x] Firefox and Chrome version identity is exactly `1.30.8` everywhere.
- [x] Firefox and Chrome package hygiene passes.
- [x] Clean GitHub-ready extraction passes the full suite and benchmark.
- [x] Clean source rebuilds Firefox/Chrome release ZIPs byte-for-byte identically.
- [x] Exactly three release ZIPs are emitted: `mosaicsync-1.30.8-firefox.zip`, `mosaicsync-1.30.8-chrome.zip`, `mosaicsync-1.30.8-github-ready.zip`.

## 1.30.8 targeted Sync/concurrency coverage

- [x] Personal fault injection delivers a newer same-key foreign record after the pre-read but before the local write; the remote deterministic winner survives and the unrelated local addition still publishes.
- [x] Work fault injection performs the same race and preserves both the newer foreign winner and unrelated local addition.
- [x] `storage.onChanged.oldValue` from an expected own write is examined for a displaced deterministic winner instead of being discarded solely because `newValue` matches an own-write expectation.
- [x] Unexpected valid core `newValue` evidence is retained long enough for queued reconciliation to repair the shared key.
- [x] Evidence is limited to Personal/Work record/settings keys, TTL-bounded and capped by the existing expectation maximum.
- [x] Evidence repair uses the existing `chooseNewerRecord()` conflict policy and runs before authoritative Personal/Work commit-marker reads and merge/freshness reads.
- [x] Failed foreground single-flight work clears correctly and a subsequent request executes normally.
- [x] After a foreground single-flight settles, newly delivered remote data causes a new real freshness read; no completed-result freshness cache exists.
- [x] Deeply frozen normalized Cross-Space input remains unmodified by the 1.30.7 trusted fast path.
- [x] All 1.30.7 optimization/equivalence tests remain green.

## Deferred optimization reminder

- [ ] **Future, not 1.30.8:** measure device/profile snapshot decoding during watchdog/reconciliation. If repeated decode of unchanged complete generations is material on older CPUs, add a tiny worker-local generation cache keyed by immutable verified generation identity. Cache only successful complete fingerprint-verified generations; never cache incomplete/malformed delivery; keep it bounded and disposable on worker restart.

## Required real-hardware checks

### Cross-device Sync

- [ ] Two already-running browsers: repeat ordinary create/edit/delete and Personal↔Work changes; convergence remains normal.
- [ ] If possible, edit the same shortcut on two devices close together and confirm deterministic winner/convergence without duplicates or disappearance.
- [ ] Continue observing delayed browser-account delivery separately from MosaicSync reconciliation; `storage.sync` remains browser-managed and MosaicSync does not claim to force a server pull.

### Existing Settings hardware gate

- [ ] Windows 11 / Firefox: Separate Light/Dark Wallpapers repeated toggles leave Settings painted and interactive.
- [ ] Linux Mint 22.3 Cinnamon/X11 / Firefox: Separate Light/Dark Wallpapers and Frequently Visited repeated toggles leave Settings painted and interactive.

## Automated result

- Final source/runtime regression suite: **591/591 passed**.
- Clean GitHub-ready extraction regression suite: **591/591 passed**.
- Benchmark: **PASS** in the working tree and clean GitHub-ready extraction; normalized Cross-Space move+intent remains approximately 2–3 ms on the 200-shortcut image-heavy stress fixture.
- Reviewed runtime size baseline: `package-size-baseline.json` / `artifacts/package-size-report.json`.
- Firefox/Chrome byte-for-byte rebuild reproducibility from GitHub-ready source: **PASS**.
- ZIP integrity: **PASS**.

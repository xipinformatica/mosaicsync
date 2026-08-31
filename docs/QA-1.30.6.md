# MosaicSync 1.30.6 QA / release-candidate checklist

## Scope

1.30.6 is a zero-new-features Sync-delivery resilience refinement on top of 1.30.5. It does not try to force Firefox/Chrome account Sync and does not add a MosaicSync server or heartbeat. Instead, an already-open New Tab performs a throttled foreground freshness reconciliation through the existing serialized background path, self-heals the existing five-minute watchdog alarm, and records device-local forensic Sync timing/revision data. Regression testing also exposed and fixed a concrete concurrent-delivery defect: normal Personal/Work publications now preserve newer remote records already visible in `storage.sync` even when their `storage.onChanged` event was missed.

## Automated release gates

- [x] Full Node regression suite passes after final 1.30.6 identity/build.
- [x] Benchmark passes.
- [x] Package-size guard passes with reviewed 1.30.6 baseline.
- [x] Firefox and Chrome version identity is exactly `1.30.6` everywhere.
- [x] Firefox and Chrome package hygiene passes.
- [x] GitHub-ready source contains complete build/test inputs and excludes local/generated junk.
- [x] Clean extraction of the GitHub-ready ZIP passes the complete suite and benchmark.
- [x] Clean extraction rebuilds Firefox and Chrome ZIPs byte-for-byte identically to release artifacts.
- [x] Exactly three release ZIPs are emitted: `mosaicsync-1.30.6-firefox.zip`, `mosaicsync-1.30.6-chrome.zip`, `mosaicsync-1.30.6-github-ready.zip`.

## 1.30.6 targeted Sync regression coverage

- [x] New Tab foreground/visibility/bfcache recovery is gated by one shared 60-second throttle and sends the existing `mosaicsync:reconcile-if-needed` message.
- [x] Foreground recovery recreates the existing five-minute Sync-watch alarm when missing; no second watchdog/timer is introduced.
- [x] A newer remote dataset placed in mock `storage.sync` without firing `storage.onChanged` is applied by foreground reconciliation on Firefox and Chrome.
- [x] The existing five-minute alarm independently recovers the same missed-event condition.
- [x] Overlapping storage-event + alarm + foreground triggers remain serialized/idempotent and do not duplicate shortcuts.
- [x] A local edit racing a foreground recovery is rebased rather than lost, and the remote edit still arrives.
- [x] Normal Personal and Work publications rebase changed records/settings against the currently delivered remote snapshot before writing.
- [x] Personal/Work dataset commit markers are built from the post-write ledger so concurrently delivered records remain counted/fingerprinted.
- [x] Dedicated Sync diagnostics stay in `storage.local`; no diagnostics key is written to `storage.sync`.
- [x] Diagnostics record foreground/watchdog/storage-event timing, outcomes and observed Personal/device/Work/profile revisions without shortcut titles, URLs or telemetry.
- [x] 1.30.5 Settings single-scroll-owner behavior and its regression suite remain unchanged/green.

## Required real-hardware checks

### Cross-device Sync delivery

- [ ] With both browsers already running, create/edit a shortcut on device A and leave device B running.
- [ ] If device B is stale, bring an already-open MosaicSync New Tab back to the foreground; if Firefox has already exposed the remote data locally, MosaicSync should reconcile without a browser restart.
- [ ] Open a new MosaicSync tab as a separate recovery path and confirm no duplicate records appear.
- [ ] If still stale, use the browser's native **Sync Now** before restarting. This distinguishes browser-account delivery delay from MosaicSync event/alarm recovery.
- [ ] Make a local edit on device B after returning to MosaicSync and confirm both the local edit and any already-delivered remote edit converge without loss.

### Existing Settings hardware gate

- [ ] Windows 11 / Firefox: Separate Light/Dark Wallpapers repeated toggles leave Settings painted and interactive.
- [ ] Linux Mint 22.3 Cinnamon/X11 / Firefox: Separate Light/Dark Wallpapers and Frequently Visited repeated toggles leave Settings painted and interactive.

## Interpretation

- Foreground recovery can only apply data already exposed by the browser's local `storage.sync`; it cannot force the browser account engine to download remote data.
- If native **Sync Now** is required before the new shortcut appears, the remaining delay is below MosaicSync's documented WebExtension API boundary.
- If the foreground path applies an already-delivered change, the new recovery path has closed a missed-event/alarm-lifecycle gap without changing Sync conflict semantics.

## Automated result

- Final source/runtime regression suite: **574/574 passed**.
- Clean GitHub-ready extraction regression suite: **574/574 passed**.
- Benchmark: **PASS** in working tree and clean extraction.
- Reviewed runtime size baseline: recorded in `package-size-baseline.json` / `artifacts/package-size-report.json`.
- Firefox/Chrome byte-for-byte rebuild reproducibility from GitHub-ready source: **PASS**.
- GitHub-ready source self-reproducibility: **PASS**.
- ZIP integrity: **PASS**.

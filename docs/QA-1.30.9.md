# MosaicSync 1.30.9 QA / release-candidate checklist

## Scope

1.30.9 is a zero-new-features trusted-state efficiency and cleanup release. It preserves 1.30.8 Sync correctness and removes measured redundant normalization/work around already-normalized New Tab state plus a small duplicate watchdog journal check. No Sync conflict/schema/evidence redesign is included.

## Automated release gates

- [x] Full Node regression suite passes after final 1.30.9 identity/build.
- [x] Performance benchmark passes with the 1.30.7 Cross-Space guard and new trusted-workspace benchmark retained.
- [x] Package-size guard passes with reviewed 1.30.9 baseline.
- [x] Firefox and Chrome version identity is exactly `1.30.9` everywhere.
- [x] Firefox and Chrome package hygiene passes.
- [x] Clean GitHub-ready extraction passes the full suite and benchmark.
- [x] Clean source rebuilds Firefox/Chrome release ZIPs byte-for-byte identically.
- [x] Exactly three release ZIPs are emitted: `mosaicsync-1.30.9-firefox.zip`, `mosaicsync-1.30.9-chrome.zip`, `mosaicsync-1.30.9-github-ready.zip`.

## 1.30.9 targeted refinement coverage

- [x] `replaceWorkspaceTrustedNormalized()` is output-equivalent to the defensive workspace replacement for a normalized known-valid mutation and tolerates deeply frozen input without mutation.
- [x] Space-name, multiple-Spaces and synchronized Frequently Visited preference paths use the trusted replacement rather than pre-normalizing the already-normalized live state.
- [x] Disabling multiple Spaces uses `selectActiveSpaceNormalized()` rather than re-normalizing the full state solely to select Personal.
- [x] Background Personal/Work complete profile publication reuses the state already normalized by `pushLocalMutation()`.
- [x] Alarm/watchdog local pending mutation recovery is performed once per serialized alarm task; foreground/startup/message freshness paths retain normal recovery.
- [x] Delivered evidence cannot override a newer same-key local live record.
- [x] Newer delivered tombstones beat older live records.
- [x] Tombstones retain the existing intentional deletion-dominance rule over later ordinary edits unless a newer explicit cross-Space move revives the record.
- [x] Same-key Settings evidence is repaired through the deterministic conflict path.
- [x] Proven-dead symbols removed in 1.30.9 have no runtime/test callers; all historical migration/security behavior remains.

## Mandatory next-release requirement

- [ ] **1.30.10 / next release:** implement the bounded worker-local verified device/profile snapshot generation cache documented in `README-DEVELOPMENT.md`. This is mandatory carry-forward work, not an optional backlog item. Cache only complete successfully decoded/fingerprint-verified generations; never cache partial/malformed delivery; add reuse/change/incomplete-then-complete/worker-restart regressions.

## Required real-hardware checks

### Cross-device Sync

- [ ] Continue ordinary create/edit/delete/Personal↔Work use on already-running browsers and confirm convergence remains normal.
- [ ] Confirm no regression in the successful macOS PC-2 cross-device behavior observed with 1.30.8.

### Existing Settings hardware gate

- [ ] Windows 11 / Firefox: Separate Light/Dark Wallpapers repeated toggles leave Settings painted and interactive.
- [ ] Linux Mint 22.3 Cinnamon/X11 / Firefox: Separate Light/Dark Wallpapers and Frequently Visited repeated toggles leave Settings painted and interactive.

## Automated result

- Final source/runtime regression suite: **600/600 passed**.
- Clean GitHub-ready extraction regression suite: **600/600 passed**.
- Benchmark: **PASS**. On the final working tree the 200-shortcut image-heavy fixture measured ~315 ms for the former defensive workspace-setting transformation versus sub-0.001 ms for trusted replacement before persistence; normalized Cross-Space move+intent remained ~2.1 ms. Clean extraction reproduced the same qualitative result (~345 ms vs sub-0.001 ms; Cross-Space ~2.1 ms).
- Reviewed runtime size baseline: `package-size-baseline.json` / `artifacts/package-size-report.json`.
- Firefox/Chrome byte-for-byte rebuild reproducibility from GitHub-ready source: **PASS**.
- ZIP integrity: **PASS**.

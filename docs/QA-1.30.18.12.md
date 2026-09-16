# MosaicSync 1.30.18.12 QA / release-candidate checklist

## Identity / packaging

- [x] Firefox manifest/runtime/Settings version is exactly `1.30.18.12`.
- [x] Chrome manifest/version_name/runtime/Settings version is exactly `1.30.18.12`.
- [x] `build-manifest.json`, package-size baseline, release-contract version and package filenames all agree on `1.30.18.12`.
- [x] Exactly three public release ZIPs are produced: Firefox, Chrome and GitHub-ready source.
- [x] GitHub-ready source contains no nested release ZIPs, caches, temporary certification files or generated diagnostics.

## Corrective invariants

- [x] Slow FV decode followed by disabled/empty render cannot resurrect cards.
- [x] Newer FV commit authority invalidates older detached decode work.
- [x] Live FV render uses the original browser candidate; session derivative failure cannot downgrade live artwork.
- [x] FV derivatives remain bounded and session-only; browser-history FV data does not enter persistent profile state, Sync, Recovery or export.
- [x] Structural session warm-up has no FV argument/key side door.
- [x] Stale full-record Sync/status meta writes preserve a newer onboarding decision.
- [x] The explicit remote-bootstrap completion path remains the only background full-record transition allowed to intentionally complete onboarding.
- [x] Persistence Web Lock string remains `mosaicsync.local-assets.write.v1`.
- [x] Manual detected Browser favicon uses compact exact identity rather than coarse source-only `b` for new choices.
- [x] Legacy manual `b` choice publishes an exact compact identity when the originating device still has the selected local pixels.
- [x] Exact manual favicon preference matches the same pixels when another browser discovers them through a different candidate source class.
- [x] Exact image preference can be satisfied from the receiving browser's permission-free local favicon source when its cached pixels already match.
- [x] Manual detected-favicon preference Sync contains no `data:image` payload unless **Sync this image** is explicitly enabled.

## Preservation

- [x] Complete historical test suite passes in addition to new 1.30.18.12 regressions: `833/833`.
- [x] Firefox/Chrome shared-source parity passes.
- [x] No manifest permission or CSP change.
- [x] State/meta/Sync/Recovery/profile schema versions remain unchanged (`STATE=19`, `META=12`, `SYNC=11`).
- [x] Full benchmark completes from the working source and from a clean extracted GitHub-ready source.
- [x] Runtime size change is small and reviewed versus 1.30.18.11: Firefox +1,118 deflated bytes (`620,951 → 622,069`, ~+0.18%); Chrome +1,129 (`635,492 → 636,621`, ~+0.18%).
- [x] Clean extracted source passes `833/833` and reproduces the identical size report.
- [x] Clean extracted source rebuilds/packages all three release ZIPs byte-for-byte identically before final QA documentation stamping.

Certification note: the first combined clean-source command contained the full test suite followed by the benchmark and hit the execution wrapper's 120-second ceiling after the tests had passed and most benchmark cases had completed. No source changed. Running the unchanged benchmark independently immediately afterwards completed the full suite, including the final workspace-setting cases. This was an orchestration timeout, not a benchmark assertion/runtime failure.

## Manual browser checks before/after store publication

- [ ] Firefox: start a slow/warm Frequently Visited render, disable FV or remove Top Sites permission, and confirm no old card can reappear.
- [ ] Firefox: use **Choose detected favicon** on Home, Sync, then verify Work reconstructs the same selected candidate without **Sync this image**.
- [ ] Firefox: repeat the chosen-favicon test with Website Access already granted on the receiving computer; if its browser cache already has the exact pixels, reconstruction should also work without a website fetch.
- [ ] Firefox: with Settings open, switch Light ↔ Dark and confirm preview text/shadows change immediately while the real wallpaper/dim commit still waits for Settings close.
- [ ] Firefox: rapidly edit structural state and switch Spaces from separate New Tabs; next New Tabs never visually restore an older active Space.
- [ ] Chrome: repeat chosen-favicon, FV disable-during-decode, Settings Light/Dark and active-Space checks.

## Final artifact hashes

Final SHA-256 values are reported externally with the released artifacts. The GitHub-ready archive cannot contain its own stable final archive hash without creating a self-referential byte change.

# MosaicSync 1.30.2 QA / release-candidate checklist

## Automated/package/reproducibility gates

- [x] Full Node regression suite passes: **536/536**.
- [x] Performance benchmark passes.
- [x] Package-size guard passes with consciously reviewed 1.30.2 baseline.
- [x] Firefox and Chrome version identity is exactly `1.30.2` everywhere.
- [x] Light/Dark selector immediately paints the matching configured wallpaper while Settings is open without invoking the broad Settings/grid renderer.
- [x] Ordinary/non-selector full-page appearance work remains deferred until Settings closes and stale deferred commits remain suppressed after immediate reopen.
- [x] Redirected/original-origin favicon quality scans remain provisional when their bounded candidate scan times out or becomes network-unresolved.
- [x] Concurrent favicon quality-ledger completion writes preserve all completed URLs.
- [x] Favicon quality-ledger normalization rejects non-finite timestamps and policy versions.
- [x] Older installations with no quality ledger still reopen existing automatic favicon artwork for the one-time quality audit.
- [x] Detected-favicon discovery rechecks generation and URL after awaited prompt-marker persistence before launching background/network work.
- [x] Settings refresh-domain tests use the production `SETTINGS_REFRESH_KEYS` definition.
- [x] Seeded/current render-manifest snapshots do not trigger an identical localStorage rewrite.
- [x] Long Task startup observation is installed only when developer metrics are explicitly enabled.
- [x] Firefox/Chrome runtime ZIPs pass package hygiene and exact version checks.
- [x] Fresh GitHub-ready extraction passes the complete suite and benchmark.
- [x] Fresh extraction rebuilds Firefox and Chrome runtime ZIPs byte-for-byte identical to the release ZIPs.

## Manual hardware gate — REQUIRED BEFORE PUBLIC/FINAL

- [ ] Firefox / Linux Mint 22.3 Cinnamon X11: with different Light and Dark wallpapers configured, repeatedly switch Light ↔ Dark while Settings is open; wallpaper changes immediately and the Settings panel never blanks.
- [ ] Firefox / Linux Mint 22.3 Cinnamon X11: toggle Separate Light/Dark wallpapers and change both wallpaper/dim controls; panel never blanks and ordinary deferred appearance changes commit correctly after close.
- [ ] Windows Firefox: repeat both Settings appearance flows and verify immediate selector wallpaper changes with no blank panel.
- [ ] Automatic favicon learning upgrades a visibly low-quality favicon on a real site where Choose detected favicon finds better artwork, without site-specific code.
- [ ] Fresh-device Personal+Work Sync recovery smoke test on a separate Firefox profile.

## Release state

**Release candidate.** Complete automated/package gates must pass before distribution; manual hardware validation remains required before public/final publication.

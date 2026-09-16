# MosaicSync 1.30.11 QA / release-candidate checklist

## Scope

1.30.11 is a focused Settings appearance regression fix. It restores immediate wallpaper and darkness feedback without repainting the authoritative full-screen page/root appearance while Settings is open.

## Automated release gates

- [x] Full Node regression suite passes after final 1.30.11 identity/build.
- [x] Performance benchmark passes with 1.30.10 snapshot-cache and 1.30.9 trusted-state guards retained.
- [x] Package-size guard passes with reviewed 1.30.11 baseline.
- [x] Firefox and Chrome version identity is exactly `1.30.11` everywhere.
- [x] Firefox and Chrome package hygiene passes.
- [x] Clean GitHub-ready extraction passes the full suite and benchmark.
- [x] Clean source rebuilds Firefox/Chrome/GitHub-ready release ZIPs byte-for-byte identically.
- [x] Exactly three release ZIPs are emitted: `mosaicsync-1.30.11-firefox.zip`, `mosaicsync-1.30.11-chrome.zip`, `mosaicsync-1.30.11-github-ready.zip`.

## Appearance regression coverage

- [x] Settings-open wallpaper selection routes to `appearancePreviewLayer` and does not mutate the real `.page` wallpaper/color.
- [x] Main background darkness updates the private preview dim immediately.
- [x] Active separate Light/Dark wallpaper selection previews immediately.
- [x] Active Light/Dark darkness slider previews immediately.
- [x] Explicit Light/Dark theme selection updates lightweight theme chrome and the isolated matching wallpaper preview without invoking the broad renderer.
- [x] Root `--page-bg`, root `--background-dim` and authoritative canvas-text paint stay frozen while Settings is open.
- [x] Preview uses a plain `<img>` with `object-fit: cover`, private dim overlay and `contain: paint`; no CSS wallpaper background is added to the preview image surface.
- [x] Preview CSS remains outside `newtab-critical.css` and therefore does not increase first-frame launcher CSS.
- [x] External storage/Sync reconciliation remains paint-free while Settings is open.
- [x] Closing Settings performs one next-frame authoritative commit and clears the preview.
- [x] Reopening Settings before the deferred frame continues to suppress a stale commit.
- [x] Firefox and Chrome generated trees carry identical preview behavior.

## Required real-hardware checks

### Windows 11 / Firefox

- [ ] Open Settings and move the normal background darkness slider repeatedly; launcher background changes visually in real time and Settings stays painted/interactive.
- [ ] Select several built-in wallpapers while Settings remains open; each appears immediately.
- [ ] Upload/clear/reset a wallpaper and confirm immediate preview.
- [ ] Enable Separate Light/Dark Wallpapers, change the active theme wallpaper/darkness, and switch Light↔Dark repeatedly; preview remains immediate and Settings never blanks.
- [ ] Close Settings and confirm the visible appearance does not jump to a different value.

### Linux Mint 22.3 Cinnamon/X11 / Firefox

- [ ] Repeat the normal darkness-slider and wallpaper-selection checks.
- [ ] Stress Separate Light/Dark Wallpapers: toggle on/off, change both wallpapers, drag both darkness sliders, and switch Light↔Dark repeatedly. Settings must remain fully painted and interactive.
- [ ] Repeat Frequently Visited toggle interactions afterward to ensure the broader Settings compositor regression remains absent.

## Automated result

- Full regression suite: **616/616 passed** on the working tree and again from a clean extraction of the GitHub-ready source archive.
- Performance benchmark: **PASS** on the working tree and clean extracted source. The validated startup memo path remains materially faster than the defensive trust-boundary path; no 1.30.10 snapshot-cache or 1.30.9 trusted-state guard was removed.
- Package-size gate: **PASS**. Runtime payload remains **1,968,764 raw / 589,268 deflated bytes on Firefox** and **1,989,228 raw / 603,843 deflated bytes on Chrome** in the deterministic size report.
- Packaged browser archives: approximately **607 KB Firefox** and **622 KB Chrome**. `newtab-critical.css` remains **34,810 bytes**; the preview CSS is carried only by the deferred secondary stylesheet.
- Clean-source reproducibility: **PASS**. Before final QA stamping, a clean GitHub-ready extraction rebuilt all three release ZIPs with byte-for-byte identical SHA-256 values; the final stamped source package is rechecked the same way before release handoff.
- Real-hardware Firefox checks above remain intentionally manual release validation and are not claimed by the automated suite.

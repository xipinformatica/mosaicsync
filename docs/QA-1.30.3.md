# MosaicSync 1.30.3 QA / release-candidate checklist

## Automated release gates

- [x] Full Node regression suite passes after final 1.30.3 identity/build (**559/559**).
- [x] Benchmark passes.
- [x] Package-size guard passes with a consciously reviewed 1.30.3 baseline.
- [x] Firefox and Chrome version identity is exactly `1.30.3` everywhere.
- [x] Firefox and Chrome package hygiene passes.
- [x] GitHub-ready source excludes local/generated junk and includes complete build/test inputs.
- [x] Clean extraction of the GitHub-ready ZIP passes the complete suite (**559/559**) and benchmark.
- [x] Clean extraction rebuilds Firefox and Chrome ZIPs byte-for-byte identically to the release artifacts.
- [x] Exactly three release ZIPs are emitted: `mosaicsync-1.30.3.zip`, `mosaicsync-1.30.3-chrome.zip`, `mosaicsync-1.30.3-github-ready.zip`.

## 1.30.3 targeted regression coverage

- [x] Settings is a fixed ARIA dialog surface, not a native modeless `<dialog>`.
- [x] Settings retains explicit Escape/outside-click/close-button lifecycle.
- [x] Separate Light/Dark Wallpapers checkbox uses visibility-only refresh of already-prepared cards.
- [x] Frequently Visited uses one parent visibility owner.
- [x] Space switching is refused while Settings is open.
- [x] Shortcut upload/remote-image work is generation/editor guarded and invalidated on close.
- [x] Custom wallpaper optimization is generation/Space/Settings guarded.
- [x] System-theme async reconciliation is last-result-wins with no speculative media-only paint.
- [x] Conventional favicon fallback timeout keeps the quality scan incomplete/provisional.
- [x] Recovery queue rejects non-finite timestamps.
- [x] Concurrent recovery queue mutations preserve both additions.
- [x] Final slider/pointer interactions have immediate persistence paths.

## Required real-hardware freeze retest

These checks remain manual because the original failure is a Firefox rendering freeze that cannot be proven absent by Node/DOM mocks.

### Linux Mint 22.3 Cinnamon / X11 / Firefox

- [ ] Open Settings and toggle **Separate Light/Dark Wallpapers** on/off repeatedly (at least 20 cycles). Panel remains interactive and painted.
- [ ] With separate wallpapers enabled, choose different Light/Dark wallpapers, change both darkness sliders, and toggle Light/Dark repeatedly. Panel remains interactive.
- [ ] Toggle **Frequently Visited** on/off repeatedly (at least 20 cycles). Panel remains interactive and painted.
- [ ] Close/reopen Settings between repetitions; verify Escape, outside-click and close button all work.

### Windows 11 / Firefox

- [ ] Open Settings and toggle **Separate Light/Dark Wallpapers** on/off repeatedly (at least 20 cycles). Panel remains interactive and painted.
- [ ] With different Light/Dark wallpapers configured, toggle appearance repeatedly and change both darkness sliders. Panel remains interactive.
- [ ] Frequently Visited still behaves normally.

## Release decision

**Buildable release candidate.** Automated/package/reproducibility gates must be completed before packaging is frozen. Because 1.30.3 specifically changes the rendering primitive implicated by the reproduced freeze, the two real-hardware checks above remain the final acceptance gate for declaring the freeze resolved publicly.

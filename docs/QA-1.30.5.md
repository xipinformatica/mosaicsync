# MosaicSync 1.30.5 QA / release-candidate checklist

## Scope

1.30.5 is a zero-new-features refinement of 1.30.4. The single-scroll-owner rendering experiment remains unchanged. The only runtime correction aligns locale-change scroll preservation with the new architecture (`settingsDialog.scrollTop` rather than `settingsForm.scrollTop`) and the new tests strengthen lifecycle/stress coverage without changing the failing hardware paths themselves.

## Automated release gates

- [x] Full Node regression suite passes after final 1.30.5 identity/build.
- [x] Benchmark passes.
- [x] Package-size guard passes with reviewed 1.30.5 baseline.
- [x] Firefox and Chrome version identity is exactly `1.30.5` everywhere.
- [x] Firefox and Chrome package hygiene passes.
- [x] GitHub-ready source contains complete build/test inputs and excludes local/generated junk.
- [x] Clean extraction of the GitHub-ready ZIP passes the complete suite and benchmark.
- [x] Clean extraction rebuilds Firefox and Chrome ZIPs byte-for-byte identically to the release artifacts.
- [x] Exactly three release ZIPs are emitted: `mosaicsync-1.30.5-firefox.zip`, `mosaicsync-1.30.5-chrome.zip`, `mosaicsync-1.30.5-github-ready.zip`.

## 1.30.5 targeted regression coverage

- [x] Locale refresh saves/restores `settingsDialog.scrollTop`, never the normal-flow `settingsForm.scrollTop`.
- [x] Separate Light/Dark Wallpapers visibility-only path remains idempotent through 100 toggles without preview repaint.
- [x] Frequently Visited uses one visibility owner and remains idempotent through 100 toggles.
- [x] 1.30.4's single-scroll-owner CSS contract remains unchanged in shared/generated Firefox/Chrome runtimes.
- [x] Retained 1.30.3 Space ownership, artwork cancellation, System-theme ordering, favicon timeout, recovery queue, finite timestamps, final persistence and pointer cleanup remain green.

## Required real-hardware gate

### Windows 11 / Firefox

- [ ] Toggle **Separate Light/Dark Wallpapers** on/off at least 20 times; Settings remains painted and interactive.
- [ ] Close/reopen Settings in the same New Tab; contents remain visible.
- [ ] Frequently Visited remains normal.

### Linux Mint 22.3 Cinnamon / X11 / Firefox

- [ ] Toggle **Separate Light/Dark Wallpapers** on/off at least 20 times; Settings remains painted and interactive.
- [ ] Toggle **Frequently Visited** on/off at least 20 times; Settings remains painted and interactive.
- [ ] Close/reopen Settings in the same New Tab after each stress sequence; contents remain visible.

## Interpretation

- If both historical failures disappear, the old inner `settingsForm` scroll frame is strongly confirmed as the trigger.
- If Separate Wallpapers still blanks, the next single diagnostic variable is the `hidden`/`display:none` subtree transition while preserving the 1.30.5 scroll architecture; do not add timing workarounds.

## Automated result

- Final source/runtime regression suite: **567/567 passed**.
- Clean GitHub-ready extraction regression suite: **567/567 passed**.
- Benchmark: **PASS** in working tree and clean extraction.
- Reviewed runtime size baseline: Firefox **583,530 deflated bytes**; Chrome **598,126 deflated bytes**.
- Firefox/Chrome byte-for-byte rebuild reproducibility from the GitHub-ready source: **PASS**.
- GitHub-ready source self-reproducibility: **PASS**.
- ZIP integrity: **PASS**.

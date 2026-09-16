# MosaicSync 1.30.4 QA / release-candidate checklist

## Scope

1.30.4 is a zero-new-features **isolation/stability build**. Real Firefox hardware showed that replacing the native Settings `<dialog>` in the unpublished 1.30.3 candidate did not resolve the white/blank-panel failure. The highest-confidence surviving common denominator is the long-lived `#settingsForm.dialog-card` independent scroll frame. 1.30.4 therefore changes one rendering variable only: the outer Settings surface owns vertical scrolling and the inner form remains normal-flow content.

All validated 1.30.3 correctness/cancellation/favicon/recovery improvements remain in place. The 1.30.3 outer fixed ARIA Settings container is intentionally retained for this hardware experiment so a pass/fail result isolates scroll ownership rather than mixing two structural changes.

## Automated release gates

- [x] Full Node regression suite passes after final 1.30.4 identity/build.
- [x] Benchmark passes.
- [x] Package-size guard passes with reviewed 1.30.4 baseline.
- [x] Firefox and Chrome version identity is exactly `1.30.4` everywhere.
- [x] Firefox and Chrome package hygiene passes.
- [x] GitHub-ready source contains complete build/test inputs and excludes local/generated junk.
- [x] Clean extraction of the GitHub-ready ZIP passes the complete suite and benchmark.
- [x] Clean extraction rebuilds Firefox and Chrome ZIPs byte-for-byte identically to the release artifacts.
- [x] Exactly three release ZIPs are emitted: `mosaicsync-1.30.4-firefox.zip`, `mosaicsync-1.30.4-chrome.zip`, `mosaicsync-1.30.4-github-ready.zip`.

## 1.30.4 targeted regression coverage

- [x] Outer `.settings-dialog` is the sole vertical scroll owner (`overflow-y:auto`, horizontal overflow hidden).
- [x] Inner `.settings-dialog .dialog-card` has `max-height:none` and `overflow:visible`.
- [x] The same single-scroll-owner contract is present in both generated browser runtimes.
- [x] The 1.30.3 fixed ARIA Settings container is intentionally retained so scroll ownership is the only rendering variable in this isolation build.
- [x] Separate Wallpapers retains visibility-only checkbox refresh without preview repaint in the gesture.
- [x] Frequently Visited retains one parent visibility owner.
- [x] Space/settings ownership, async artwork cancellation, System-theme ordering, favicon timeout semantics, recovery-queue concurrency/finite timestamps, final-event persistence and color-plane pointer cleanup remain covered by the 1.30.3 regressions.

## Required real-hardware isolation gate

### Windows 11 / Firefox

- [ ] Open Settings and toggle **Separate Light/Dark Wallpapers** on/off at least 20 times. Settings content remains painted and interactive.
- [ ] Close/reopen Settings in the same New Tab after repeated toggles; content remains present.
- [ ] Frequently Visited continues to work normally.

### Linux Mint 22.3 Cinnamon / X11 / Firefox

- [ ] Toggle **Separate Light/Dark Wallpapers** on/off at least 20 times. Settings content remains painted and interactive.
- [ ] Toggle **Frequently Visited** on/off at least 20 times. Settings content remains painted and interactive.
- [ ] Close/reopen Settings in the same New Tab after each stress sequence; content remains present.

## Interpretation

- If both failing controls stop blanking on the real machines, the scroll-frame invalidation theory is strongly confirmed. The next refinement should restore the preferred native Settings `<dialog>` while keeping one scroll owner, then repeat the same hardware test.
- If Separate Wallpapers still blanks, do **not** add more timing workarounds. The next isolation variable is the `hidden`/`display:none` subtree transition while preserving layout/scroll height.

## Automated result

- Final source/runtime regression suite: **563/563 passed**.
- Clean GitHub-ready extraction regression suite: **563/563 passed**.
- Benchmark: **PASS** in working tree and clean extraction.
- Firefox/Chrome byte-for-byte rebuild reproducibility: **PASS**.
- GitHub-ready source self-reproducibility: **PASS**.

## Release decision

Automated completion produces a fully buildable test candidate, but the reproduced Firefox white-panel symptom is considered resolved only after the hardware gate above passes.

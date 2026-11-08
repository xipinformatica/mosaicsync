# MosaicSync 1.33.0.92 QA / release-candidate checklist

**Owner-only publication. Keep private pending final gate.**

## Baseline and change control

- Baseline: canonical 1.33.0.91 GitHub-ready source, SHA-256 `ef54b14a3f3330a55a89a2df6f550799b091b4b1ac5b1a5eaaba6fb0f9b573a2`, plus the previously published CI-only smoke fixes on GitHub main. CI-only fixes do not change shipped extension runtime.
- Recovery-to-Sync v4 patch: `ff340d97fb5665c34809502200c0724049985ad3b04bb680a8413d61defc79c4` (one runtime file, existing quota tests/harness).
- No schema, protocol, key, journal, reset authority, permission, CSP, telemetry, naming, Stage 3B, SVG or listener change.
- Rejected .90 SVG work is excluded; repository housekeeping is separate.

## Required checks

- Full test inventory; 1,708 existing and added regression tests (or report any divergence); build contracts and reachability.
- Exact scope diff, source/build-manifest consistency and clean-room byte-identical production ZIPs using standard zlib.
- Real Chrome and Firefox 140+ quota cases: three device Recovery generations, storage full, layout Sync succeeds after safe cleanup, every newest complete generation remains, and Chrome rate-limit errors do not cause cleanup.
- Full browser-smoke suite on exact .92 commit and corresponding release tag; Firefox 159+ system-access setting and New Tab startup test are retained.
- Negative cases: only the older verified Recovery generations can be removed, manual cleanup safeguards unchanged; no deletion when fit/rate-limited/unmeasurable and no cleanup for Recovery publication, artwork or Clear Sync.
- If newest copies plus layout still do not fit, confirm existing warning and intact local state.
- Owner handles GitHub Desktop commit, GitHub release, Mozilla Add-ons and Chrome Web Store publication.

## Limits

- Real signed-in multi-device Sync across accounts was not performed in the original Claude review, so do not claim it unless actually run.
- No automatic last-copy retirement or 30-day stale-device retirement.

# MosaicSync 1.30.18.14 QA / release-candidate checklist

## Automated/package/reproducibility gates

- [x] Full Node regression suite passes on working source and clean extracted source: 852/852.
- [x] Dedicated Step-2.3 regressions verify render-manifest v5 is presentation-only.
- [x] Persistent manifest contains no shortcut URLs, revision clocks, FV state/candidates or duplicated semantic First-Paint Contract.
- [x] Active Work persists no Work grid/layout/shortcut structure.
- [x] Persistent boot cards contain no `href`; authoritative interaction setup retains the shared HTTP(S) validator.
- [x] Visual cache reuse ignores clocks/URLs but rejects changed layout/order/title/folder/artwork identity.
- [x] Invalid cached preview cannot authorize reuse over immediately drawable session artwork.
- [x] v4 persistent cache is rejected after the v5 disposable-schema bump.
- [x] Default Work and runtime switch-to-Work paths cannot authorize a stale Personal persistent grid.
- [x] State/meta/Sync schemas remain 19 / 12 / 11 and the persistence Web Lock identity is unchanged.
- [x] Firefox and Chrome permissions/CSP are unchanged from 1.30.18.13 apart from release identity.
- [x] Complete benchmark and package-size review pass.
- [x] Final GitHub-ready source reproduces all three release archives byte-for-byte.

## Manual browser gates — intentionally not claimed by automated certification

- [ ] Firefox cold browser restart on Personal: cached grid/labels/artwork remain continuous and inert until authoritative handoff.
- [ ] Firefox cold browser restart with default/open Work: Personal grid never flashes first.
- [ ] Switch Personal → Work, close/reopen browser immediately, verify no stale Personal persistent grid appears.
- [ ] Chrome equivalents of the above startup/Space checks.
- [ ] Existing features (folders, drag/drop, shortcut navigation, FV, Settings, device attribution) remain visually normal after authoritative handoff.

## Release state

**Automated certification complete. Physical interactive browser checks remain intentionally unclaimed.**

Measured certification results:

- Working source: 852/852 automated tests passing.
- Clean GitHub-ready extraction: one initial transient parallel test-runner pass reported 841/852; the exact unchanged extraction then passed 852/852 on the direct rerun and on two subsequent full `npm test` rebuilds. No source/package change was made between those runs.
- Clean benchmark completed successfully. Representative startup validated-memo results: normalize 28.294 ms; baseline 28.241 ms; normalized flatten fast path 0.643 ms; Settings fast path 0.007 ms.
- Package payload: Firefox 2,134,600 raw / 630,843 deflated bytes; Chrome 2,155,165 raw / 645,394 deflated bytes.
- Versus 1.30.18.13: +798 Firefox and +800 Chrome deflated bytes (about +0.13%).
- First clean extraction reproduced the Firefox, Chrome and GitHub-ready ZIPs byte-for-byte before this QA record was stamped.
- Post-stamp clean extraction then passed 852/852, completed the benchmark and exact size report, and reproduced Firefox, Chrome and the GitHub-ready source byte-for-byte. The exact final documentation-stamped source is rechecked once more before handoff.

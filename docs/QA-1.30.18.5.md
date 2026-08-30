# MosaicSync 1.30.18.5 QA / release-candidate checklist

## Automated gates

- [x] Full Node regression suite passes from the final versioned source.
- [x] Benchmark and package-size guards pass.
- [x] Firefox/Chrome/source package versions are exactly `1.30.18.5`.
- [x] Clean GitHub-ready extraction reproduces the same public packages byte-for-byte.
- [x] Release-contract scanner accepts both built runtime trees and both public browser ZIPs.

## 1.30.18.5 regressions

- [x] The browser.session render snapshot carries both sanitized custom Space names and the Multiple Spaces presentation flag.
- [x] Session-speed rendering of `Home / Office` (or any other custom pair) never downgrades those labels to Personal/Work before authoritative local state arrives, on Firefox and Chrome.
- [x] Older session snapshots without the new Space-label projection are invalidated by the disposable render-snapshot schema advance rather than reused.
- [x] A newly observed foreign recovery generation is not expired merely because its publisher's wall clock says it is ancient; retirement age advances through local GC observations.
- [x] A root-less generation survives the cleanup immediately following a large forward local clock jump and requires two later GC observations plus the existing grace before reclamation.
- [x] A backward local clock correction cannot leave an impossible future orphan observation permanently authoritative; the wall-time observation restarts safely.
- [x] Near-quota pre-retirement plus an injected replacement-root failure preserves one verified complete fallback and rolls back failed replacement chunks.
- [x] The 1.30.18.4 favicon first-frame guard, clock-skew same-device ordering, quota-aware rotation, post-write verification, cloned-profile test and legacy recovery regressions remain green.
- [x] No authoritative state/meta/Sync/device-snapshot/profile-snapshot payload schema, permission, CSP, localization-string, telemetry or backend change is introduced.

## Manual acceptance

- [ ] With both Spaces renamed, repeatedly open New Tabs on Firefox and Chrome and confirm Personal/Work never appears at any stage, including the ultra-short transition after the initial frame.
- [ ] Repeat after a browser restart so the new browser.session snapshot path is exercised from a clean process.
- [ ] Rename both Spaces again, open several New Tabs immediately, and confirm every startup layer shows only the new names.
- [ ] Confirm the 1.30.18.4 favicon result remains fixed: established learned favicons never reveal their fallback letter first.
- [ ] Confirm a truly iconless shortcut still receives its legitimate fallback letter after authoritative rendering.
- [ ] On an upgraded 1.30.18.4 profile, confirm normal Sync remains Ready/Protected and no setup/migration UI appears.

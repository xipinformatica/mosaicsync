# MosaicSync 1.30.18.4 QA / release-candidate checklist

## Automated gates

- [x] Full Node regression suite passes from the final source.
- [x] Benchmark and package-size guards pass.
- [x] Firefox/Chrome/source package versions are exactly `1.30.18.4`.
- [x] Clean GitHub-ready extraction reproduces the same public packages byte-for-byte.
- [x] Release-contract scanner accepts both built runtime trees and both public browser ZIPs.

## 1.30.18.4 regressions

- [x] Static New Tab HTML does not expose Personal/Work while customized Space labels are still unresolved.
- [x] The synchronous first-paint Space bootstrap reveals saved custom names immediately when both are available; otherwise the switcher stays visually hidden until authoritative labels are applied.
- [x] A shortcut that is known to own artwork does not flash a fallback letter when its tiny first-frame preview is absent/stale.
- [x] Device-artwork-only hydration refreshes the disposable first-frame manifest/preview rather than leaving it behind the live tile.
- [x] Same-device recovery cleanup keeps the logically newest generation even when its publisher's wall clock is behind.
- [x] The just-committed recovery generation is protected during cleanup and re-verified before recovery is reported protected.
- [x] Near-quota recovery rotation can replace the oldest of two verified generations while preserving one complete fallback throughout staging.
- [x] Root-less recovery chunks are never deleted on first observation and are reclaimed only after the same installation observes them beyond the grace period; a root arriving meanwhile preserves the chunks.
- [x] Recovery publication reuses its initial full Sync read instead of immediately fetching the complete namespace twice.
- [x] Two independent simulated browser views sharing one copied persistent `deviceId` publish distinct complete recovery generations on Firefox and Chrome.
- [x] Legacy fixed-root `a/b` recovery remains readable and the 1.30.18.3 immutable-generation atomicity/failure regressions remain green.
- [x] Seeded three-device repeated catastrophic-loss recovery stress still converges on Firefox and Chrome without local data loss.
- [x] No state/meta/Sync/profile payload schema, permission, CSP, localization-string, telemetry or backend change is introduced.

## Manual acceptance

- [ ] With both Spaces renamed, repeatedly open New Tabs on Firefox and Chrome and confirm the built-in Personal/Work labels are never visible, even for a frame.
- [ ] With an established shortcut that has a learned favicon (for example a site that previously showed a letter flash), repeatedly open New Tabs and confirm the fallback letter is never visible before the favicon.
- [ ] Confirm truly iconless shortcuts still receive their normal fallback letter after authoritative rendering.
- [ ] Exercise normal Space switching/renaming and confirm the first-paint cache updates to later name changes.
- [ ] On an upgraded 1.30.18.3 profile, confirm Sync remains Ready/Protected and legacy/new recovery generations remain readable through normal edits.
- [ ] Confirm Frequently Visited permission recovery, Settings appearance behavior, wallpaper first paint and reduced-motion behavior remain unchanged.

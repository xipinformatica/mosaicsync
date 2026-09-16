# MosaicSync 1.30.18.1 QA / release-candidate checklist

## Automated gates

- [ ] Full Node regression suite passes from the final source.
- [ ] Benchmark and package-size guards pass.
- [ ] Firefox/Chrome/source package versions are exactly `1.30.18.1`.
- [ ] Clean GitHub-ready extraction reproduces the same public packages byte-for-byte.
- [ ] Release-contract scanner accepts both built runtime trees and both public browser ZIPs.

## 1.30.18.1 regressions

- [x] A non-Personal session snapshot waits for the already-running raw local read; authoritative Multiple Spaces OFF rejects cached Work before paint.
- [x] Personal session/boot caches remain visual-only until authoritative launcher reconciliation.
- [x] Synchronous boot manifests with `activeSpaceId: work` do not paint shortcut or Frequently Visited cache content.
- [x] Personal boot-grid and cached Frequently Visited content start inert and unlock independently only after their own authoritative handoffs.
- [x] Fatal startup failure discards still-inert cached launcher/Frequently Visited content instead of making stale targets actionable.
- [x] Render-manifest persistence projects Personal when Multiple Spaces is disabled.
- [x] Boot-grid folder adoption verifies first-four child ID, title and resolved URL before reuse.
- [x] Session/local reconciliation uses exact Manual-grid equivalence as an additional fail-closed invalidation check before cached interaction is unlocked.
- [x] 1.30.18 external-render and inactive-Space wallpaper optimizations remain intact.

## Manual acceptance

- [ ] With Work active and Spaces enabled, open a New Tab and confirm Work still appears promptly after the lightweight authority check.
- [ ] Disable Multiple Spaces from another device while this device has an old Work cache; open a New Tab and confirm no Work boot-grid flash or clickable Work tile appears.
- [ ] Delete/change a shortcut on another device while no New Tab is open; on next startup confirm any cached visual cannot be clicked before authoritative replacement.
- [ ] Enter Sync `await-remote` with an older cached launcher and confirm cached tiles cannot navigate/focus/drag while the waiting state takes authority.
- [ ] Confirm Frequently Visited cached cards remain non-interactive until their own permission/data refresh completes.
- [ ] Confirm normal matching Personal boot-grid adoption remains visually fast and becomes interactive immediately after authoritative validation.

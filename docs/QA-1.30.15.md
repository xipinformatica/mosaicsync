# MosaicSync 1.30.15 QA / release-candidate checklist

## Automated gates

- [ ] Full Node regression suite passes from the final source.
- [ ] Benchmark and package-size guards pass.
- [ ] Firefox/Chrome/source package versions are exactly `1.30.15`.
- [ ] Clean GitHub-ready extraction reproduces the same public packages byte-for-byte.

## Settings conflict regression

- [x] Frequently Visited Show and an unrelated Tile Size edit converge independently.
- [x] Frequently Visited Show and Count have independent clocks.
- [x] Columns and Tile Size have independent clocks.
- [x] Light and Dark wallpaper choices have independent clocks.
- [x] Atomic background-color representation remains one logical mutation.
- [x] Same-setting equal-clock conflicts remain deterministic.
- [x] Legacy records without fine clocks migrate conservatively.
- [x] Settings clocks survive reconstruction and republish.
- [x] `autoSiteIcons` and `webAccessPrompted` remain outside Sync.
- [x] Seeded five-device delayed/reordered Settings stress converges through a catastrophic-loss authority epoch.

## Manual browser acceptance

- [ ] On two real synced Firefox profiles, change Frequently Visited on one and Tile Size on the other before delivery; confirm both choices survive after convergence.
- [ ] Repeat with Frequently Visited Show vs Count and Light vs Dark wallpaper selection.
- [ ] Upgrade a real 1.30.14 profile and confirm existing Settings/UI remain unchanged.
- [ ] Verify normal 1.30.14 favicon-preference reconstruction and 1.30.13 catastrophic-loss recovery remain intact.

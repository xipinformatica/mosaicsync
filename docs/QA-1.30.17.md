# MosaicSync 1.30.17 QA / release-candidate checklist

## Automated gates

- [ ] Full Node regression suite passes from the final source.
- [ ] Benchmark and package-size guards pass.
- [ ] Firefox/Chrome/source package versions are exactly `1.30.17`.
- [ ] Clean GitHub-ready extraction reproduces the same public packages byte-for-byte.
- [ ] Release-contract scanner accepts both built runtime trees and both public browser ZIPs.

## Mixed-version Settings regressions

- [x] A modern explicit Settings clock beats a later legacy whole-record timestamp even when the values differ.
- [x] The result is arrival-order independent.
- [x] A legacy equal-value write cannot advance a modern fine clock.
- [x] Legacy-only Settings remain readable and republish with fine clocks.
- [x] Legacy-vs-legacy deterministic ordering remains compatible.
- [x] Raw legacy device snapshots cannot revert modern explicit Settings on Firefox or Chrome.
- [x] Raw legacy shared-ledger Settings cannot revert modern explicit snapshot Settings on Firefox or Chrome.

## Preserved 1.30.16 release contract

- [x] Firefox production manifest contains no `browser_specific_settings.gecko_android`.
- [x] Chrome declares `minimum_chrome_version: 104`.
- [x] Manifest/permission/host/data-category/external-endpoint allow-list checks remain active.

## Manual acceptance

- [ ] Confirm a current device retains its Settings after an older device performs an unrelated Settings edit and then updates to 1.30.17.
- [ ] Confirm Firefox Home/New Tab and Chrome New Tab behavior remain unchanged.
- [ ] Confirm AMO still shows desktop-only Firefox compatibility.

# MosaicSync 1.30 QA / release-candidate checklist

## Automated gates

Automated result: **515/515 tests pass** on the release source and on a fresh extraction of the GitHub-ready archive.

- [x] Full Node regression suite passes.
- [x] Performance benchmark passes.
- [x] Package-size guard passes with reviewed 1.30 baseline.
- [x] 33 UI locales have 406 keys, no empty values, matching placeholders and no duplicate English reverse-map sources.
- [x] Firefox and Chrome both contain 33 valid manifest locales.
- [x] Firefox/Chrome New Tab shared runtime remains byte-identical where intended.
- [x] No obsolete monolithic `newtab.css` exists in source or packages.
- [x] No `__pycache__`, `.pyc`, tests, docs or local artifacts leak into browser packages.
- [x] Complete-profile Sync fallback/root-last publication tests pass.
- [x] Distributed fresh-device/no-event watchdog recovery tests pass.
- [x] Sync self-publish vs foreign-receipt timestamp tests pass.
- [x] Linux Settings paint-isolation tests pass.
- [x] Automatic favicon bounded quality-upgrade tests pass.
- [x] Finished Firefox/Chrome ZIPs inspected directly.
- [x] Fresh GitHub-ready extraction rebuilds byte-for-byte identical Firefox/Chrome ZIPs.

## Manual hardware gate

- [ ] Firefox / Linux Mint 22.3 Cinnamon X11: toggle Frequently Visited repeatedly with Settings open; panel never blanks.
- [ ] Firefox / Linux Mint 22.3 Cinnamon X11: toggle Separate light/dark wallpapers and change both wallpaper/dim controls; panel never blanks and final page appearance applies after close.
- [ ] Windows Firefox: repeat both Settings flows and verify no regression.
- [ ] Empty Personal and empty Work: callout arrow tail starts at bubble center and tip remains centered on `+` tile.
- [ ] Automatic favicon learning upgrades a visibly low-quality favicon when the detected-favicon path can find a materially better candidate.
- [ ] Sync card wording clearly distinguishes `Received from another device` from deliberate `Use this device as Sync source` publication.
- [ ] Fresh-device Personal+Work recovery smoke test on a separate Firefox profile.

## Release state

Automated/package/reproducibility success makes this a release candidate. Do not call it final/public until the manual hardware gate above passes.

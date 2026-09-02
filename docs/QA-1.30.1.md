# MosaicSync 1.30.1 QA / release-candidate checklist

## Automated/package/reproducibility gates — PASS

- [x] Full Node regression suite passes: **526/526**.
- [x] Performance benchmark passes.
- [x] Package-size guard passes with consciously reviewed 1.30.1 baseline.
- [x] 33 UI locales have 406 keys, no empty values, matching placeholders and no duplicate English reverse-map sources.
- [x] Firefox and Chrome both contain 33 valid manifest locales, including Galician and excluding Arabic.
- [x] Firefox/Chrome New Tab shared runtime remains byte-identical where intended.
- [x] Exact own-write Settings echoes produce zero Settings refresh domains.
- [x] Frequently Visited changes refresh only the Frequently Visited domain and do not rebuild Background/theme-wallpaper controls.
- [x] Separate Light/Dark wallpaper state changes refresh only the Background domain; own echoes do not globally reconstruct Settings.
- [x] Device-artwork-only same-clock events retain the dedicated live-artwork path.
- [x] Automatic favicon final-quality mode continues past an adequate 64 px candidate and selects a later superior 192 px candidate in deterministic Firefox and Chrome fixtures.
- [x] Completed favicon quality audits persist device-locally with a 30-day opportunistic TTL/policy version, bounded ledger and exact-URL queue deduplication.
- [x] User-uploaded, manually chosen and built-in artwork remains protected from automatic replacement.
- [x] Top Sites permission events are isolated from Website Access/favicon work, and Website Access events are isolated from Frequently Visited.
- [x] Finished Firefox/Chrome ZIPs inspected directly for version, locale set, package hygiene and corrective code paths.
- [x] GitHub-ready archive excludes artifacts, caches, generated Python bytecode and runtime archives.
- [x] Fresh GitHub-ready extraction passes the complete **526/526** suite and benchmark.
- [x] Fresh extraction rebuilds Firefox and Chrome runtime ZIPs byte-for-byte identical to the release-candidate ZIPs.

## Manual hardware gate — REQUIRED BEFORE PUBLIC/FINAL

- [ ] Firefox / Linux Mint 22.3 Cinnamon X11: toggle Frequently Visited repeatedly with Settings open; panel never blanks.
- [ ] Firefox / Linux Mint 22.3 Cinnamon X11: toggle Separate Light/Dark wallpapers and change both wallpaper/dim controls; panel never blanks; final page appearance applies after close.
- [ ] Windows Firefox: repeat both Settings flows and verify no blank panel.
- [ ] Automatic favicon learning upgrades a visibly low-quality favicon on a real site where Choose detected favicon finds better artwork (for example the reported videocarz.com case, without any site-specific code).
- [ ] Empty Personal and Work: helper bubble/arrow alignment remains correct.
- [ ] Fresh-device Personal+Work Sync recovery smoke test on a separate Firefox profile.

## Release state

**Release candidate.** Automated, packaging and clean-source reproducibility gates pass. Do not call 1.30.1 final/public until the manual hardware gate above passes.

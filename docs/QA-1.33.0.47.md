# MosaicSync 1.33.0.47 QA / release-candidate checklist

## Scope and baseline

Neofix 3 visual/UX pass using corrected GitHub-ready 1.33.0.46 (`59c3df4b079e6a28…`) as exact source baseline. Only six bundled icon primitives, Settings/Welcome presentation and version/release/test infrastructure should change. No Sync, Recovery, persistence, permissions or schemas.

## Mandatory verification

1. Run the eight `.47` tests against `.46` and ensure they fail, then pass against `.47`.
2. Run the entire regression suite and all eight focused groups, including `.45` Chrome callback and `.46` browser smoke gate regressions. Treat intermittent worker stalls as runners to investigate rather than silently skipping tests.
3. Render all 13 built-in icons for Firefox/Chromium in light/dark environments at 21, 30, 48 and 120 CSS pixels, visually inspect outlines, clearance, centering and legibility. Compare against `.46`.
4. Test appearance buttons with keyboard/mouse; verify aria-labels survive and that System follows actual OS theme. Test wallpaper darkness sliders in both themes.
5. Open Settings, verify Background, New Tab identity and Backup & Transfer section order; verify the branding dialog and backup export/import buttons still work.
6. Run fresh Welcome wizard in every supported browser matrix slot, verify statuses/errors appear above the donation panel, with readable contrast.
7. Ensure `.github/workflows/neofix-browser-gate.yml` completes with all four browser jobs and `RELEASE GATE` green on the actual GitHub source commit. **Do not call browser certification PASS unless that evidence exists.**
8. Run release-contract, test-inventory and runtime-reachability checks. Rebuild all three ZIPs from the GitHub-ready ZIP in a clean directory; hashes must match bit-for-bit. No new permissions.
9. Independent Claude audit before publication.

## Startup budget adjustment

The three fixed Settings appearance SVG pictograms contribute **12 Settings-only HTML elements**, changing the exact critical-path HTML element count from 598 (490 secondary) to **610 (502 secondary)**. Primary New Tab first-frame elements remain 108; the existing 186 eager-binding, 151 secondary-binding and 23 static-module ceilings remain unchanged. The old regression now caps this intentional +12 instead of silently removing the guard.

## Non-goals

No persistence refactor, no favicon-service extraction, no distributed Sync remediation and no permission changes. Those remain separate future work.

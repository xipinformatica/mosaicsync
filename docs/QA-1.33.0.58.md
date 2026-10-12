# MosaicSync 1.33.0.58 QA / release-candidate checklist

Baseline: 1.33.0.57 GitHub-ready source; fixes informed by the independent `MosaicSync-1.33.0.57-ci-check.md` report and GitHub browser-gate run 38282581050.

## Corrective changes

- Chromium fresh-setup smoke: reselect its own tab and apply a consistent DevTools viewport before clicking controls, so the extension Welcome tab cannot leave WebDriver targeting a 56-pixel background viewport.
- Redirect naming runtime: one extension-origin-filtered `webRequest` listener pair per background lifetime, with bounded 300-ms event-based wait after each manual redirect response; never read or follow an unverified `Location`.
- Title redirect smoke: check redirect results independently, confirm direct naming and require observed canonical/blocked/loop redirects in controlled Chromium, with forbidden-host requests always at zero. Firefox may explicitly fail closed when its API does not expose headers.
- Firefox: use privileged browser-chrome `BrowserCommands.openTab()` (or trusted-tab equivalent) in test-only isolated Firefox and verify the resulting extension new-tab URL. Never navigate directly to an extension page as a substitute for a New Tab override.
- Reviewer documentation correctly discloses `webRequest` as new relative to the last published .49, though it was already present in the .56 and .57 sources.

## Mechanical and browser checks

1. `npm test`, `npm run reachability`, `python tools/release_contract.py` and `python tools/package.py` must all pass.
2. The full GitHub browser matrix must pass on Chromium 141/stable and Firefox 140/current, including the final release gate.
3. Inspect per-browser artifacts for fresh onboarding, shortcut creation, Settings, Spaces, confirmation, New Tab override and safe redirect outcomes.
4. Test upgrading from the last published version with real profile/Sync data intact, and inspect permission prompts. CI test manifests deliberately pregrant optional website permissions, so they cannot certify the actual prompts.
5. **Do not publish store ZIPs until the real GitHub browser gate has passed.** A local Node test or mechanical certification is not a real-browser PASS.

## Deferred

- Non-English login-page title filtering remains a LOW-priority issue unrelated to this CI correction; the safe `og:site_name` preference continues to reduce exposure.

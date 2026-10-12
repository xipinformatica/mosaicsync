# MosaicSync 1.33.0.57 QA / release-candidate checklist

Input baseline: user-supplied 1.33.0.56 GitHub-ready ZIP. User-provided GitHub Action run `38282581050` showed: mechanical SUCCESS; Chrome stable modal close/reopen race FAILED; Chromium 141 main browser smoke PASS but title-redirect check FAILED (`redirect-unavailable`); Firefox 140 and latest browser smoke FAILED, followed by cleanup `TypeError` when display was null.

## Fixes under test

- `tools/browser-smoke.mjs`: safe Firefox cleanup, WebDriver 20-second request deadline, Firefox new-tab keyboard gesture with handle selection, and real confirmation close-event synchronization.
- `tools/title-redirect-smoke.mjs`: direct-title positive control, strict rejection of cross-host contact, safe absence-of-header fallback with explicit `redirectCapability`, real Firefox new-tab access. No weakening of production `fetchShortcutTitleResponse` security policy.
- `.github/workflows/neofix-browser-gate.yml`: latest Node24-based checkout, setup-node and upload-artifact Actions.

## Required next steps (not automatically certified by ZIP creation)

- Upload GitHub-ready source to GitHub main; wait for all four browser jobs and the mechanical job to show PASS.
- Inspect browser evidence for Chrome/Firefox genuine onboarding, shortcut creation, confirmation, Settings, Spaces and New Tab override. Firefox must load `moz-extension://` and Chrome `chrome-extension://`.
- Check `redirectCapability` in each native browser report: `observed` verifies canonical redirects; `unavailable-fail-closed` is a browser-API limitation, not a working redirect-title capability. Cross-host `/forbidden` must never be requested.
- Validate an upgrade from installed .56 on both browsers with existing shortcuts, settings and Sync left intact. Check real-user permission behavior, which is deliberately not simulated by this smoke.
- Do not publish until the full browser gate and manual upgrade check are satisfactory.

No claim is made that production redirect title detection works in every Chromium version, because the observed .56 Chrome 141 result contradicts that claim. The safe offline naming path is always retained.

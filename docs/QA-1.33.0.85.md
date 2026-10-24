# MosaicSync 1.33.0.85 QA / release-candidate checklist

**PRIVATE HOLD.** Based on audited 1.33.0.84. No publication authorization.

## Change scope
- Shared `chooseShortcutPageName` in `src/shared/newtab/ui-utils.js`, used in editor and post-save naming.
- `src/shared/newtab/newtab.js` avoids a second website lookup after the exact website-suggested name has been accepted and saved; quick Save/Enter retains the existing conditional enrichment.
- Existing saved names remain unchanged. No Sync/Recovery/background/permission/schema modifications.
- 14 behavioral regressions in `tests/naming-identity-133085.test.mjs`, including shipped Firefox/Chrome background lookups and save handler simulation.

## Release gates
- Confirmed source baseline SHA-256: `57eca384abea53bbb9969f70ec853165963f8d59b2aca5a40a99ec6f2481cb4b` (1.33.0.84 GitHub-ready private source).
- `DEVELOPER-GUIDE.md` must remain byte-identical, SHA-256 `e18406e412a7ab2132d47aaa1511b305756e7944e51050b31459d753ca2e593e`.
- Full regression suite + clean-room suite; red-before-green; inventory; runtime reachability; deterministic ZIP rebuild; independent Claude audit.
- Browser acceptance: Tesla, Le Monde, Booking.com, a tracking URL, a news article and a Google Doc, with Website Access enabled and disabled; verify Enter vs wait-then-Save and no second rename.
- Six GitHub exact-commit jobs on the owner-approved .85 commit: **NOT PERFORMED** in private build.
- Signed-in two-device acceptance: **NOT PERFORMED**. If waived by owner, record as waived and not passed.

## Known limitations
- Offline peers during a Sync reset can require an explicit layout choice on reconnection; Stage 3B remains archived.
- Some ambiguous site-specific branding and edition parameters may not generate ideal names; no retroactive renaming is attempted.

# MosaicSync 1.33.0.87 QA / release-candidate checklist

**Ready for owner publication workflow after mechanical validation; exact-commit GitHub checks remain outstanding.**

## Source and scope
- Baseline: the public-release-packaged `mosaicsync-1.33.0.86-github-ready.zip`.
- Runtime implementation change: `src/shared/newtab/newtab-secondary.css` only; responsive action-button sizing and alignment.
- Version fields updated in both manifests, constants and New Tab HTML.
- No changes to JavaScript, translations, icons, background, Sync, Recovery, permissions, telemetry or data formats.
- The protected `DEVELOPER-GUIDE.md` SHA-256 is `e18406e412a7ab2132d47aaa1511b305756e7944e51050b31459d753ca2e593e`.

## Validations
- The corrective tests were red on unmodified .86 and green on .87.
- Full tests, browser visual-layout matrix, test inventory, source reproduction and deterministic package results: see `.87-RELEASE-BUILD-VERIFICATION.md` accompanying ZIPs.
- All 34 source UI locales and browser manifest locale message files must remain byte-identical to .86.

## Publication gates
- Independent Claude audit for .86: GO; not an independent .87 audit.
- GitHub six exact-commit release checks for .87: NOT PERFORMED at the time of packaging.
- Real signed-in two-device acceptance: NOT PERFORMED — owner-waived.
- GitHub/store submission: owner-controlled; this packaging step performs no remote writes.
- Known offline-reset limitation unchanged.

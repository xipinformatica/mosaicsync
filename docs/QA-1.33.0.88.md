# MosaicSync 1.33.0.88 QA / release-candidate checklist

**Private release candidate. Do not publish until independent review and exact-commit release checks are complete.**

## Baseline and implementation

- Baseline: user-provided complete 1.33.0.87 GitHub-ready source ZIP.
- UI changes: `src/shared/newtab/newtab.html`, `.js`, `newtab-secondary.css`.
- Localization: one new UI label (`discoverAutomatically`) translated in every one of the 34 source locales.
- Only browser manifests' version identifiers change; no new permissions or external services.
- No edits to automatic favicon resolver/background behavior, Sync logic, Recovery logic, data schemas, image fetch limits, or custom image encodings.

## Acceptance criteria

- Four selection buttons equal dimensions and type on desktop/narrow, regardless of translated label length.
- Preview gray only while automatically managed and empty; Clear image directly beneath preview for manual artwork; automatic mode reset works.
- Web-image URL exists only inside its modal; Enter applies web image, not Save; invalid URL, denied permission, dismiss and changed editor cannot affect existing image.
- Only locally uploaded files show "Sync this image". Opening/saving a legacy synchronized manually chosen favicon must not discard stored image bytes.
- Full/regenerated clean-room test suite and reproducible ZIPs pass; tests prove no persisted schema drift.

## Outstanding before publication

- Independent audit of exact 1.33.0.88 source and generated artifacts: NOT PERFORMED.
- Six exact-commit GitHub release checks: NOT PERFORMED (user solely controls GitHub).
- Real installed-extension editor smoke test, signed-in two-device acceptance: NOT PERFORMED unless separately verified.
- Known offline-reset limitation carries forward unchanged.

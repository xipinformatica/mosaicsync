# MosaicSync 1.33.0.89 publication notes

## GitHub release title

`MosaicSync 1.33.0.89`

## Firefox Add-ons — What's new

**Maintenance release**

No changes to Firefox features or behavior. This version keeps Firefox and Chrome release numbers aligned.

## Chrome Web Store — What's new

**Fixed missing website icons**

Some websites could lose an icon that Chrome had already saved. MosaicSync now keeps these icons correctly, even if the website blocks direct icon discovery, once Chrome has the icon (for example, after you visit the site). Existing shortcuts and manually selected images are preserved.

## GitHub release — changes since 1.33.0.88

- Fixes Chromium's private favicon service sometimes reporting PNG images with an incorrect file type, causing otherwise valid detected icons to disappear on Save.
- Detects PNG by its complete eight-byte file signature before constructing a browser image data URL.
- Adds regressions for a wrongly labeled image, placeholder rejection and incomplete PNG signatures.
- No changes to automatic name lookup, the .88 shortcut editor, Firefox favicon fetching, Sync, Recovery, stored formats, translations, permissions or privacy.

## Publication status

Private candidate only. Independent .89 runtime audit: GO (1,702 tests, 25 adversarial checks, Chrome scenarios, reproducible packages); this documentation-only correction changes the source ZIP fingerprint, not the browser packages. Six exact-commit GitHub checks, owner approval and confirmation of store versions remain outstanding. Signed-in two-device testing was owner-waived, not passed. No GitHub or store uploads were performed.

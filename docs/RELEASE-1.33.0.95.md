# MosaicSync 1.33.0.95 publication notes

## GitHub release title

`MosaicSync 1.33.0.95`

## Firefox Add-ons — What's new

Improved translations in all 34 languages, including clearer Recovery messages and more helpful errors for Sync, website addresses and images. Fixed wording on small screens and made formatting more consistent. Sync and Recovery storage behavior have not changed.

## Chrome Web Store — What's new

Improved translations in all 34 languages, including clearer Recovery messages and more helpful errors for Sync, website addresses and images. Fixed wording on small screens and made formatting more consistent. Sync and Recovery storage behavior have not changed.

## GitHub release — changes since 1.33.0.94

- Modernizes all 34 UI locale catalogs: Recovery copy naming, count-neutral labels, destructive confirmations, punctuation, singular/plural grammar and selected language/register fixes.
- Adds localized, actionable presentation errors for common shortcut URL, image, custom branding, Sync delivery, Sync permission and local storage failures in New Tab/Welcome. Keeps the original Error objects and codes, and logs unknown failures before showing localized fallback messages.
- Improves Firefox/Chromium-specific UI labels, German Recovery heading wrap, Greek narrow-screen Settings label, Neapolitan number/date formatting, and localized byte labels where reviewed.
- Includes safeguards for Recovery terminology, grammatical counts and Bulgarian formality, plus browser-text leakage, placeholder integrity and stable error presentation.
- Shared Sync/Recovery background implementation and storage protocols unchanged. No new services, permissions, telemetry, persistent formats or Stage 3B changes.

## Release precautions

- This release packages the independently audited P3-polished language patch (SHA-256 `d4765ccde30b373d7b72ab7fe52f361d21c5725a1a72acaabb13c48bf5d5d42f`) on the exact approved ROUND3 `.94` source (SHA-256 `a86840a9053a9a39582adc486237a3f27dd9cb20d01fe3d62d21a2914460fc77`) with a `.95` version and documentation update.
- Before publication, obtain independent approval for the exact `.95` packages, verify real browser install/upgrade behavior, and confirm generated `dist/` and `build-manifest.json` are current.
- Signed-in multi-device Sync is UNVERIFIED and is not claimed as passed. Firefox ESR 140, accessibility/screen readers and Windows font rendering are outside this language audit's evidence.
- This document does not authorize GitHub or browser-store publishing.

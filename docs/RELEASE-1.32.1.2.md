# MosaicSync 1.32.1.2 publication notes

## Mozilla changelog

Completes a full 33-language UI localization audit: Recovery and Custom Branding are contextually translated in every non-English catalog, the remaining Recovery “Sync storage” label is localized, Maltese legacy folder/color terminology is normalized, and permanent checks now require every exact-English catalog value — including single-word matches — to be explicitly reviewed. No Sync/Recovery data-model, permission, profile-format or browser-floor changes.

## Mozilla Notes to Reviewer

1.32.1.2 is a localization-only corrective. It updates UI catalogs, promotes one existing Recovery label into the localization catalog, and adds localization-integrity tests. No permissions, remote code, telemetry, storage schemas, profile format, Sync/Recovery wire formats or browser floors change.

## Chrome Web Store release notes

Completes Recovery and Custom Branding translations across MosaicSync's supported UI languages and adds permanent localization-completeness checks. No feature, permission, Sync/Recovery or profile-format changes.

## GitHub release title

`MosaicSync 1.32.1.2`

## GitHub release description

MosaicSync 1.32.1.2 is a localization semantic-completeness corrective over 1.32.1.1.

The complete Recovery safety-copy manager and Custom Branding surfaces are now contextually translated in every non-English UI catalog, using each language's existing MosaicSync terminology for New Tab, devices, Recovery, Sync storage, branding controls and actions rather than carrying English placeholder wording forward. The remaining English-only `Sync storage` label in the Recovery dialog is now part of the normal localization catalog.

A new permanent localization-integrity suite guards these areas, rejects unreviewed exact-English values in non-English catalogs even when they are only one word, and scans visible New Tab static UI text for literals that bypass localization. Legitimately identical cognates, product names and established technical loans are explicitly reviewed rather than globally exempted. The final terminology pass also normalizes older Maltese `folder` wording to `fowlder/fowlders` and the Burgundy color label to `Borgonja`.

There are no feature, permission, CSP, persisted-schema, profile-format, Sync/Recovery wire-format, first-paint or browser-floor changes. Custom Branding remains device-local and outside browser Sync/Recovery exactly as in 1.32.1.1.

## GitHub Desktop

**Summary:** `Release MosaicSync 1.32.1.2 — complete UI translations`

**Description:** `Complete the 33-language localization audit, finish Recovery and Custom Branding translations, localize Sync storage, normalize remaining terminology, and add permanent translation-integrity gates.`

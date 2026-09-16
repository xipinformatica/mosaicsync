# MosaicSync 1.32.1.2 localization audit

## Finding

The pre-1.32.1.2 localization tests proved catalog structure, key parity and placeholders but did not prove semantic translation. This allowed complete locale files to carry English source wording for newer features. The audit therefore reviewed the full 33-locale catalog, with special attention to Recovery and Custom Branding, and checked visible New Tab literals outside the catalog.

## Corrective result

- Every source locale has 473 keys.
- All 32 non-English locales have context-specific Recovery and Custom Branding wording rather than English fallback strings.
- The Recovery `Sync storage` eyebrow is catalog-owned.
- Every exact-English fallback, including single-word values, must now be explicitly reviewed; unreviewed matches are a release-test failure.
- The final Maltese terminology pass normalizes `folder`/`folders` to **fowlder/fowlders** and the Burgundy color label to **Borgonja**, while retaining Microsoft-established Maltese computing loans such as `shortcut` and `bookmark`.
- Visible static New Tab strings that bypass localization are now a release-test failure unless explicitly reviewed as invariant.
- The only reviewed exact-English multi-word catalog exceptions are French `source {id}` and Maltese `{count} bookmarks`, both retained intentionally for language/context reasons.

This release changes localization content and test coverage only; it does not change MosaicSync's feature, Sync, Recovery, profile, permission or browser-compatibility contracts.

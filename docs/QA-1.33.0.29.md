# MosaicSync 1.33.0.29 QA / release-candidate checklist

1.33.0.29 is a narrow New Tab usability release over 1.33.0.28. Shortcut names are optional for newly added shortcuts; URL remains mandatory and the existing host-derived fallback supplies the saved title. The release also carries forward two test-only hardening items from the independent 1.33.0.28 audit. No persisted schema, Sync/Recovery wire format, permission, CSP, browser floor, artwork policy or storage-authority change is introduced.

## Canonical certification

- Unique canonical test files: **189**
- Canonical suite: **1,335 / 1,335 PASS**
- Startup: **285 / 285**
- New Tab: **529 / 529**
- Sync: **345 / 345**
- Recovery: **220 / 220**
- Security: **214 / 214**
- Browser/parity: **253 / 253**
- Core: **201 / 201**
- Release: **438 / 438**
- Browser probe: Chromium + Xvfb available; ChromeDriver, Firefox and GeckoDriver unavailable
- Certification level: **MECHANICAL_ONLY**

Runtime reachability and clean-room/deterministic packaging evidence are recorded by the canonical certification command below.

## Red-before-green evidence

Against the untouched sealed 1.33.0.28 source, the three product-behavior tests in `tests/feature-133029.test.mjs` produced **1/3 PASS, 2/3 FAIL**:

- the Name field was still HTML-required;
- Add Shortcut still focused Name rather than the now-only mandatory URL;
- the existing URL→hostname save fallback already passed, confirming the production fallback logic pre-existed the UI change.

After the narrow production correction, all three product-behavior tests pass. The separate focused-group ownership regression is green after registering the new feature test in New Tab, Browser and Release certification groups.

## Carried-forward adversarial test hardening

The two findings saved from the independent 1.33.0.28 audit are closed as test-only improvements:

- manual Recovery cleanup now has direct behavioral regressions proving a torn/fallback-assisted newest generation cannot mark its independently valid predecessor as superseded, and a current device with only a torn fallback cannot authorize whole-device deletion of another device's Recovery set;
- bookmark drag/drop now executes the real mutation functions for empty-tile creation, add-to-folder and occupied-shortcut→folder conversion, supplementing the existing source-shape/security assertions.

No production Recovery or bookmark-drag code was changed for these audit items.

## Scope proof versus 1.33.0.28

Intended production changes are limited to:

- release identity;
- `src/shared/newtab/newtab.html`: shortcut title is no longer HTML-required;
- `src/shared/newtab/newtab.js`: new Add Shortcut sessions focus URL, while Edit Shortcut continues to focus the title.

The existing save expression `shortcutTitle.value.trim() || hostLabel(url)` remains unchanged and supplies the automatic name. No background, Sync, Recovery, storage, permission, schema or browser-adapter production behavior is changed.

## Clean-room requirement

The final GitHub-ready source ZIP must independently reproduce the complete canonical suite, reachability result, Firefox ZIP, Chrome ZIP, GitHub-ready source ZIP and `build-manifest.json` byte-for-byte. The sealed certification report records the final result and SHA-256 hashes.

# MosaicSync 1.33.0.38 QA / release-candidate checklist

1.33.0.38 is a narrow shared artwork-policy cleanup plus byte-signature predecode hardening over 1.33.0.37.

## Acceptance

- PNG/JPEG/GIF/WebP/ICO leading-byte recognition takes precedence over a misleading declared MIME type for predecode geometry inspection.
- Unknown signatures remain fail-open to the established browser decoder and unchanged post-decode safety guard.
- The existing per-side and total-decoded-pixel limits remain independent and unchanged.
- WebP VP8X dimensions and PNG-backed ICO dimensions remain recognized before decode.
- Browser/native raster data-URL acceptance is owned by the shared artwork policy rather than duplicated regex/prefix checks.
- New Tab and background favicon flows share browser-fallback eligibility, automatic source classification, user-provenance preservation and no-downgrade policy.
- A late browser-native fallback cannot overwrite stronger site-discovered/newly supplied artwork.
- Built-in shortcut glyphs cannot be replaced by Firefox/history fallback artwork.
- Browser-native learned artwork remains refreshable by later browser-native artwork.
- Explicit device-only upload provenance remains explicit when learned pixels are serving only as fallback.
- No Sync/Recovery, schema, permission, privacy, image-limit or product-feature change.
- `DEVELOPER-GUIDE.md` records only evergreen ownership/invariants; there is no 1.33.0.38 history section.

## Red-before-green evidence

`tests/optimization-133038.test.mjs` was added against untouched 1.33.0.37. In both Firefox and Chromium worker builds, PNG bytes declaring unsafe 12,000×12,000 geometry but labeled as JPEG reached `createImageBitmap()` before rejection. `rasterDimensionsFromBytes()` likewise returned 0×0 for that mismatched MIME/signature pair. The shared artwork-policy module/integration did not exist.

The independent total-decoded-pixel behavior and the existing VP8X/PNG-backed-ICO readers were already correct in 1.33.0.37; their new tests are explicit hardening rather than falsely claimed production fixes.

## Deliberate-break evidence

The focused 1.33.0.38 regressions go red when each of these is broken independently:

- byte-signature recognition is disabled;
- the total decoded-pixel check is removed while per-side limits remain;
- the VP8X reader is disabled;
- embedded PNG geometry inside ICO is ignored;
- browser-native no-downgrade policy is disabled;
- the built-in glyph guard is removed;
- the New Tab commit-time artwork recheck is removed;
- browser-native-to-browser-native refresh authority is removed.

## Final mechanical evidence

Final sealed-candidate certification:

- Canonical groups: Startup 285/285; New Tab 585/585; Sync 350/350; Recovery 225/225; Security 240/240; Browser/parity 307/307; Core 237/237; Release 502/502.
- Complete unique inventory: 1399/1399 PASS across 198/198 test files; 0 ungrouped.
- Reachability: 0 unreachable shared modules, 0 unused named imports, 0 unreferenced private functions.
- Syntax/data/docs: 501 JS/MJS syntax checks PASS; 93 JSON files parse; 38 relative Markdown links checked with 0 broken.
- Final artifacts are produced by two independent deterministic package runs and must compare byte-for-byte before publication.

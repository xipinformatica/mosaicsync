# MosaicSync 1.33.0.38 publication notes

## AMO / Chrome Web Store changelog

Makes image safety more reliable when a file's declared type does not match its actual raster data, while keeping the existing compatibility fallback for unknown images. MosaicSync's browser/native favicon paths now also share one set of acceptance and no-downgrade rules.

## Mozilla Notes to Reviewer

1.33.0.38 is a narrow artwork-policy and image-preflight refinement over 1.33.0.37.

The worker-side predecode raster guard introduced in 1.33.0.37 previously selected its PNG/JPEG/WebP/GIF/ICO parser from the source's declared MIME type. A mislabeled oversized file could therefore miss the early dimension guard, be decoded by the browser, and only then be rejected by the unchanged post-decode safety check.

The shared raster validator now positively identifies supported raster families from their leading bytes before consulting the declared MIME type. A recognized byte signature wins over a misleading MIME hint. If no supported signature is recognized, the declared supported MIME remains only a parser hint; a parser miss still returns unknown geometry and preserves the established browser-decoder fallback. The existing post-decode dimension check remains unchanged.

This release also consolidates browser-neutral device-local artwork decisions into `core/artwork-policy.js`. New Tab, background favicon recovery and browser adapters now share raster data-URL acceptance, automatic source classification, browser-native fallback eligibility, proactive favicon eligibility, user-upload provenance preservation and learned-artwork replacement authority. The shared policy prevents browser/native fallback from downgrading site-discovered artwork, explicitly keeps built-in shortcut glyphs outside browser/history fallback eligibility, rechecks ownership after asynchronous native-history lookup, rejects unsupported Firefox top-sites SVG favicons at the raster boundary, and still permits browser-native artwork to refresh older browser-native artwork. Acquisition mechanics and browser-specific capabilities remain in their existing owners.

The refactor does not add a numeric source-ranking system; the shared policy expresses the actual semantic cases so explicit user-upload fallback behavior remains intact.

Permanent behavioral protection is in `tests/optimization-133038.test.mjs`. Red-before-green against 1.33.0.37 proves mislabeled oversized PNG bytes reached `createImageBitmap()` when labeled as JPEG. Separate hardening directly exercises the independent 32 MP total-pixel limit, WebP VP8X geometry and PNG-backed ICO geometry. Deliberate breaks confirm all of those protections plus built-in-artwork protection, stale async native-lookup protection, browser-fallback no-downgrade policy and browser-native refresh semantics are test-sensitive.

No image limit, accepted raster family, persisted artwork format, permission, CSP, Sync/Recovery behavior, profile schema, telemetry, network behavior or browser floor changes are introduced.

## GitHub release title

`MosaicSync 1.33.0.38`

## GitHub release description

MosaicSync 1.33.0.38 refines image safety and device-local artwork handling.

- Supported raster files are identified from their actual leading bytes before predecode dimension checks, so a mislabeled oversized image can still be rejected before a full browser decode.
- Unknown image metadata keeps the existing compatibility fallback.
- Browser/native favicon handling now shares one browser-neutral policy for accepted raster artwork, fallback eligibility and no-downgrade behavior.
- Stronger site-discovered artwork is protected from browser/history fallback; built-in glyphs remain explicitly outside fallback eligibility; existing browser-native learned favicons can still refresh normally.
- Explicit user artwork provenance remains preserved when automatic artwork is only acting as a fallback.

No new feature, permission, Sync/Recovery-format, profile-schema or privacy change is included.

## Final certification

Final sealed-candidate certification:

- Startup 285/285; New Tab 585/585; Sync 350/350; Recovery 225/225; Security 240/240; Browser/parity 307/307; Core 237/237; Release 502/502.
- Complete unique inventory: 1399/1399 PASS across 198/198 test files.
- 198/198 test files belong to at least one canonical group; 0 ungrouped.
- Reachability 0/0/0; 501 JS/MJS syntax checks PASS; 93 JSON parses PASS; 38 relative Markdown links checked with 0 broken.
- Publication artifacts are sealed only after two independent deterministic package runs compare byte-for-byte.

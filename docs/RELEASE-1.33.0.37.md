# MosaicSync 1.33.0.37 publication notes

## AMO / Chrome Web Store changelog

Improves image-processing safety by rejecting clearly oversized image geometry before the browser performs a full pixel decode. Normal supported images keep the same behavior.

## Mozilla Notes to Reviewer

1.33.0.37 is a narrow image-worker robustness/performance refinement over 1.33.0.36.

Previously, worker-side image optimization called `createImageBitmap()` before checking decoded width/height against MosaicSync's existing `MAX_SOURCE_DIMENSION` and `MAX_DECODED_PIXELS` limits. A compressed raster that advertised unsafe geometry could therefore cause the browser to attempt a potentially large decode allocation before MosaicSync rejected it.

The shared browser-neutral raster-validation module now exposes a best-effort compressed-byte dimension inspector for the already-supported PNG, JPEG, WebP, GIF and ICO families. The image worker uses that geometry before `createImageBitmap()`. If recognized dimensions exceed the existing limits, the request is rejected before browser decode.

This preflight is deliberately not a new image-acceptance boundary. If metadata cannot be recognized, the worker preserves the existing decoder compatibility path. The existing post-decode dimension check remains in place as defense in depth. Data-URL jobs reuse the bytes already decoded from base64; Blob/file jobs inspect their compressed bytes in the worker before decode.

No image limits, accepted MIME families, persisted artwork formats, permissions, CSP, Sync/Recovery behavior, profile schema, telemetry, network behavior or browser floor changes are introduced.

Permanent behavioral protection is in `tests/optimization-133037.test.mjs`. Red-before-green against 1.33.0.36 proves both browser builds previously invoked `createImageBitmap()` for oversized Blob and data-URL PNG inputs. Deliberately removing the predecode guard makes those regressions fail again. Compatibility tests prove unrecognized compressed metadata still reaches the browser decoder, and the shared preflight reports ordinary geometry for PNG/JPEG/WebP/GIF/ICO.

## GitHub release title

`MosaicSync 1.33.0.37`

## GitHub release description

MosaicSync 1.33.0.37 makes local image processing more defensive.

- Clearly oversized raster geometry is rejected before the browser performs a full pixel decode.
- PNG, JPEG, WebP, GIF and ICO geometry can be inspected from compressed bytes before decoding.
- Unrecognized metadata still uses the existing browser-decoder compatibility path.
- The existing post-decode safety check remains in place.

No new feature, permission, Sync/Recovery-format, profile-schema or privacy change is included.

## Final certification

Full unique suite: 1386/1386 PASS across 197/197 test files. Canonical group totals: Startup 285; New Tab 572; Sync 350; Recovery 225; Security 227; Browser/parity 294; Core 224; Release 489. Reachability is 0 unreachable shared modules / 0 unused named imports / 0 unreferenced private functions. 497 JS/MJS files pass syntax checks; 93 JSON files parse; 38 relative Markdown links resolve. Deterministic packaging is verified in the sealed artifacts.

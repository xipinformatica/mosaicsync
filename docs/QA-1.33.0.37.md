# MosaicSync 1.33.0.37 QA / release-candidate checklist

1.33.0.37 is a narrow image-worker predecode geometry refinement over 1.33.0.36.

## Acceptance

- Recognized oversized PNG/JPEG/WebP/GIF/ICO geometry is rejected before `createImageBitmap()`.
- Blob/file and data-URL worker sources both receive the predecode protection.
- Data-URL jobs reuse their already-decoded compressed bytes rather than decoding base64 twice.
- Unknown/unrecognized compressed metadata remains fail-open to the existing browser-decoder path.
- The existing post-decode width/height/pixel-count guard remains unchanged.
- Normal supported raster formats keep their existing optimization behavior.
- No image-limit, accepted-format, persisted-artwork, permission, CSP, Sync/Recovery, schema, telemetry, network or browser-floor change.
- `DEVELOPER-GUIDE.md` contains only the evergreen predecode/compatibility invariant, not a release-history section.

## Red-before-green evidence

`tests/optimization-133037.test.mjs` was added against untouched 1.33.0.36. Both Firefox and Chromium worker builds called `createImageBitmap()` once for recognized 20,000×20,000 PNG geometry before rejecting it; both Blob and data-URL cases therefore failed the new zero-decode assertions. The shared raster dimension inspector was also absent. The compatibility controls for unrecognized metadata already passed.

After the refinement, oversized recognized geometry is rejected with zero decoder calls in both browser builds, the inspector reports 16×16 geometry for the existing PNG/JPEG/WebP/GIF/ICO fixtures, and unrecognized metadata still reaches the browser decoder. Deliberately removing the predecode call returns the four oversized-source regressions to red while leaving compatibility controls green.

## Final mechanical evidence

- Full unique suite: 1386/1386 PASS across 197/197 test files, completed in disjoint runs (408 + 372 + 296 + 310).
- Canonical groups: Startup 285/285; New Tab 572/572; Sync 350/350; Recovery 225/225; Security 227/227; Browser/parity 294/294; Core 224/224; Release 489/489.
- Test-group coverage: 197/197 files belong to at least one canonical group; 0 ungrouped.
- Reachability: 0 unreachable shared modules; 0 unused named imports; 0 unreferenced private functions.
- Syntax/data/docs: 497 JS/MJS files pass `node --check`; 93 JSON files parse; 38 relative Markdown links resolve.
- Focused image/security/profile compatibility run: 164/164 PASS.
- Deliberate-break check: removing the predecode call makes all four oversized Blob/data-URL regressions fail again while the fail-open compatibility controls remain green.

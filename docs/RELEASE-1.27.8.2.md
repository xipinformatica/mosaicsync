# MosaicSync 1.27.8.2 publication notes

## Mozilla Developer Hub — concise changelog

New Tab startup-performance release for older/slower computers. Matching cached tile previews now stay visible until full artwork is decoded, avoiding the preview/fallback/full-image flash. Startup reuses already-validated local-asset identities instead of repeatedly hashing the same image bytes, defers heavyweight custom-wallpaper hydration until after shortcut paint, limits closed-folder first-frame preview work to the four visible mosaic children, and requests asynchronous image decoding. No Sync/security behavior, permissions or image quality changed.

## Notes to Reviewer

1.27.8.2 is a narrowly scoped New Tab rendering-performance follow-up to 1.27.8.1. It does not change Sync/profile/state schemas, synchronized conflict/tombstone rules, permissions, CSP, telemetry, remote-code behavior, navigation safety, image/SVG trust-boundary validation or import handling.

The main rendering change closes the handoff gap between the synchronous `render-bootstrap.js` artwork tier and the authoritative New Tab renderer. If a tile's cached 48×48 preview has the same current content-addressed artwork key, that validated preview remains visible while the full local artwork image loads and decodes. Full artwork is layered hidden and swaps in only after decode; stale previews are rejected by exact artwork-key comparison. Images also request asynchronous decoding. This preserves recognizable pixels instead of temporarily regressing to a fallback letter on slower CPUs.

The local-asset startup path still performs the existing full validation/hash check when bytes cross the `storage.local` trust boundary. 1.27.8.2 carries the resulting transient `dataUrl → assetId` memo through normalization and write-baseline construction so the same bytes are not immediately hashed multiple additional times. The permanent synthetic 200-artwork benchmark records approximately 98.5 ms → 31.1 ms for startup normalization and 104.8 ms → 30.8 ms for startup baseline construction on the build host when the validated memo is reused; these values are comparative build-host measurements, not claims for end-user hardware.

Custom full-resolution wallpaper bytes are removed from the first authoritative active-Space asset batch. The existing lightweight appearance preview remains visible, shortcut artwork is hydrated first, then exactly the referenced full wallpaper asset is loaded on the next frame and applied without rebuilding the grid. Closed-folder render-manifest/preview generation is also limited to the four children that can actually appear in the closed-folder mosaic; authoritative folder contents remain untouched.

Regression coverage verifies wallpaper deferral/single-asset upgrade, memo propagation, four-child folder projection, strict artwork-key preview matching, preview-to-full decode continuity (including detached-fragment completion), and asynchronous decoding in Firefox and Chrome. The complete release suite passes 430/430 tests.

## Chrome Web Store release note

Faster New Tab startup on older/slower computers. MosaicSync now keeps matching cached shortcut previews visible until full artwork is decoded, removes repeated image-identity hashing from the startup hot path, prioritizes shortcut artwork ahead of full custom-wallpaper hydration, and reduces hidden closed-folder preview work. Sync, security and image quality are unchanged.

## GitHub commit

**Summary:** `Release MosaicSync 1.27.8.2`

**Description:** `Optimize New Tab startup on older/slower CPUs by preserving matching bootstrap artwork through full-image decode, reusing validated asset identities, deferring full custom-wallpaper hydration, and reducing closed-folder first-frame preview work.`

## GitHub release

**Title:** `MosaicSync 1.27.8.2 — Faster New Tab artwork startup`

**Body:**
MosaicSync 1.27.8.2 is a focused performance release aimed at older/slower desktop CPUs. It improves the handoff from MosaicSync's synchronous first-paint artwork previews to authoritative full artwork so a recognizable cached icon stays visible until the matching full image has decoded, instead of briefly falling back and progressively repopulating. The startup hot path also reuses asset identities already proven at the local-storage validation boundary, removing repeated hashing of the same image bytes. Full custom-wallpaper pixels are deferred until after the shortcut grid has had a frame to paint, and closed folders no longer spend first-frame render-manifest/preview work on children beyond the four visible mosaic cells. Firefox and Chrome receive the same behavior; Sync/security semantics, permissions and image quality are unchanged. The complete release suite passes 430/430 tests.

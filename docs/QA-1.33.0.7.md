# MosaicSync 1.33.0.7 QA / release-candidate checklist

## Scope

Snow Leopard II Step 4A only. Step 3 is closed at the 1.33.0.6 Bookmarks endpoint. 1.33.0.7 removes broad speculative inactive-Space background warming, replaces it with destination-specific user-intent hints, and preserves the actual Space-switch path as the background-readiness owner.

## Red-before-green proof

`tests/optimization-13307.test.mjs` was introduced on an untouched 1.33.0.6 copy and failed **6/6** before the Step-4A implementation. The same file passes **6/6** after correction.

## Authoritative verification

- Full suite: **1,192/1,192 PASS**.
- Startup group: **195/195 PASS**.
- New Tab group: **426/426 PASS**.
- Security group: **146/146 PASS**.
- Release group: **295/295 PASS**.
- Runtime reachability: no high-confidence unreachable shared modules, unused named imports or unreferenced private functions.
- Release contract: PASS for Firefox and Chromium generated trees.
- Browser probe: Chromium + Xvfb available; ChromeDriver unavailable; Firefox/GeckoDriver unavailable. Real-browser certification is therefore **not claimed**.

## Step-4A deterministic evidence

- Automatic inactive-Space background warm triggers: **4 → 0**.
- Explicit intent-driven destination warm triggers: **0 → 5** (`pointerenter`, `pointerdown`, `focus`, cross-Space `dragenter`, Alt+Shift Space shortcut).
- Actual Space switch still awaits `hydrateSpaceForOwnedOperation(spaceId, isCurrentSwitch, true)`.
- Active-Space post-paint warming remains unchanged.
- Initial DOM remains **598 elements**; eager bindings remain **186**; static module closure remains **23 modules**.
- Static module source: **640,749 bytes**, +287 bytes versus 1.33.0.6 for the intent helper/listeners.
- Firefox runtime package: **2,417,666 raw / 706,331 deflated bytes** (+287 raw / +23 deflated versus 1.33.0.6).
- Chromium runtime package: **2,439,308 raw / 720,846 deflated bytes** (+287 raw / +22 deflated versus 1.33.0.6).

## Clean-room reproduction

PASS. The GitHub-ready source ZIP was extracted into a fresh directory, rebuilt, reran the full **1,192/1,192** suite and repackaged. Firefox ZIP, Chrome ZIP, source ZIP and `build-manifest.json` were byte-for-byte identical to the originating packaged tree. A final clean-room pass is repeated after this QA record is sealed.

First-pass runtime hashes:

- Firefox ZIP: `545b80c370e44e8f0add0fe06b04da5aca9c619cc73ec500ead5c168e62a66d0`
- Chrome ZIP: `cccdecba33bbdef582ee694903530dbba96ee306bd8a5516fdd31a9cbfa9eb65`
- build-manifest: `bd2b8ca6e994c5f55059b8eb9c6bed819be2ee2b498f7304f227827afef79eb4`

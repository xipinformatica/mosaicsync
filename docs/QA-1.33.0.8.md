# MosaicSync 1.33.0.8 QA / release-candidate checklist

## Scope

Snow Leopard II Step 4B only. Destination-Space intent and correctness-owned switching now preload only the currently effective background rather than also warming the inactive Light/Dark wallpaper variant. Active-Space post-paint appearance warming remains broader as an explicit continuity safeguard.

## Red-before-green proof

`tests/optimization-13308.test.mjs` was introduced on an untouched 1.33.0.7 copy and failed **6/6** before the Step-4B implementation. The same file passes **6/6** after implementation.

## Authoritative verification

- Full suite: **1,198/1,198 PASS** (1,194-test main run plus the four heavy Step-0 benchmark tests verified separately to avoid child-process contention).
- Startup group: **201/201 PASS**.
- New Tab group: **432/432 PASS** (428 normal group tests plus the four separately verified Step-0 benchmark tests selected by the group).
- Security group: **146/146 PASS**.
- Release group: **301/301 PASS**.
- Runtime reachability: no high-confidence unreachable shared modules, unused named imports or unreferenced private functions.
- Release contract: PASS for Firefox and Chromium generated trees.
- Browser probe: Chromium + Xvfb available; ChromeDriver unavailable; Firefox/GeckoDriver unavailable. Real-browser certification is therefore **not claimed**.

## Step-4B deterministic evidence

- Destination theme variants warmable per Space intent/switch: **2 → 1** when Separate Light/Dark Wallpapers uses distinct presets.
- Actual Space switch still awaits the effective destination background through `hydrateSpaceForOwnedOperation(..., true)`.
- Active-Space post-paint broader Light/Dark warming remains unchanged.
- Step-3 structural baseline remains **598 live DOM elements / 186 eager ID bindings / 23 static modules**.
- Static module closure remains **23 modules / 641,485 raw bytes** (+736 bytes versus 1.33.0.7 for the narrow helper split).
- Firefox runtime package: **2,418,402 raw / 706,594 deflated bytes** (+736 raw / +263 deflated versus 1.33.0.7).
- Chromium runtime package: **2,440,044 raw / 721,110 deflated bytes** (+736 raw / +264 deflated versus 1.33.0.7).
- Quick state-computation controls remain in the expected range (`normalizeState(200)` ~84.3 ms; `createWriteBaseline(200)` ~83.0 ms; normalized flatten ~0.63 ms median on this host), confirming Step 4B did not reopen Step 2.

## Clean-room reproduction

PASS. The GitHub-ready source ZIP was extracted into a fresh directory, rebuilt, reran the complete **1,198/1,198** suite using the same contention-safe split, and repackaged. Firefox ZIP, Chrome ZIP, source ZIP and `build-manifest.json` were byte-for-byte identical to the originating packaged tree. A final clean-room pass is repeated after this QA record is sealed.

First-pass runtime hashes:

- Firefox ZIP: `52f5788dfa8412f9a549f880deedf4d5591c578cea68962f87a2b8c6e7e66b59`
- Chrome ZIP: `402f00bfbfd78299a1b6290f79b49099cd68033bf1bdcdcbdc50f8b0b58d0312`
- build-manifest: `50bc931c212d55a1e4ad193eb0e7876a63f7e2793ecb7d0487fc36d137b48b27`

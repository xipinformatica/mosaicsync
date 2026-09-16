# MosaicSync 1.33.0.2 QA / release-candidate checklist

## Scope

Snow Leopard II Step 1 only: critical-path census tooling and local startup phase granularity. No intentional production optimization.

## New permanent coverage

- `tests/snow-leopard-ii-13302.test.mjs`
  - `perf:critical-path` command and JSON schema;
  - finer local startup ownership phases;
  - immutable Step-1 census snapshot;
  - journey tracker advances to Step 2.
- The four Step-1 regressions were demonstrated red 4/4 before implementation and green afterward.

## Census

Canonical JSON: `docs/SNOW-LEOPARD-II-CENSUS-1.33.0.2.json`.

Deterministic findings: 642 initial elements (534 secondary), 200 eager ID bindings (165 secondary), 24 static New Tab modules / 653,646 source bytes, 40 dynamically deferred modules / 1,096,737 source bytes, and 9 parser-blocking classic bootstrap scripts / 28,892 source bytes.

## Browser evidence

The runtime now exposes finer phases to the existing browser-smoke collector. Real-browser timing still requires a compatible browser/WebDriver pair; unavailable environments must report that honestly rather than simulate timings.

## Final verification

- Full release-authoritative suite: **1,162/1,162 PASS**.
- Startup group: **176/176 PASS**.
- Release group: **265/265 PASS**.
- Runtime reachability: no high-confidence unreachable shared modules, unused named imports or unreferenced private functions.
- Quick Step-0 benchmark comparison remains within the expected host-sensitive range; no material regression is attributable to the five timing stamps.
- Package size: Firefox **2,407,401 raw / 703,046 deflated bytes**; Chromium **2,429,043 raw / 717,561 deflated bytes**.
- Browser probe: Chromium and Xvfb available; ChromeDriver absent; Firefox and GeckoDriver absent, so real-browser timing remains unavailable in this environment.
- Final deterministic packaging and clean-room reproduction: **PASS**. Extracting the GitHub-ready ZIP into a fresh tree, rebuilding, rerunning all 1,162 tests and repackaging produced byte-identical Firefox, Chrome, source ZIPs and build manifest.

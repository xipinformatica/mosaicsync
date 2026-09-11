# MosaicSync 1.33.0.1 QA / release-candidate checklist

## Scope

Snow Leopard II Step 0 only: permanent performance instrumentation and immutable baseline tooling. No production optimization is intentionally included.

## New permanent coverage

- `tests/snow-leopard-ii-13301.test.mjs`
  - performance-baseline command exists and is local-only;
  - benchmark supports machine-readable distributions;
  - deterministic New Tab DOM/module/storage-call budgets are captured;
  - real-browser smoke snapshots expose startup phases, navigation timing and DOM element count.
- The four Step-0 regressions were demonstrated red before implementation and green afterward.

## Baseline

Canonical JSON: `docs/SNOW-LEOPARD-II-BASELINE-1.33.0.1.json`.

Key deterministic values: 642 initial New Tab elements (534 secondary), 24 static New Tab modules / 653,457 source bytes, 117 shared-runtime storage call sites, Firefox 702,996 deflated bytes, Chromium 717,511 deflated bytes.

Representative host-sensitive benchmark medians: normalizeState(200) 86.254 ms; createWriteBaseline(200) 83.468 ms; flatten trust-boundary 81.276 ms vs normalized fast path 0.613 ms; Settings trust-boundary 82.826 ms vs normalized fast path 0.008 ms.

## Browser evidence

Real-browser performance collection is supported by the tooling, but the build environment does not provide usable Firefox/GeckoDriver or Chromium/ChromeDriver pairs. Browser timings are therefore recorded as unavailable rather than simulated.

## Release rule

1.33.0.1 establishes measurement infrastructure only. Future Snow Leopard II optimizations must cite a before/after metric from this framework and preserve correctness invariants.

## Final verification

- Full release-authoritative suite: **1,158/1,158 PASS**.
- Startup group: **172/172 PASS**.
- Release group: **261/261 PASS**.
- Runtime reachability: no high-confidence unreachable shared modules, unused named imports or unreferenced private functions.
- Browser probe: Chromium `/usr/bin/chromium` and Xvfb available; ChromeDriver absent; Firefox and GeckoDriver absent. Real-browser timing therefore remains unavailable in this environment.

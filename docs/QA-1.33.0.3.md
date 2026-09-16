# MosaicSync 1.33.0.3 QA / release-candidate checklist

## Scope

Snow Leopard II Step 2 only: remove measured duplicate state normalization/canonicalization on already-trusted internal paths while preserving every raw/persisted trust boundary.

## Production changes

- `createPersistedWriteBaseline()` clones the exact authoritative compact `storage.local` state payload for optimistic concurrency instead of rebuilding the same baseline through `normalizeState()` + local-asset projection.
- `stampSettingsMutationClocksTrustedNormalized()` carries already-normalized state proof through persistence, background Sync mutation handling and optimistic rebase.
- Raw/public callers retain the defensive `stampSettingsMutationClocks()` API.
- `writeLocalStateResult()` still normalizes the live intended state before persistence, and persisted/base state is still normalized before trusted Settings-clock stamping.

## Permanent coverage

- `tests/optimization-13303.test.mjs`
  - exact persisted compact baseline clone and ownership detachment;
  - proof that the persisted fast path performs no normalization/projection;
  - both New Tab `storage.onChanged` baseline-adoption branches;
  - benchmark control for defensive vs persisted baseline construction;
  - byte-equivalence of defensive and trusted Settings-clock stamping;
  - persistence, background Sync and optimistic-rebase normalized-state ownership;
  - immutable Step-2 evidence snapshot and journey transition to Step 3.
- The first four Step-2 regressions were demonstrated red 4/4 on untouched 1.33.0.2 before implementation and green afterward; the completed file is green 8/8.

## Performance evidence

Canonical JSON: `docs/SNOW-LEOPARD-II-STEP2-1.33.0.3.json`.

Host-sensitive standard-distribution medians from this build environment:

- `createWriteBaseline(200)`: **80.726 ms** vs persisted compact baseline clone **0.431 ms** (~187× lower median work).
- defensive Settings-clock stamping: **84.838 ms** vs trusted normalized stamping **1.176 ms** (~72× lower median work).
- `normalizeState(200)`: **85.005 ms**.
- `flattenState` trust-boundary: **81.371 ms** vs normalized fast path **0.631 ms**.

These timings are directional evidence on this host, not universal performance targets. Correctness tests own the trust-boundary contract.

## Final verification

- Full release-authoritative suite: **1,170/1,170 PASS**.
- Core group: **164/164 PASS**.
- Sync group: **262/262 PASS**.
- New Tab group: **407/407 PASS**.
- Release group: **273/273 PASS**.
- Runtime reachability: no high-confidence unreachable shared modules, unused named imports or unreferenced private functions; the defensive raw-state `stampSettingsMutationClocks` export remains an intentional review surface.
- Package size: Firefox **2,408,757 raw / 703,420 deflated bytes**; Chromium **2,430,399 raw / 717,935 deflated bytes**.
- Browser probe: Chromium and Xvfb available; ChromeDriver absent; Firefox and GeckoDriver absent. Real-browser startup certification therefore remains unavailable in this environment and is not claimed.
- Deterministic packaging and clean-room reproduction: **PASS**. Extracting the GitHub-ready source ZIP into a fresh tree, rebuilding, rerunning all 1,170 tests and repackaging produced byte-identical Firefox, Chrome, source ZIPs and build manifest.

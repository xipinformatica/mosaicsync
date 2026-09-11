# MosaicSync 1.33.0.10 QA / release-candidate checklist

## Scope

Snow Leopard II Step 5A only. Add local-only storage/background instrumentation and freeze the first semantic/runtime I/O census before changing production storage behavior. No production storage read/write optimization is part of this release.

A direct source comparison against the authoritative 1.33.0.9 GitHub-ready ZIP confirms that production runtime logic is unchanged. Runtime-source differences are limited to the unified version surfaces (`core/constants.js`, Firefox/Chromium manifests and the visible New Tab version label); all other changes are developer tooling, tests, generated manifests/size evidence and documentation.

## Step-5A evidence

- Direct shared-runtime extension-storage API call sites: **117**.
- Operations: 24 `local.get`, 21 `local.set`, 7 `local.remove`, 30 `sync.get`, 10 `sync.getBytesInUse`, 1 `sync.set`, 1 `sync.remove`, 13 `session.get`, 9 `session.set`, 1 `session.remove`.
- Full-area reads: **27 `storage.sync.get(null)`** and **1 `storage.local.get(null)`** direct sites.
- Shared background event-listener/wake surfaces: **10**.
- Established cold-worker Sync-off startup: **7 local reads / 0 Sync reads**.
- Established cold-worker Sync-on startup: **13 local reads / 2 full Sync reads**.
- Periodic Sync-watch alarm: **8 local reads / 3 full Sync reads**.
- Firefox and Chromium generated runtimes produce identical deterministic storage counts for all three measured scenarios.
- `npm run perf:storage-background` reproduces the frozen snapshot and is local-only developer tooling. It does not execute in the extension runtime, send telemetry or persist performance measurements.

## Correctness interpretation

No production storage read is removed in Step 5A. Similar-looking full Sync reads remain separate because they can own different semantic snapshots:

- catastrophic-loss detection establishes fresh live-core evidence before normal reconciliation;
- pending durable local Sync mutations can be retried after that guard;
- delivered-core evidence repair can write before the merge snapshot is read;
- device-snapshot garbage collection performs an independent fresh pre-delete revalidation.

A later Step-5 optimization must prove exact snapshot equivalence for one concrete path rather than relying on call-count similarity.

## Structural/package evidence

- Initial live New Tab DOM: **598 elements**; **490 secondary**.
- Eager ID bindings: **186**; **151 secondary**.
- Static New Tab module closure: **23 modules / 642,591 raw source bytes**.
- Deferred module closure: **43 modules / 1,123,206 raw source bytes**.
- Parser-blocking classic startup scripts: **9 / 28,892 raw bytes**.
- Firefox runtime package: **2,419,510 raw / 706,916 deflated bytes**.
- Chromium runtime package: **2,441,153 raw / 721,432 deflated bytes**.

The tiny package/source-size movement versus 1.33.0.9 is version-string metadata only; Step-5A tooling/tests/docs are outside the browser runtime packages.

## Authoritative verification

- Step-5A permanent regression/tooling contract: **6/6 PASS**.
- Full authoritative suite: **1,210/1,210 PASS**, run contention-safely as **1,206 main tests + 4 child-process-heavy Step-0 tests**.
- Startup group: **213/213 PASS**.
- New Tab group: **438/438 PASS**.
- Sync group: **268/268 PASS**.
- Recovery group: **137/137 PASS**.
- Browser/parity/permission group: **178/178 PASS**.
- Core group: **164/164 PASS**.
- Security group: **146/146 PASS**.
- Release group: **313/313 PASS**.
- Runtime reachability: **no high-confidence unreachable shared modules, unused named imports or unreferenced private functions**.
- Generated release contract: **PASS** for Firefox and Chromium.
- Packaged release contract: **PASS** for Firefox and Chromium ZIPs.
- Storage/background census live reproduction: **PASS**, including Firefox/Chromium parity.
- Performance benchmark: **PASS**. Representative host-sensitive averages: `normalizeState(200)` 115.4 ms, `createWriteBaseline(200)` 111.2 ms, normalized Settings-clock stamping 1.62 ms, exact persisted compact baseline clone 0.68 ms. These are directional host-local controls, not universal targets.
- Critical-path census remains **598 live elements / 186 eager ID bindings / 23 static modules**.

## Browser certification boundary

Browser probe found Chromium at `/usr/bin/chromium` and Xvfb, but **no ChromeDriver**; Firefox and GeckoDriver were unavailable. Therefore **real-browser certification and browser wall-clock timing are not claimed**. This release is mechanically/correctness verified only.

## Clean-room reproduction

**PASS.** The GitHub-ready source ZIP was extracted into a fresh directory, rebuilt, rerun through the contention-safe **1,210/1,210** suite, reachability and generated/packaged release-contract checks, then repackaged. Firefox ZIP, Chrome ZIP, source ZIP and `build-manifest.json` were byte-for-byte identical to the originating tree. A final reproduction pass is repeated after sealing this PASS record so the delivered source artifact contains the completed QA record itself.

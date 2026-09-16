# MosaicSync 1.33.0.9 QA / release-candidate checklist

## Scope

Snow Leopard II Step 4C only. Preserve the historical delayed Frequently Visited Top Sites permission reconciliation while avoiding a duplicate full card/favicon/session-projection pass after a verified successful live refresh. Close Step 4 and move the roadmap to storage/background frugality.

## Red-before-green proof

`tests/optimization-13309.test.mjs` was introduced on an untouched authoritative 1.33.0.8 copy and failed **0/6 PASS (6/6 red)** before the Step-4C implementation. The same file passes **6/6** after implementation.

## Deterministic Step-4C evidence

- Healthy startup Top Sites permission observations: **2 → 2** (recovery observation preserved).
- Healthy startup full Frequently Visited passes: **2 → 1**.
- Five-visible-site candidate/image-preparation items: **10 → 5**.
- Session projections: **2 → 1**.
- Initial failed/unverified live refresh: delayed reconciliation still invokes the complete refresh path.
- Permission missing at delayed reconciliation: complete refresh/recovery path still runs.
- The verification bit is New-Tab-local and ephemeral; no extension storage, Sync, Recovery or profile payload is added.
- Permission event handlers, candidate-cache lifetime, generation checks, remote favicon resolver and background preload behavior are unchanged.

## Structural/package evidence

- Initial live DOM: **598 elements** (unchanged from 1.33.0.8).
- Secondary live elements: **490**.
- Eager ID bindings: **186**; secondary bindings: **151**.
- Static New Tab module closure: **23 modules / 642,590 raw source bytes** (+1,105 bytes versus 1.33.0.8 for the narrow proof/reconciliation helper).
- Firefox runtime package: **2,419,507 raw / 706,913 deflated bytes** (+1,105 raw / +319 deflated versus 1.33.0.8).
- Chromium runtime package: **2,441,149 raw / 721,429 deflated bytes** (+1,105 raw / +319 deflated versus 1.33.0.8).

## Authoritative verification

- Full authoritative suite: **1,204/1,204 PASS**, run contention-safely as **1,200 main tests + 4 child-process-heavy Step-0 tests**.
- Step-4C red/green regression: **0/6 PASS on untouched 1.33.0.8 → 6/6 PASS on 1.33.0.9**.
- Startup group: **207/207 PASS**.
- New Tab group: **438/438 PASS**.
- Browser/parity/permission group: **178/178 PASS**.
- Security group: **146/146 PASS**.
- Release group: **307/307 PASS**.
- Runtime reachability: **no high-confidence unreachable shared modules, unused named imports or unreferenced private functions**.
- Generated release contract: **PASS** for Firefox and Chromium.
- Performance benchmark: PASS. Representative host-sensitive averages: `normalizeState(200)` 117.5 ms, `createWriteBaseline(200)` 113.4 ms, normalized Settings-clock stamping 1.66 ms, exact persisted compact baseline clone 0.62 ms. These are directional host-local controls, not universal targets.
- Critical-path census remains **598 live elements / 186 eager ID bindings / 23 static modules**.

## Browser certification boundary

Browser probe found Chromium at `/usr/bin/chromium` and Xvfb, but **no ChromeDriver**; Firefox and GeckoDriver were unavailable. Therefore **real-browser certification and browser wall-clock timing are not claimed**. This release is mechanically/correctness verified only.

## Clean-room reproduction

**PASS.** The GitHub-ready source ZIP was extracted into a fresh directory, rebuilt, rerun through the same contention-safe **1,204/1,204** suite, reachability and generated/packaged release-contract checks, then repackaged. Firefox ZIP, Chrome ZIP, source ZIP and `build-manifest.json` were byte-for-byte identical to the originating tree. A final reproduction pass is repeated after sealing this QA record so the delivered source artifact contains the completed certification record itself.

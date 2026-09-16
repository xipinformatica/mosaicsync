# MosaicSync 1.33.0.11 QA / release-candidate checklist

## Scope

Snow Leopard II Step 5B only. Routine five-minute Sync-watch alarms avoid one second `storage.local` metadata read when the metadata already captured at alarm entry proves that 24-hour device-snapshot garbage collection is not due. When GC can be due, MosaicSync preserves the historical fresh `readLocalMeta()` immediately before the GC path. No full Sync-namespace read, durable-journal authority, Recovery selection, destructive pre-delete revalidation, schema, permission or wire format is changed.

## Red-before-green evidence

- Untouched 1.33.0.10 with the new Step-5B regression/harness: **2/4 PASS, 2/4 FAIL**.
- Failures were exactly the intended optimization gap: routine alarm still used 7 local reads, and the negative GC-due gate did not exist.
- Implemented 1.33.0.11 candidate: **4/4 PASS**.
- The regression is parallel-safe: it consumes the caller-built `dist/` tree and does not invoke `tools/build.mjs` itself.

## Deterministic I/O evidence

- Routine Sync-watch alarm, Firefox: **7 → 6 local reads**, full Sync reads **2 → 2**.
- Routine Sync-watch alarm, Chromium: **7 → 6 local reads**, full Sync reads **2 → 2**.
- GC-due control, Firefox: **8 local reads / 3 full Sync reads** before and after.
- GC-due control, Chromium: **8 local reads / 3 full Sync reads** before and after.

## Correctness audit

Adversarial review specifically checked the five-minute/24-hour timing boundary, the single explicit production writer of `lastDeviceSnapshotGcAt`, metadata writes through the persistence lock, catastrophic-loss ordering, pending-journal/reconciliation ordering, Recovery/device-snapshot cleanup freshness and Firefox/Chromium parity. Production diff versus 1.33.0.10 is restricted to the negative maintenance gate and a shared exact GC-due predicate. The GC-due path retains the fresh local metadata read and all existing full Sync/pre-delete revalidation.

Pre-release focused audit before version packaging: Startup **217/217**, Sync **272/272**, Recovery **137/137**, Browser/parity/permissions **178/178**, Core **164/164**, Security **146/146** — all PASS.

## Structural/package evidence

- Initial live New Tab DOM: **598 elements**; **490 secondary**.
- Eager ID bindings: **186**; **151 secondary**.
- Static New Tab module closure: **23 modules / 642,591 raw source bytes**.
- Deferred module closure: **43 modules / 1,123,206 raw source bytes**.
- Parser-blocking classic startup scripts: **9 / 28,892 raw bytes**.

## Final authoritative verification

- Full authoritative suite: **1,214/1,214 PASS**, run contention-safely as **1,210 main tests + 4 child-process-heavy Step-0 tests individually**.
- Startup group: **217/217 PASS**.
- New Tab group: **438/438 PASS** (434 ordinary group tests + the same 4 Step-0 tests individually).
- Sync group: **272/272 PASS**.
- Recovery group: **137/137 PASS**.
- Browser/parity/permission group: **178/178 PASS**.
- Core group: **164/164 PASS**.
- Security group: **146/146 PASS**.
- Release group: **317/317 PASS** (313 ordinary group tests + the same 4 Step-0 tests individually).
- Runtime reachability: **no high-confidence unreachable shared modules, unused named imports or unreferenced private functions**.
- Generated release contract: **PASS** for Firefox and Chromium.
- Packaged release contract: **PASS** for Firefox and Chromium ZIPs.
- Historical Step-5A coverage was evolved only to preserve its behavioral invariant across later release numbers: the frozen 1.33.0.10 census must still reproduce exactly while the current report/tracker may identify a later Step-5 release.

## Browser certification boundary

Browser probe found Chromium at `/usr/bin/chromium` and Xvfb, but **no ChromeDriver**; Firefox and GeckoDriver were unavailable. Therefore **real-browser certification and browser wall-clock timing are not claimed**.

## Clean-room reproduction

**PASS.** The final GitHub-ready source ZIP was extracted into a fresh directory, rebuilt, rerun through the contention-safe **1,214/1,214** suite, reachability and generated/packaged release-contract checks, then repackaged. Firefox ZIP, Chrome ZIP, source ZIP and `build-manifest.json` reproduced byte-for-byte.

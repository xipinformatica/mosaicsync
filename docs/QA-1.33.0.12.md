# MosaicSync 1.33.0.12 QA / release-candidate checklist

## Scope

Snow Leopard II Step 5C only. Healthy background reconciliation reuses a durable Sync-continuity snapshot already read in the same serialized background queue turn. Startup may carry the snapshot returned by startup Recovery deferral into the immediately following reconciliation. No continuity write, full Sync read, pending-journal read, destructive-cleanup freshness read, schema, permission or wire format is removed.

## Red-before-green evidence

- Untouched 1.33.0.11 with the four Step-5C optimization assertions: **0/4 PASS, 4/4 FAIL**.
- Implemented candidate: **4/4 PASS**.
- Final Step-5C regression adds a durable single-writer ownership guard: **5/5 PASS**.

## Deterministic I/O evidence

- Routine alarm: **6 → 5 local reads**, **2 → 2 local writes**, **2 → 2 full Sync reads**.
- GC-due alarm: **8 → 7 local reads**, **3 → 3 local writes**, **3 → 3 full Sync reads**.
- Established Sync-on startup: **13 → 11 local reads**, **3 → 3 local writes**, **2 → 2 full Sync reads**.
- Firefox and Chromium generated runtimes match.

## Correctness audit

Adversarial review verifies that `LOCAL_SYNC_CONTINUITY_KEY` has no production owner outside `background-core.js`; stateful reconciliation callers remain serialized through `enqueue()`; continuity writes still happen on every healthy transition; loss/reset/recovery branches preserve their persisted transitions; pending journals and destructive cleanup keep their independent freshness checks. Historical `.10`, `.11` and catastrophic-loss source-shape regressions were evolved only where they had frozen implementation shape instead of the original safety invariant.

Pre-release focused audit before formal packaging: Startup **221/221 PASS** before the final single-writer assertion was added; Sync **276/276 PASS** after stale source-shape correction; Recovery **141/141 PASS**; Browser/parity/permissions **178/178 PASS**; Core **164/164 PASS**; Security **146/146 PASS**. These groups are rerun in final certification below.

## Final authoritative verification

- Step-5C permanent regression / ownership contract: **5/5 PASS**.
- Full authoritative suite: **1,219/1,219 PASS**, run deterministically in sequential test-file batches with the four child-process-heavy Step-0 tests isolated.
- Startup group: **222/222 PASS**.
- New Tab group: **438/438 PASS**.
- Sync group: **277/277 PASS**.
- Recovery group: **142/142 PASS**.
- Browser/parity/permission group: **178/178 PASS**.
- Core group: **164/164 PASS**.
- Security group: **146/146 PASS**.
- Release group: **322/322 PASS**.
- Runtime reachability: **no high-confidence unreachable shared modules, unused named imports or unreferenced private functions**.
- Generated release contract: **PASS** for Firefox and Chromium.
- Packaged release contract: **PASS** for Firefox and Chromium ZIPs.
- Runtime package census: Firefox **2,421,224 raw / 707,483 deflated payload bytes**; Chromium **2,442,867 raw / 721,999 deflated payload bytes**.
- Performance benchmark emitted the complete host-local metric set. Representative averages: `normalizeState(200)` 126.2 ms, `createWriteBaseline(200)` 126.1 ms, normalized `flattenState` fast path 1.06 ms, normalized Settings-record fast path 0.011 ms. The command wrapper remained alive after output in this environment, so these values are treated as host-local benchmark evidence rather than browser certification.


## Browser certification boundary

Browser probe found Chromium at `/usr/bin/chromium` and Xvfb, but **no ChromeDriver**; Firefox and GeckoDriver were unavailable. Therefore **real-browser certification and browser wall-clock timing are not claimed**. This release is mechanically/correctness verified only.

## Clean-room reproduction

**PASS.** A sealed GitHub-ready source ZIP was extracted into a fresh directory, rebuilt, rerun through the deterministic **1,219/1,219** suite, checked for reachability and generated/packaged release contracts, then repackaged. Firefox ZIP, Chrome ZIP, source ZIP and `build-manifest.json` reproduced byte-for-byte. A final reproduction pass is repeated after sealing this PASS record so the delivered source artifact itself contains the completed QA record.

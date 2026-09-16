# MosaicSync 1.32.0.1 QA / release-candidate checklist

## Scope

Start the **3rd Maintainability Journey — Ownership & Auditability** from authoritative MosaicSync 1.31.5. Step 2 is a mechanical pure/stateless ownership extraction only: move remote Sync observation/applied-state bookkeeping out of `background-core.js` without changing when reconciliation, publication, Recovery, storage or scheduling occurs.

## Ownership boundary

`src/shared/background/sync-remote-observation.js` owns only:

- live Sync dataset revision interpretation;
- remote-core usability checks used by Sync observation/status policy;
- observed remote receipt/provenance metadata updates;
- applied Personal/Work/device revision markers;
- latest Personal/Work origin selection for Sync status.

`background-core.js` remains the effectful orchestrator and still owns browser storage, Sync reads/writes, reconciliation, Recovery, durable journals, alarms, mutation queues, diagnostics and lifecycle decisions.

## Required invariants

- the extracted helper behavior remains identical to 1.31.5;
- shared collaborative ledgers remain non-exact provenance while atomic device/profile sources may carry exact provenance;
- a same-revision provenance correction must not manufacture a new receipt timestamp;
- exact self-origin observations remain no-ops;
- Personal remains the origin on equal Personal/Work timestamps; Work wins only when strictly newer;
- the new module introduces no browser/storage access, publication, Recovery, scheduling, timers, async/await or Promise layer;
- no additional storage read/write, Sync write, first-paint await, New Tab module, network operation or serialization is introduced;
- permissions, CSP, persisted schemas, Sync/Recovery wire formats, durable-journal semantics and browser floors remain unchanged.

## Candidate gates

- authoritative 1.31.5 source base: **PASS — SHA-256 matched `d79239b54e3b2e95d5b18e434d41d600108dda6fcb2c607de5aff77db86e5b59`**
- untouched 1.31.5 baseline full regression suite: **PASS — 1024/1024**
- focused 1.32.0.1 ownership/behavior regressions proven red on untouched 1.31.5: **PASS — 8/8 failed as required**
- focused 1.32.0.1 regressions after extraction: **PASS — 8/8**
- historical 1.30.18.42 Sync/Recovery corrective probes after ownership move: **PASS**
- full regression suite: **PASS — 1032/1032, 0 failed, 0 skipped**
- Sync targeted group: **PASS — 190/190**
- runtime reachability: **PASS — zero high-confidence unreachable shared modules, unused named imports or unreferenced private functions**
- performance benchmark: **PASS — diagnostic benchmark completed successfully; the extracted owner adds no storage/network/serialization/scheduling work and does not touch New Tab first paint. The existing benchmark does not directly time background ESM module loading, so no stronger claim is made.**
- package-size contract: **PASS — one additional shared background module; +1,059 deflated bytes per browser versus 1.31.5 (about +0.16% total payload), with New Tab assets unchanged**
- deterministic three-ZIP packaging: **PASS**
- clean-source mechanical certification/reproduction: **PASS — clean source ZIP rebuilt/retested/repackaged and reproduced Firefox/Chrome/source ZIPs plus build manifest byte-for-byte**
- real Firefox + Chromium smoke: **UNAVAILABLE IN THIS ENVIRONMENT — Chromium/Xvfb present but no chromedriver; Firefox/geckodriver absent**

## Final scope verdict

**PASS — MECHANICAL_ONLY.** All supported non-browser release gates and deterministic clean-source reproduction passed. Real-browser smoke is not claimed because the required browser/driver pairs are unavailable. The production diff is a single ownership extraction plus release identity/documentation; no behavioral improvement is combined with the extraction.

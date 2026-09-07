# MosaicSync 1.31.5 QA / release-candidate checklist

## Scope

Build a narrow Sync-reliability correction from the authoritative MosaicSync 1.31.4 source. Durable pending cross-Space and local-mutation journals must fail closed when `storage.local` is unreadable, and Sync authority-changing cleanup must not proceed if those durable journals cannot be cleared successfully.

## Required invariants

- a failed durable cross-Space journal read is never treated as “no pending transaction”; 
- a failed durable local-mutation journal read is never treated as `null` / permission to bypass the cumulative journal;
- no second Sync publication begins while earlier durable journal state is unreadable;
- Sync disable/reset-style authority transitions stop before changing authority when pending-journal cleanup fails;
- once storage recovers, the same transition may be retried and the journal is cleared normally;
- existing journal schemas, destination-first cross-Space publication, Recovery architecture, permissions, CSP, persisted profile schema and browser floors remain unchanged.

## Candidate gates

- authoritative 1.31.4 source base: **PASS**
- focused 1.31.5 regressions proven red on untouched 1.31.4 production behavior: **PASS — 3/3 failed as required**
- focused 1.31.5 regressions after fix: **PASS — 3/3**
- full regression suite: **PASS — 1024/1024, 0 failed, 0 skipped**
- Sync targeted group: **PASS — 182/182**
- runtime reachability: **PASS — zero high-confidence unreachable shared modules, unused named imports or unreferenced private functions**
- performance benchmark: **PASS — diagnostic benchmark completed successfully; no production performance path changed in 1.31.5**
- package-size contract: **PASS — reviewed existing ceilings remain sufficient; runtime growth is confined to the background hardening/comments**
- deterministic three-ZIP packaging: **PASS**
- clean-source mechanical certification: **PASS — clean source ZIP rebuilt/retested at 1024/1024 and reproduced Firefox/Chrome/source ZIPs plus build manifest byte-for-byte**
- real Firefox + Chromium smoke: **UNAVAILABLE IN THIS ENVIRONMENT — Chromium/Xvfb present but no chromedriver; Firefox/geckodriver absent**

## Final scope verdict

**PASS — MECHANICAL_ONLY.** All supported non-browser release gates and deterministic clean-source reproduction passed. Real-browser smoke is not claimed because the required browser/driver pairs are unavailable in this environment.

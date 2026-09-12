# MosaicSync 1.33.0.19 QA / release-candidate checklist

Status: **PASS** — final-source clean-room certification required before handoff.

## Scope

Narrow post-Snow-Leopard-II correctness corrective over the frozen 1.33.0.18 endpoint. Performance scope remains closed.

Production corrections are limited to:

- distributed-safe whole-device Recovery cleanup with a post-plan verified current-device survivor generation before destructive revalidation;
- conservative unchanged-state Recovery self-heal only after a complete verified remote descriptor;
- Add/Edit Shortcut same-session rapid-open reentrancy protection before editor-state mutation;
- stale non-quota Sync error lifecycle repair after a successful authoritative `already-applied` reconciliation while preserving explicit quota errors.

No speculative fix was added for the historical Firefox `null has no properties` exception because the throwing path was not reproducible. The live 1.33.0.18 diagnostic request returned `{ ok: true, skipped: true, reason: "already-applied" }`, proving the visible banner could be stale.

## Red-before-green

Against untouched 1.33.0.18, the dedicated 1.33.0.19 corrective gate was **2/10 PASS, 8/10 FAIL**.

The red failures covered both browser-shaped runtimes where applicable and proved the intended corrective scope was real:

- opposite whole-device Recovery cleanup could compose to zero Recovery generations;
- a missing own Recovery generation was not repaired by an unchanged healthy reconcile;
- healthy `already-applied` reconciliation retained stale non-quota `syncStatus:error` / `lastSyncError`;
- rapid concurrent Shortcut Editor opens could reach native `showModal()` twice;
- required post-plan Recovery survivor ordering was absent.

With 1.33.0.19 the same corrective gate is **10/10 PASS**.

## Recovery corrective safety

Whole-device cleanup now freezes the target roots from the original plan, publishes and verifies a new complete Recovery generation for the acting device, then performs the existing fresh Sync re-read/revalidation and deletes only still-eligible roots from the frozen target set.

The acting-device survivor is created **after** the target set is frozen, so two 1.33.0.19 devices performing opposite retirements cannot include each other's newly-created survivor generation in their delete plans.

The older local safety rule remains intact: if all complete Recovery generations for the acting device disappear before final revalidation, destructive cleanup is cancelled and the target device remains preserved.

Recovery self-heal is deliberately conservative: an unchanged healthy reconcile republishes a missing current-device Recovery generation only after a **complete verified remote descriptor** exists. It does not run during torn/partial/catastrophic-loss delivery.

## Sync-status corrective safety

A successful authoritative `already-applied` reconciliation clears stale non-quota background exception state so Settings cannot continue to show an old `Sync needs attention` banner after Sync is proven healthy.

Explicit quota/capacity errors remain sticky and are not cleared by this path.

## Focused verification

- Startup: **255/255 PASS**
- New Tab: **471/471 PASS**
- Sync: **287/287 PASS**
- Recovery: **162/162 PASS**
- Browser/parity/permissions: **188/188 PASS**
- Core: **164/164 PASS**
- Security: **146/146 PASS**
- Release: **359/359 PASS** (351 ordinary release assertions plus 8 isolated Snow Leopard II instrumentation assertions)

## Authoritative full suite

- ordinary tests: **1,248/1,248 PASS**
- Snow Leopard II instrumentation: **8/8 PASS**
- total: **1,256/1,256 PASS**

The +10 total over 1.33.0.18 is entirely attributable to the 1.33.0.19 corrective regression coverage.

## Structural / background gates

- reachability: **0 unreachable shared modules / 0 unused named imports / 0 unreferenced private functions**
- Step-5 routine Sync-watch storage census: unchanged from 1.33.0.18
- generated Firefox tree contract: **PASS**
- generated Chromium tree contract: **PASS**
- packaged Firefox ZIP contract: **PASS**
- packaged Chrome ZIP contract: **PASS**

The Recovery survivor/self-heal work is exceptional correctness behavior, not added routine polling/background work.

## Browser environment

- Chromium: `/usr/bin/chromium`
- Xvfb: `/usr/bin/Xvfb`
- ChromeDriver: unavailable
- Firefox: unavailable
- GeckoDriver: unavailable

Certification remains **MECHANICAL_ONLY** for real-browser timing/heap behavior. No exact browser-millisecond or heap-convergence claim is made.

## Candidate clean-room reproducibility

Before this QA/evidence seal, the candidate GitHub-ready source ZIP was extracted fresh and independently rebuilt:

- candidate clean-room build: **PASS**
- candidate clean-room tests: **1,256/1,256 PASS**
- candidate reachability: **0/0/0**
- candidate packaged Firefox contract: **PASS**
- candidate packaged Chrome contract: **PASS**
- candidate Firefox/Chrome/source/build-manifest byte-for-byte reproduction: **PASS**

The final handoff repeats the same proof after this QA/evidence seal. No source or documentation file is edited after that final-source proof.

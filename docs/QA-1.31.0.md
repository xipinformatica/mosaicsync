# MosaicSync 1.31.0 QA / release-candidate checklist

## Scope

Build a no-new-features quality release from certified 1.30.18.46. Correct only the reproduced reset-interruption, coherent Restore-source, remote-image input-bound, generated editor-preview coverage and atomic-packaging findings. Keep permissions, CSP, browser adapter topology, persisted schemas and Sync/Recovery wire formats unchanged.

## Negative proof

- Untouched 1.30.18.46: **9/10 failed** on the new focused 1.31.0 checks. Both generated browsers reproduced the reset and Restore findings; the pure source policy, bounded stream reader, atomic package commit and source wiring were absent. The editor-preview behavioral check passed because runtime behavior was already correct and only its test coverage was weak.
- 1.31.0 candidate: **10/10 pass** after the scoped corrections.

## Required safety behavior

- interrupted quota-full reset never exposes an empty namespace without valid reset-intent;
- reset-intent is verified before old keys are retired and the initiator remains uninitialized after any remote mutation failure;
- atomic Restore wins only under same-publisher, both-Space numeric dominance;
- remote-image streams stop beyond 1 MB and all remote-image fetches have a 12-second abort boundary;
- package interruption preserves the previous final-named ZIP;
- generated Firefox and Chromium execute the real editor Fit → Fill → Fit transition.

## Candidate gates

- focused 1.31.0 regressions: **10/10 PASS**
- full regression suite: **1005/1005 PASS**
- runtime reachability: **PASS** — no high-confidence unreachable shared module, unused named import or unreferenced private function
- performance benchmark: **PASS**
- package-size contract: **PASS** — Firefox 2,218,885 raw / 653,310 deflated bytes; Chromium 2,240,525 raw / 667,825 deflated bytes
- deterministic three-ZIP packaging: **PASS**
- clean-source mechanical certification: **PASS — MECHANICAL_ONLY**, including clean extraction, rebuild, retest, repackage and byte comparison
- real Firefox + Chromium smoke: **NOT EXECUTED** — this build environment contains no browser, driver or Xvfb binary; publication still requires that external gate

# MosaicSync 1.31.1 QA / release-candidate checklist

## Scope

Build a narrow no-new-features corrective release from authoritative 1.31.0 source SHA-256 `43dea298e85e7304aed94d8c30e4e2c7264b7e002c258e50b019f70f36042e23`. Correct only the four findings reproduced by the independent 1.31.0 audit: reset/bootstrap authority, Restore tombstone equivalence, reset-staging/Recovery live-core classification, and abandoned remote-image cancellation.

## Negative proof

- Untouched 1.31.0: **0/9 passed** on the new focused 1.31.1 regressions; all nine tests failed as required across generated Firefox/Chromium and direct policy/resource checks.
- 1.31.1 candidate: **9/9 pass** after the scoped production corrections.
- Existing 1.31.0 focused regressions: **10/10 pass** unchanged after the corrections.
- Targeted Sync group: **165/165 pass** after the corrections.

## Required safety behavior

- valid reset-intent outranks complete pre-reset data before bootstrap even when the local device is uninitialized;
- Restore cannot treat atomic/live sources as interchangeable when a still-authoritative live deletion tombstone would be lost;
- quota staging preserves at least one key recognized by the existing live-core Recovery predicate until reset-intent is durable, or fails before destructive staging;
- declared-oversize image bodies are cancelled immediately and terminal remote-image failures abort the owning request;
- 1.31.0 reset, source-ordering, stream-bounding, preview and atomic-packaging protections remain intact.

## Candidate gates

- focused 1.31.1 regressions: **9/9 PASS**
- prior focused 1.31.0 regressions: **10/10 PASS**
- targeted Sync group: **165/165 PASS**
- full regression suite: **1,014/1,014 PASS**
- runtime reachability: **PASS** — zero high-confidence unreachable shared modules, unused named imports, or unreferenced private functions
- performance benchmark: **PASS**
- package-size contract: **PASS** — Firefox 2,222,653 raw / 654,263 deflated bytes; Chrome 2,244,293 raw / 668,779 deflated bytes
- deterministic three-ZIP packaging: **PASS** — Firefox, Chrome and GitHub-ready source ZIPs produced and contract-validated
- clean-source mechanical certification: **PASS** — final source ZIP extracted into a separate tree, rebuilt, retested at 1,014/1,014, revalidated, repackaged, and reproduced all release/build hashes byte-for-byte
- real Firefox + Chromium smoke: **NOT EXECUTED** — Firefox/geckodriver are absent; Chromium and Xvfb are present but chromedriver is absent. Release status is therefore **MECHANICAL_ONLY**, not FULL browser certification.

## Final mechanical evidence

The canonical certification wrapper was not used as the final evidence carrier because the sandbox terminated the long-running wrapper after its full tests, reachability and benchmark stages. The exact remaining release stages were executed individually, followed by an independent clean-source rebuild/retest/repackage and byte-for-byte comparison. No MosaicSync gate failed.

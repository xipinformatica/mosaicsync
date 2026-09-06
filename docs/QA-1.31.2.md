# MosaicSync 1.31.2 QA / release-candidate checklist

## Scope

Build a documentation-only developer-handoff release from authoritative MosaicSync 1.31.1 source SHA-256 `2ae77bcf374e760c235b5b72a8a1cfd7787a46d34b41c3c57f77d21850d4fa5d`. Add the canonical root-level `DEVELOPER-GUIDE.md`, link it prominently from `README.md`, and bump release identity to 1.31.2. Do not change production behavior.

## Required invariants

- `DEVELOPER-GUIDE.md` is present in the GitHub-ready source package and linked prominently from `README.md`;
- Firefox and Chrome runtime packages do not contain the Developer Guide or development test/documentation tree;
- production source diff from 1.31.1 is limited to the four required release/version identity surfaces: Firefox manifest version, Chrome manifest/version_name, shared `VERSION`, and the Settings version label;
- all 1.31.1 Sync/Reset/Restore/Recovery/image corrections remain unchanged;
- no permission, host-permission, CSP, schema, Sync/Recovery wire-format, browser-floor or adapter behavior changes.

## Candidate gates

- authoritative 1.31.1 source SHA-256: **MATCH** — `2ae77bcf374e760c235b5b72a8a1cfd7787a46d34b41c3c57f77d21850d4fa5d`
- production-source differential audit: **PASS** — only `1.31.1` -> `1.31.2` identity strings differ under `src/`
- Developer Guide source/package contract: **PASS** — exact root guide is present in the source ZIP and absent from both browser ZIPs
- README onboarding link regression: **PASS** — release-identity test requires the prominent Developer Guide link and guide heading/ownership rule
- full regression suite: **1,014/1,014 PASS**
- runtime reachability: **PASS** — zero high-confidence unreachable shared modules, unused named imports, or unreferenced private functions
- performance benchmark: **PASS**
- package-size contract: **PASS** — Firefox 2,222,653 raw / 654,263 deflated bytes; Chrome 2,244,293 raw / 668,778 deflated bytes
- deterministic three-ZIP packaging: **PASS** — Firefox, Chrome and GitHub-ready source ZIPs produced
- clean-source mechanical certification: **PASS** — final source ZIP extracted to a separate tree, rebuilt, retested at 1,014/1,014, revalidated and repackaged; final Firefox, Chrome, source ZIP and build-manifest hashes reproduced byte-for-byte
- real Firefox + Chromium smoke: **NOT EXECUTED** — Firefox/geckodriver are absent; Chromium and Xvfb are present but chromedriver is absent. Release status is therefore **MECHANICAL_ONLY**, not FULL browser certification.

## Final scope verdict

1.31.2 is documentation-only in behavior. The installed extension differs from 1.31.1 only by the required release/version identity strings. No production logic was modified.

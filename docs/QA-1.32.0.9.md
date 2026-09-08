# MosaicSync 1.32.0.9 QA / release-candidate checklist

## Scope

Single-purpose corrective release from 1.32.0.8. Fix only the demonstrated stale-cached-meta cross-Space intent gap. No maintainability extraction or feature work.

## Permanent 1.32.0.9 regression

- `tests/corrective-13209.test.mjs`
- Baseline proof: source-contract regression fails on untouched 1.32.0.8 because both cross-Space call sites gate semantic intent on cached Sync authority.
- Candidate proof: drag/editor intent construction is cache-independent; Firefox- and Chromium-shaped generated storage runtimes preserve separate dedicated journals for opposite-direction moves under active durable Sync.

## Intended production delta

- Cross-Space drag always constructs semantic move intent.
- Shortcut-editor Space moves always construct semantic move intent.
- `persistNormalizedState` remains the sole owner of fresh durable Sync-authority gating under the existing persistence write lock.
- Durable Sync OFF continues to discard a stale caller's intent and cannot resurrect pending authority.
- Dedicated cross-Space and cumulative mutation journals remain distinct.
- No background-core, Recovery, schema, permission or first-paint change.

## Performance / architecture contract

- No New Tab first-paint/startup change.
- No additional storage operation: durable metadata already rides the existing persistence transaction read whenever a cross-Space intent is supplied.
- No extra Sync write in the normal path.
- No new module or dependency.

## Final certification

- Full regression suite: **1084 / 1084 passing**.
- Startup group: **168 / 168 passing**.
- New Tab group: **333 / 333 passing**.
- Sync group: **228 / 228 passing**.
- Recovery group: **119 / 119 passing**.
- Security group: **113 / 113 passing**.
- Browser/parity group: **178 / 178 passing**.
- Core group: **115 / 115 passing**.
- Release group: **203 / 203 passing**.
- `tests/corrective-13209.test.mjs`: **3 / 3 passing** after correction; the source-contract case is proven red on untouched 1.32.0.8.
- Adversarial concurrency/corrective cluster (`13204` + `13206` + `13207` + `13208` + `13209`): **29 / 29 passing across 10 consecutive runs**.
- Runtime reachability: clean — zero unreachable shared modules, zero unused named imports, zero unreferenced private functions.
- Performance benchmark: pass.
- Runtime size: Firefox **2,248,166 raw / 661,902 deflated bytes**; Chrome **2,269,808 raw / 676,418 deflated bytes**. Versus 1.32.0.8 this is **+307 raw / +158 deflated bytes per browser**, isolated to New Tab comments/intent construction and release identity.
- Browser probe: Chromium and Xvfb available; ChromeDriver unavailable; Firefox and GeckoDriver unavailable. Certification therefore remains **MECHANICAL_ONLY**; no real-browser smoke is claimed.
- Clean-source rebuild/retest/repackage: **pass**; final Firefox, Chrome, source ZIP and build manifest reproduce byte-for-byte from the GitHub-ready source ZIP.


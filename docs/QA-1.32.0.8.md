# MosaicSync 1.32.0.8 QA / release-candidate checklist

## Scope

Single-purpose corrective release from 1.32.0.7. Fix only the demonstrated Welcome/setup source-candidate authority race. No maintainability extraction or feature work.

## Permanent 1.32.0.8 regression

- `tests/corrective-13208.test.mjs`
- Baseline proof: **0/3** on untouched 1.32.0.7.
- Candidate proof: all three tests pass after correction.
- Covers Start empty, current-browser shortcut import, MosaicSync profile import, conflict ordering, local commit ordering, synchronized-copy discard, and staging of imported device-local preferences.

## Intended production delta

- Local Welcome starting-source candidates remain memory-only until source resolution.
- Sync-off/no-remote paths commit immediately before completion/local bootstrap.
- Conflict presentation does not write `LOCAL_STATE_KEY`.
- “Use this computer” commits the staged candidate before `bootstrap-local`.
- “Use synchronized copy” does not commit the candidate and discards it after the remote action succeeds.
- Imported UI locale/Frequently Visited device preference remains provisional with a profile candidate.
- No background-core, pending-journal, Recovery, schema or permission change.

## Performance / architecture contract

- No New Tab first-paint/startup change.
- No extra browser-storage operation on normal New Tab or Sync paths.
- Setup now performs fewer authoritative writes while a source conflict is unresolved.
- No new module or dependency.

## Final certification

- Full regression suite: **1081 / 1081 passing**.
- Startup group: **168 / 168 passing**.
- New Tab group: **330 / 330 passing**.
- Sync group: **225 / 225 passing**.
- Recovery group: **119 / 119 passing**.
- Security group: **113 / 113 passing**.
- Browser/parity group: **178 / 178 passing**.
- Core group: **115 / 115 passing**.
- Release group: **200 / 200 passing**.
- `tests/corrective-13208.test.mjs`: **3 / 3 passing**, proven **0 / 3** on untouched 1.32.0.7.
- Adversarial concurrency/corrective cluster (`13204` + `13206` + `13207` + `13208`): **26 / 26 passing across 10 consecutive runs**.
- Runtime reachability: clean — zero unreachable shared modules, zero unused named imports, zero unreferenced private functions.
- Performance benchmark: pass.
- Runtime size: Firefox **2,247,859 raw / 661,744 deflated bytes**; Chrome **2,269,501 raw / 676,260 deflated bytes**. Versus 1.32.0.7 this is **+1,353 raw / +353 deflated bytes per browser**, isolated to Welcome source-candidate safety logic and release identity.
- Browser probe: Chromium and Xvfb available; ChromeDriver unavailable; Firefox and GeckoDriver unavailable. Certification therefore remains **MECHANICAL_ONLY**; no real-browser smoke is claimed.
- Clean-source rebuild/retest/repackage: **pass**. Final Firefox, Chrome, source ZIP and build manifest reproduce byte-for-byte from the GitHub-ready source ZIP.

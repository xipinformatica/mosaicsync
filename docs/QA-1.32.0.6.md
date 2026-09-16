# MosaicSync 1.32.0.6 QA / release-candidate checklist

## Scope

Narrow corrective release from 1.32.0.5. Fix only the two Normal Sync bootstrap concurrency defects found by the Journey-3 Step-7 freeze audit. No new maintainability extraction and no feature work.

## Permanent 1.32.0.6 regressions

- `tests/corrective-13206.test.mjs`
- Baseline proof: **13 / 13 fail on untouched 1.32.0.5**.
- Candidate proof: **13 / 13 pass after correction**.
- Generated Firefox and Chromium runtime coverage includes:
  - authoritative local bootstrap preserving a newer pending journal;
  - remote bootstrap preserving a journal created after its entry baseline;
  - automatic await-remote bootstrap preserving a concurrent local edit;
  - explicit Restore preserving a concurrent local edit and its durable journal.
  - local snapshot/journal read-gap preservation so a journal created after snapshot capture is never mis-acknowledged;
  - first-Sync authority-handoff preservation so an edit committed after the bootstrap state write but before initialized durable Sync authority is swept into publication.

## Intended production delta

- `bootstrapRemote()` persists its merged local state with `baseState: fullLocalState` so the existing shared persistence transaction can rebase a New Tab edit committed during long-running Sync reads.
- The bootstrap continues with the state that was actually committed after any rebase.
- `bootstrapLocal()` and `bootstrapRemote()` capture only the pending local-mutation journal generation present at entry and acknowledge only that exact `journalId` after successful completion.
- A newer replacement journal survives bootstrap completion.
- 1.31.5 fail-closed pending-journal read/clear semantics and 1.32.0.4 shared-lock acknowledgement protection remain unchanged.

## Performance / architecture contract

- No first-paint, New Tab startup, image, DOM or network path change.
- No additional Sync write is introduced in the ordinary path.
- The correction adds a durable-journal read only to explicit/initial bootstrap flows where generation identity is required for safe acknowledgement.
- No new module, dependency direction, persisted schema, Sync/Recovery format, permission or browser-floor change.

## Final certification

- Full regression suite: **1075 / 1075 passing**.
- Startup group: **168 / 168 passing**.
- New Tab group: **327 / 327 passing**.
- Sync group: **219 / 219 passing**.
- Recovery group: **119 / 119 passing**.
- Security group: **113 / 113 passing**.
- Browser/parity group: **178 / 178 passing**.
- Core group: **115 / 115 passing**.
- Release group: **194 / 194 passing**.
- `tests/corrective-13206.test.mjs`: **13 / 13 passing across 10 consecutive repeat runs**.
- Runtime reachability: clean — zero unreachable shared modules, zero unused named imports, zero unreferenced private functions.
- Static shared-module dependency graph: **0 cycles**.
- Performance benchmark: pass; correction is outside New Tab/first-paint startup and adds no ordinary Sync write.
- Runtime size: Firefox **2,246,692 raw / 661,394 deflated bytes**; Chrome **2,268,334 raw / 675,910 deflated bytes** — **+2,488 raw / +673 deflated bytes per browser** versus 1.32.0.5.
- Generated and packaged release contracts: pass.
- Independent clean-source rebuild/retest/repackage: **1075 / 1075 passing** and byte-for-byte reproduction of Firefox ZIP, Chrome ZIP, GitHub-ready source ZIP and `build-manifest.json`.
- Browser probe: Chromium and Xvfb available; ChromeDriver unavailable; Firefox and GeckoDriver unavailable. Certification is therefore **MECHANICAL_ONLY** and no real-browser smoke is claimed.

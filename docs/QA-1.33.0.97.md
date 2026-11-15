# MosaicSync 1.33.0.97 QA / release-candidate checklist

Baseline: published 1.33.0.96 GitHub-ready source, SHA-256 `38fcd806417e4892e167c80ff549cc4e3859fca3da8e317291aa35515130c416`.

Scope: bounded clock authority for Sync conflict ordering, plus timestamp-based Recovery source selection; no Sync wire format or Recovery storage format changes. 

- [ ] Build, test inventory and full automated suite pass.
- [ ] Poisoned record/dataset/settings/spaceMoveAt at `Number.MAX_SAFE_INTEGER` and Date ceiling no longer wins over healthy clocks.
- [ ] A real in-window +400-day clock still wins over an earlier clock and can advance.
- [ ] Poisoned deletion still protects ordinary stale edits, while a newer valid namespace move can revive.
- [ ] Backup import retains independent +366-day file clock filter.
- [ ] A poisoned dataset revision cannot force an old atomic Recovery generation over live.
- [ ] Browser packages validated and reproducibly sealed.
- [ ] Signed-in multi-device Sync still UNVERIFIED; check rolling upgrades from 1.33.0.96.

The accepted-clock boundary at exactly `now + 402 days` can briefly require a provisional, not-yet-trusted successor. Local journaled changes remain in `waiting` until that strictly newer timestamp becomes acceptable; they must never be reported as published or have their journal cleared early. The production journal path is guarded and covered by a focused regression; complete signed-in device testing remains outstanding.

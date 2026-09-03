# MosaicSync 1.30.18.42 QA / release-candidate checklist

## Scope

Correct only the Sync failure classes demonstrated during the Firefox/CachyOS ↔ Windows investigation:

1. exact own-write suppression must survive large forward/backward wall-clock changes without hiding mismatched remote values;
2. a burst of Sync storage events must coalesce instead of building an unbounded reconciliation backlog or flashing the Settings Sync state;
3. immutable device/profile snapshots must remain atomic Recovery generations—Personal and Work from one selected generation, never a record union across devices;
4. initialized-device automatic Sync must use coherent shared ledgers and preserve local state while a live Personal or Work ledger is torn;
5. Restore/bootstrap must choose one coherent complete profile source;
6. collaborative live ledgers must not be presented as if one named device supplied the whole resulting layout;
7. catastrophic-loss confirmation must judge the live shared core and must not be masked/cancelled by stale Recovery-only keys.

No new feature, permission, CSP, browser API grant, localization-catalog change or Sync/Recovery wire-schema version change is authorized.

## Reproduced evidence behind the correction

- Complete CachyOS device generations were visible on Windows with both manifests and all chunks, proving Firefox transport worked end-to-end.
- A roughly two-hour Windows clock correction was followed by repeated `storage-event -> reconciled` cycles and `ready -> syncing -> ready` UI transitions; Recovery continuity remained healthy and no pending mutation journal existed.
- Restart cleared the runtime storm.
- The 1.30.18.41 source merged complete device/profile snapshots record-by-record across devices and then could label the synthetic result with the newest publisher device, permitting a layout/provenance combination that never existed as one coherent device copy.

## Candidate gates

- untouched 1.30.18.41 negative proof: **CONFIRMED** — the frozen baseline retains wall-clock expiry in own-write suppression and record-unions complete Recovery generations across devices
- focused Sync regression group: **141/141 PASS** before release-identity bump
- full pre-version corrective suite: **984/984 PASS**
- final full regression suite: **984/984 PASS** after the 1.30.18.42 identity/build
- runtime reachability: **PASS** — no high-confidence unreachable shared modules, unused named imports or unreferenced private functions
- benchmark: **PASS** — no release-gating performance regression detected
- runtime size report / conscious baseline: **PASS** — Firefox 646,319 deflated payload bytes; Chrome 660,835; about +0.3% versus 1.30.18.41, concentrated in the Sync background correction
- deterministic Firefox/Chrome/GitHub-ready packaging: **PASS**
- mechanical certification / clean-source byte reproduction: **PASS** — canonical `npm run certify:mechanical` handoff gate
- real Firefox user smoke on the affected dual-boot machines: **REQUIRED BEFORE PUBLICATION**

## Upgrade note for already-contaminated live Sync state

1.30.18.42 prevents Recovery snapshots from creating new multi-device hybrids. It cannot safely infer which individual records in an already-published 1.30.18.41 live shared ledger were unintended. Cleaning pre-existing live contamination therefore requires one explicit authoritative source choice after 1.30.18.42 is present on the trusted device; the release deliberately does not auto-delete user records during migration.

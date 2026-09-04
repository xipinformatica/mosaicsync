# MosaicSync 1.30.18.43 QA / release-candidate checklist

## Scope

Correct only the explicit **Clear Sync copy** failure demonstrated when MosaicSync’s browser `storage.sync` namespace is already full:

1. the reset must succeed without needing free Sync quota;
2. the current device’s local Personal/Work profile must remain untouched;
3. the current device must be protected against interpreting its own clear as catastrophic loss;
4. after success, the only Sync item may be the existing valid reset-intent sentinel;
5. another 1.30.13+ peer observing that sentinel must wait and must not resurrect old data;
6. a later explicit **Use this device as Sync source** must replace the reset with one complete authoritative profile;
7. Settings must warn clearly, in all 33 supported UI languages, that all MosaicSync data in browser Sync is being deleted while this device’s local layout is kept.

No unrelated Sync architecture change, permission, CSP, state/profile schema or Sync/Recovery wire-format version change is authorized.

## Negative proof

- Untouched 1.30.18.42: **CONFIRMED FAIL** — a harness that rejects adding `reset-intent` while old Sync records remain causes `clearSyncData()` to fail with `QuotaExceededError` before deletion.
- 1.30.18.43: **PASS** — the same harness records one `storage.sync.clear()` call, the local profile is unchanged, local Sync is OFF/uninitialized, and the sole remaining remote item is the valid reset-intent sentinel.

## Candidate gates

- focused 1.30.18.43 + legacy intentional-reset tests: **23/23 PASS**
- full pre-version regression suite: **989/989 PASS**
- final full regression suite: **PENDING**
- runtime reachability: **PENDING**
- benchmark / runtime size report: **PENDING**
- deterministic Firefox/Chrome/GitHub-ready packaging: **PENDING**
- mechanical clean-source certification: **PENDING**
- real Firefox user smoke: **REQUIRED BEFORE PUBLICATION**

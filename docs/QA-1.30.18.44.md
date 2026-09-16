# MosaicSync 1.30.18.44 QA / release-candidate checklist

## Scope

Correct only the two reproduced follow-ups on top of certified 1.30.18.43:

1. **Clear Sync copy** must preserve the user’s enabled **Sync across Firefox** preference while remaining uninitialized/safe after the remote reset;
2. quota-full clear, local-profile preservation, reset-intent protection and no-auto-republish guarantees from 1.30.18.43 must remain intact;
3. reset warning/completion wording must match the new behavior in all 33 UI languages;
4. New Tab must explicitly own a thin Light/Dark scrollbar with a transparent track from first paint so Light-mode hover cannot expose an opaque dark platform track;
5. scrollbar styling must not alter scrolling geometry or move launcher-only presentation out of critical CSS.

No unrelated Sync architecture, permission, CSP, state/profile schema, reset-intent schema or Sync/Recovery wire-format change is authorized.

## Negative proof

- Untouched 1.30.18.43: **CONFIRMED FAIL 2/2** — the new corrective tests show `clearSyncData()` explicitly sets `syncEnabled:false`, and `newtab-critical.css` has no owned theme-aware scrollbar/transparent-track contract.
- 1.30.18.44 candidate: the same checks pass after the scoped corrections.

## Corrective behavior

- quota-full `storage.sync.clear()` path remains browser-native and does not require free Sync quota;
- local Personal/Work profile is unchanged;
- only the valid reset-intent sentinel remains remotely after successful clear;
- if Sync was enabled before clear, it remains enabled with `syncInitialized:false`, `syncBootstrapMode:"await-remote"`, `syncStatus:"waiting"`;
- foreground/background reconciliation while the reset sentinel remains does not auto-republish the preserved local profile;
- explicit local-source selection remains the operation that creates a new synchronized profile;
- all 33 runtime locale modules contain updated warning/completion semantics;
- Firefox scrollbar uses thin width + transparent track; Chromium receives equivalent WebKit pseudo-element rules; Light/Dark thumb variables are first-paint-owned.

## Candidate gates

- focused reset/localization/scrollbar regressions: **35/35 PASS**
- full pre-version regression suite: **991/991 PASS**
- final full regression suite: **991/991 PASS**
- runtime reachability: **PASS**
- benchmark / runtime size report: **PASS**
- deterministic Firefox/Chrome/GitHub-ready packaging: **PASS**
- mechanical clean-source certification: **PASS — MECHANICAL_ONLY**
- real Firefox user smoke: **REQUIRED BEFORE PUBLICATION**

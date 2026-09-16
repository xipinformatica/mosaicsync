# MosaicSync 1.24.14j QA contract

1. Firefox and Chrome technical manifest versions are `1.24.14.9`; Chrome exposes `version_name: "1.24.14j"` and Firefox must not contain `version_name`.
2. `VERSION` is `1.24.14j`. Direct upgrades from technical versions 1.24.14 through 1.24.14.4 still receive the one-time favicon-quality repair; later g/h/i upgrades do not repeat it.
3. The 1.24.14h/i architecture remains: clicked-tab and proactive favicon networking must not hold the serialized Sync/state queue, and commit-time state/URL/Space eligibility is re-read before pixels are applied.
4. If proactive network resolution succeeds but `applyProactiveFaviconResults` fails through the generic `enqueue()` contract, the corresponding durable recovery item must not be deleted as stale. It must enter the normal retry/backoff path.
5. That commit-failure path is behaviorally tested on both Firefox and Chrome using the real `enqueue()` catch-and-reshape contract.
6. Idempotent favicon results remain unchanged successes; stale URL/deletion/disabled-Space results remain terminal stale results; Chrome protected-page misses remain terminal.
7. Equal-clock Sync settings records retain the existing deterministic timestamp → deviceId → stable payload tie-break. Tests cover distinct device IDs and a missing-deviceId case. `chooseNewerRecord` itself is unchanged.
8. Corrupted duplicate shortcut IDs across Spaces are not given a new recovery policy in this release; normal UI/local-state invariants remain authoritative and no broad repair behavior is introduced solely for that speculative state.
9. Firefox/Chrome parity guards for browser-native favicon quality upgrades and protected Chrome Web Store behavior remain active.
10. No Sync schema, profile format, local-state schema, permission, CSP, favicon resolver ordering, UI string, or localization catalog changes are introduced by 1.24.14j.

# MosaicSync maintenance policy

MosaicSync's five-step application refinement program froze at 1.30.18.32. The Maintenance Infrastructure program freezes with 1.30.18.37. Stability is now an explicit project feature.

## Default rule: preserve the frozen architecture

A production architecture/refactor change requires at least one concrete trigger:

1. a demonstrated production bug;
2. a browser/platform/API compatibility requirement;
3. a security or privacy requirement;
4. a measurable maintenance problem with evidence that the proposed change reduces it;
5. a separately approved product/feature objective that genuinely needs an architectural change.

A large file, aesthetic preference, fashionable abstraction, line-count target, desire to continue refactoring, or theoretical cleanup opportunity is **not** sufficient justification.

## Required questions before changing production architecture

Before implementation, record answers to:

- What concrete problem exists today?
- Which frozen owner/boundary is affected?
- Why can the problem not be solved without changing that boundary?
- What is the smallest viable scope?
- Which positive behavior must remain unchanged?
- Which negative regression must become impossible?
- Does the change alter permissions, privacy, schemas, persisted state, browser parity, first paint, Sync or Recovery?
- What real-browser smoke is needed?

If these questions do not produce a clear benefit, do not make the refactor.

## Release confidence ladder

For production changes, confidence should be built in this order:

1. focused unit/behavioral regression;
2. generated Firefox and Chromium coverage where applicable;
3. full `npm test`;
4. runtime reachability and release contracts;
5. real Firefox + Chromium smoke when the environment supports it;
6. benchmark/size review where relevant;
7. deterministic packaging;
8. clean-source rebuild/retest/repackage and byte-for-byte comparison.

`npm run certify` is the canonical full path. `npm run certify:mechanical` is explicitly not equivalent because it omits the real-browser gate.

## Permission/privacy rule

Permissions must remain at the smallest practical level. Optional capabilities stay optional unless the product cannot function without them. Browser-history-derived Frequently Visited data and automatic/browser-derived favicon pixels remain device-local according to the frozen architecture/ADRs.

Any proposal to broaden permissions, persist browser-derived data differently, or transmit new data requires an explicit privacy review before coding.

## Dependency rule

The dependency-free maintenance toolchain is intentional. Add a package only when it materially lowers risk or total maintenance cost and there is no reasonable built-in/standard-library solution.

## Test-infrastructure rule

A test tool should exist because it catches a real class of mistake, not because more infrastructure looks sophisticated. Keep fuzzing bounded/deterministic and test groups simple. The full suite remains authoritative.

## When to delete code

Delete production code only with evidence that it is unreachable/obsolete **and** positive evidence that its former responsibility is still fulfilled. A grep result alone is not sufficient for event-driven/MV3 code.

## When to stop

Once the identified problem is solved and certification is green, stop. Do not expand scope into adjacent cleanup. A release may legitimately contain no architectural changes at all.

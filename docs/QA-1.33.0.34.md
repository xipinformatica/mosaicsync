# MosaicSync 1.33.0.34 QA / release-candidate checklist

1.33.0.34 is a narrow local-asset hydration performance refinement over 1.33.0.33. Production scope is limited to reusing exact context-verified content-addressed asset values on subsequent reads.

## Acceptance

- The first encounter with a referenced local asset still reads it from `storage.local` and performs full `validateLocalAsset()` validation.
- An asset is reusable only after this same JS context has verified its exact ID/value pair.
- Repeated hydration of unchanged asset IDs performs no asset read for those IDs.
- If one referenced asset ID changes, only that new ID is read/validated; already verified unchanged IDs hydrate from the context cache.
- Cached verified values populate the existing asset-ID memo so later normalization in the same hydration does not re-hash those image bytes.
- Existing write-path collision detection, missing/corrupt repair, write locking and stale-asset cleanup behavior remain unchanged.
- This release does not implement verified-cache pruning; that separate retention optimization remains deferred.
- No Sync/Recovery, permission, CSP, profile-schema, browser-floor, telemetry or network changes.
- `DEVELOPER-GUIDE.md` remains evergreen: no new version-labelled release-history section is added.

## Red-before-green evidence

`tests/optimization-133034.test.mjs` was added against the untouched 1.33.0.33 baseline before the production change. The behavior test failed because a state event containing one new asset still read all three referenced active-Space assets. After the read-path optimization it reads only the new ID, and an identical subsequent hydration reads none.

The final candidate must pass the full unique test inventory, all canonical groups, reachability, syntax/JSON/link checks, deterministic build/package checks and clean archive inspection before publication.

## Final mechanical evidence

- Full unique suite: 1365/1365 PASS across 194/194 test files, completed in four non-overlapping chunks (347 + 340 + 323 + 355).
- Canonical groups: Startup 285/285; New Tab 559/559; Sync 350/350; Recovery 225/225; Security 219/219; Browser/parity 281/281; Core 203/203; Release 468/468.
- The monolithic `npm test` run reached 1256 passing tests with no observed failure before the execution ceiling; it is not counted as a completed certification.
- Reachability: 0 unreachable shared modules; 0 unused named imports; 0 unreferenced private functions.
- Syntax/data/docs: 494 JS/MJS files pass `node --check`; 93 JSON files parse; 38 relative Markdown links resolve.

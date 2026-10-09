# MosaicSync 1.33.0.40 QA / release-candidate checklist

1.33.0.40 is the second Trust Boundaries & Failure Resilience step. It includes the unpublished 1.33.0.39 import-clock hardening plus a narrow local-persistence/quota resilience corrective.

## Acceptance

- A hostile imported profile cannot drive logical clocks to the safe-integer ceiling; the import still outranks the current profile and later edits remain possible.
- Local `storage.local` quota failures have a stable `STORAGE_LOCAL_QUOTA_EXCEEDED` category; other local write failures remain `STORAGE_LOCAL_WRITE_FAILED`.
- Browser/platform diagnostic text is retained only as `cause`, not surfaced directly to the user.
- A failed user save leaves the edited in-memory profile and previous durable baseline intact.
- Repeated failed saves preserve the same live intention; the next successful save persists it and only then advances the compact baseline.
- Quota and generic local-write failures are presented through localized product-owned messages in all 33 UI locales.
- No `unlimitedStorage` or other new permission is added.
- Sync protocol, Recovery format, profile schema and privacy boundaries remain unchanged.
- `DEVELOPER-GUIDE.md` records only the evergreen persistence-failure invariant.

## Red-before-green evidence

Against untouched 1.33.0.39 with only the final 1.33.0.40 regression/group registration overlaid, the final focused file is expected to be 2/8 PASS and 6/8 FAIL: the permission-scope and group-ownership controls are already green; quota classification, stable error text, live-intention retry, UI presentation and localization are red.

## Deliberate-break evidence

The focused regressions go red when each of these is broken independently:

- quota errors are collapsed back into the generic local-write category;
- generic browser error text is surfaced again;
- `saveState()` bypasses the localized persistence-error presentation boundary;
- `unlimitedStorage` is added to a browser manifest.

## Final mechanical evidence

Final sealed-candidate evidence before packaging:

- unique suite: **1414/1414 PASS across 200/200 test files**;
- canonical groups: Startup **292/292**, New Tab **600/600**, Sync **357/357**, Recovery **225/225**, Security **255/255**, Browser/parity **315/315**, Core **252/252**, Release **517/517**;
- test-group coverage: **200/200 grouped, 0 ungrouped**;
- reachability: **0 unreachable shared modules, 0 unused named imports, 0 unreferenced private functions**;
- syntax/metadata: **503 JS/MJS**, **93 JSON**, **38 relative Markdown links / 0 broken**;
- deterministic double packaging and final artifact hashes are recorded after package sealing.

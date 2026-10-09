# MosaicSync 1.33.0.39 QA / release-candidate checklist

1.33.0.39 is a narrow import trust-boundary corrective over 1.33.0.38.

## Acceptance

- A checksum-valid profile carrying near-`Number.MAX_SAFE_INTEGER` logical clocks cannot stamp the imported profile at the numeric ceiling.
- The first ordinary edit after such an import remains possible.
- Reasonable future clock skew in a legitimate exported profile may still influence the replacement stamp.
- The current authoritative profile is observed when stamping an import, including both Spaces, fine-grained Settings clocks and existing `spaceMoveAt` namespace generations.
- The imported replacement therefore outranks the profile it replaces even when current clocks are legitimately ahead of wall time.
- Imported/current namespace generations are rebased only where a namespace marker already exists; never-moved shortcuts remain at `spaceMoveAt = 0`.
- Normal New Tab profile import and Welcome/setup profile import share one model-owned stamping implementation.
- No Sync/Recovery format, persisted schema, permission, privacy or user-feature change.
- `DEVELOPER-GUIDE.md` contains only evergreen trust-boundary invariants, not release chronology.

## Red-before-green evidence

`tests/trust-boundary-133039.test.mjs` was run against untouched 1.33.0.38 with only the test/group registration overlaid: 2/7 PASS and 5/7 FAIL. The red cases reproduce the near-ceiling edit freeze, failure to outrank a current profile ahead of wall time, omission of fine-grained Settings authority, stale/hostile namespace-generation handling, and the two private UI-owned stamping implementations. The reasonable-skew control and group-ownership test were already green.

## Deliberate-break evidence

The focused regressions go red when each of these is broken independently:

- all imported clocks are trusted again instead of applying the future-skew bound;
- current-profile clocks are omitted from the replacement stamp;
- fine-grained Settings clocks are omitted;
- imported `spaceMoveAt` is left untouched instead of rebasing existing namespace generations.

## Final mechanical evidence

Final sealed-candidate certification:

- Focused trust-boundary regression: 7/7 PASS.
- Canonical groups: Startup 292/292; New Tab 592/592; Sync 357/357; Recovery 225/225; Security 247/247; Browser/parity 307/307; Core 244/244; Release 509/509.
- Complete unique inventory: 1406/1406 PASS across 199/199 test files; 0 ungrouped.
- Reachability: 0 unreachable shared modules, 0 unused named imports, 0 unreferenced private functions.
- Syntax/data/docs: 502 JS/MJS syntax checks PASS; 93 JSON files parse; 38 relative Markdown links checked with 0 broken.
- Final artifacts must be produced by two independent deterministic package runs and compare byte-for-byte before publication.

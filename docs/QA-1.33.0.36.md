# MosaicSync 1.33.0.36 QA / release-candidate checklist

1.33.0.36 is a narrow Bookmarks search-path optimization over 1.33.0.35. Production scope is limited to the Bookmarks controller; the same regression file also adds test-only hardening for the already-correct whole-profile asset-cache pruning invariant.

## Acceptance

- Searchable title/URL/path text is normalized once per loaded browser bookmark tree, not reconstructed on each input.
- HTTP(S) transport prefixes do not participate in matching, but the same normalization is applied to the query so pasted full HTTP(S) URLs remain searchable.
- Extending a non-empty query may filter the previous match set; backing up/changing the query safely falls back to the full derived index.
- Search-only input does not rebuild the unchanged folder sidebar.
- If successive non-empty queries produce the same ordered result identities, bookmark-link DOM is not recreated.
- Clearing search, folder navigation and localization refresh still perform authoritative full rendering as needed.
- No debounce/timer, result cap, progressive rendering, browser-bookmark mutation or new permission is introduced.
- Browser bookmark drag/drop semantics remain unchanged.
- Whole-profile verified-asset pruning retains assets referenced by the other Space even if the active Space alone is hydrated after an incoming state change.
- No Sync/Recovery, CSP, profile-schema, telemetry, network or browser-floor change.
- `DEVELOPER-GUIDE.md` contains only evergreen Bookmarks search ownership/performance invariants; no release-history section is added.

## Red-before-green evidence

`tests/optimization-133036.test.mjs` was added against untouched 1.33.0.35 before the F-5 production change.

The prior release passed the carried-forward other-Space cache-retention test, but failed all four F-5 regressions: it reread bookmark fields to rebuild searchable text, `:` matched every HTTPS fixture bookmark, search input rebuilt the folder sidebar, and narrowing `alpha` to `alph` recreated an identical one-result DOM.

The first F-5 candidate exposed one additional user-visible regression: pasted full HTTP(S) URLs no longer matched because the index dropped the scheme while the query retained it. A dedicated test is red on that candidate and green after applying the same scheme normalization to the query. A second hardening test proves that shortening or editing a query returns to the full index; the correct candidate already passes it, and deliberately loosening the narrowing guard makes it fail. The original four deliberate-break checks remain protected.

## Final mechanical evidence

- Full unique suite: 1378/1378 PASS across 196/196 test files, completed in disjoint runs (321 + 347 + 357 + 217 + 136).
- Canonical group totals: Startup 285; New Tab 572; Sync 350; Recovery 225; Security 219; Browser/parity 286; Core 216; Release 481. The only count increases from 1.33.0.35 are the eight tests in `optimization-133036.test.mjs`, owned by New Tab/Core/Release.
- Test-group coverage: 196/196 files belong to at least one canonical group; 0 ungrouped.
- Reachability: 0 unreachable shared modules; 0 unused named imports; 0 unreferenced private functions.
- Syntax/data/docs: 496 JS/MJS files pass `node --check`; 93 JSON files parse; 38 relative Markdown links resolve.
- Focused Bookmarks/storage compatibility run was green before release identity sealing.
- Deliberate-break checks: restoring scheme-prefix matching, restoring full sidebar render on search input, disabling same-result DOM reuse, rebuilding search text inside the filter, or incorrectly narrowing after backspace/edit each makes a dedicated regression fail.
- An old release-sequence source-shape assertion was updated to include already-published 1.33.0.35; no production behavior was involved.

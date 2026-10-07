# MosaicSync 1.33.0.36 publication notes

## AMO / Chrome Web Store changelog

Makes bookmark searching lighter by avoiding repeated text processing and unnecessary sidebar/result rebuilding while you type. Search ignores the common HTTP(S) transport prefix without breaking searches where you paste a complete bookmark URL.

## Mozilla Notes to Reviewer

1.33.0.36 is a narrow Bookmarks-reader performance refinement over 1.33.0.35.

The browser-owned bookmark tree is still loaded lazily behind the existing optional Bookmarks permission and remains outside MosaicSync profile/Sync state. The controller now derives normalized searchable text once per loaded bookmark tree instead of reconstructing title + URL + path text on every search input. The HTTP(S) transport prefix is omitted from that derived search text because it carries no distinguishing information and previously caused common characters such as `h`, `t`, `p`, `s` and `:` to match most or all bookmarks. The same prefix normalization is applied to the typed or pasted query, so complete `http://` and `https://` bookmark URLs remain searchable.

When a non-empty query extends the previous query, MosaicSync filters the previous ordered match indexes rather than rescanning the complete bookmark list. Shortening or editing the query falls back to the complete derived index. Search-only input no longer rebuilds the unchanged folder sidebar. If a narrower non-empty query produces the exact same ordered bookmark identities as the prior rendered search, the existing bookmark-link DOM is retained instead of being destroyed and recreated.

There is no debounce/timer, progressive rendering, result cap or bookmark-data mutation. Search remains synchronous and complete. Browser bookmark permission behavior, folder navigation, drag-to-shortcut conversion and localization ownership are unchanged.

This release also adds test-only hardening for the already-correct 1.33.0.35 verified-asset pruning rule: whole-profile pruning must retain an asset referenced by the other Space even when only the active Space is hydrated after an incoming state change.

No Sync, Recovery, permission, CSP, profile-schema, telemetry, network or browser-floor changes are introduced.

Permanent behavioral protection is in `tests/optimization-133036.test.mjs`. Red-before-green against 1.33.0.35 proves the old controller reconstructed search text on each input, let the HTTPS scheme make `:` match all fixture bookmarks, rebuilt the sidebar on each keystroke and recreated identical result DOM for `alpha` → `alph`. A corrective regression is red against the first 1.33.0.36 candidate because pasted full HTTP(S) URLs no longer matched; it is green after symmetric query normalization. Additional hardening proves that backspacing or editing a query rescans the full index, and a deliberate narrowing-guard break is caught.

## GitHub release title

`MosaicSync 1.33.0.36`

## GitHub release description

MosaicSync 1.33.0.36 makes the browser Bookmarks reader more efficient while searching.

- Searchable bookmark text is prepared once per loaded bookmark tree instead of rebuilt on every keystroke.
- Extending a search narrows the previous match set where possible.
- The unchanged folder sidebar is no longer rebuilt while typing.
- Identical ordered search results keep their existing bookmark DOM.
- HTTP(S) transport prefixes are normalized for matching, preventing scheme syntax from making unrelated bookmarks appear as results while preserving pasted full-URL searches.

Browser bookmarks remain browser-owned and device-local unless you explicitly drag one into MosaicSync to create a shortcut.

No new feature, permission, Sync/Recovery-format, profile-schema or privacy change is included.

## Final certification

Full unique suite: 1378/1378 PASS across 196/196 test files. Canonical group totals: Startup 285; New Tab 572; Sync 350; Recovery 225; Security 219; Browser/parity 286; Core 216; Release 481. Reachability is 0 unreachable shared modules / 0 unused named imports / 0 unreferenced private functions. 496 JS/MJS files pass syntax checks; 93 JSON files parse; 38 relative Markdown links resolve. Deterministic packaging is verified in the sealed artifacts.

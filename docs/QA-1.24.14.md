# MosaicSync 1.24.14 QA contract

1.24.14 is a measured optimization/cleanup release on top of 1.24.13. User-visible behavior, permissions, Sync conflict semantics, content-addressed asset integrity, profile format v2, favicon behavior and localization are frozen.

## Required automated checks

- `npm test` must pass the complete Firefox/Chrome regression suite.
- `npm run bench` must run from a clean source extraction using `fixtures/worst-case-profile.mjs`.
- Mutation-time `refreshQuota` must retain total byte/item quota enforcement while avoiding category-specific usage accounting.
- Settings `getSyncStatus` must continue returning a fresh category usage breakdown.
- Memoized asset-ID hashing must be byte-equivalent to the uncached path, including same-length different images.
- The per-operation memo must not become a long-lived cache.
- Firefox/Chrome generated-tree parity and build-manifest hashes must remain valid.

## Manual smoke test

Open repeated New Tabs, switch Personal/Work, add/edit/move/delete shortcuts, open Settings and confirm Sync usage appears, test profile export/import, language switching, browser restart and Sync status stability in both Firefox and Chrome.

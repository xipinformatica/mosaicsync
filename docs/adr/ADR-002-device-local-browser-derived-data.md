# ADR-002 — Browser-derived artwork and Frequently Visited candidates stay device-local

**Status:** Accepted / frozen

## Decision

Automatically learned favicon pixels and browser-history-derived Frequently Visited site candidates are device-local/session-owned data. They are not promoted into normal synchronized profile state merely because they are useful for presentation.

User-selected artwork may synchronize only through the established explicit artwork policy and quota rules.

## Why

Browser-derived data can reveal local browsing history and can differ legitimately between devices. Synchronizing it would enlarge privacy exposure, consume Sync quota and make one browser's observations incorrectly authoritative for another browser.

## Do not casually change

Do not serialize Top Sites candidates, their browser-derived titles or automatic favicon pixels into the persistent render manifest, normal Sync payloads, Recovery, profile export or another cross-device cache without a separately reviewed product/privacy decision.

## Evidence

- `tests/performance-startup-12784.test.mjs`
- `tests/corrective-1301811.test.mjs`
- `tests/corrective-1301812.test.mjs`
- `tests/corrective-1301816.test.mjs`
- `tests/corrective-130189.test.mjs`

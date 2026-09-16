# ADR-005 — Catastrophic Sync loss requires independent confirmation and durable restart grace

**Status:** Accepted / frozen

## Decision

An apparently empty browser Sync namespace is not enough by itself to begin catastrophic Recovery. MosaicSync confirms emptiness through an independent full namespace read before quarantine.

When Recovery moves into an attempt, the `recovering` continuity state and restart-grace deadline are persisted before authoritative publication begins.

## Why

Browser Sync may transiently report zero bytes or delayed namespace visibility during startup/delivery. A single observation could therefore trigger unnecessary recovery. MV3 workers can also stop at arbitrary awaited boundaries; durable restart grace prevents a replacement worker from immediately starting a second attempt while the previous attempt may have partially progressed.

## Do not casually change

Do not collapse the two empty observations into one optimization. Do not move publication ahead of the persisted recovering/restart-grace write.

## Evidence

- `tests/corrective-13013.test.mjs`
- `tests/corrective-13014.test.mjs`
- `tests/recovery-continuity-1301824.test.mjs`
- `tests/recovery-stress-13014.test.mjs`

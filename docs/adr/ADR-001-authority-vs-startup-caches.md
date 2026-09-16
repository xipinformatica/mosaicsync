# ADR-001 — Authoritative state is separate from disposable startup caches

**Status:** Accepted / frozen

## Decision

The normalized MosaicSync profile in the core storage/model layer is authoritative. `storage.session`, the localStorage render manifest, appearance hints and other startup accelerators are disposable presentation caches only.

A cache may make the first frame faster, but it must never become an independent source of profile truth. If all startup caches disappear, MosaicSync must reconstruct the correct state from authoritative storage.

## Why

MosaicSync deliberately uses very early bootstrap data so a New Tab can appear immediately. Treating those accelerators as additional authorities creates stale-write races: an older tab or background task can otherwise repaint or republish state that has already been superseded.

The Step-2 ownership work physically separated structural session truth from browser-derived Frequently Visited presentation and serialized structural publication with authoritative persistence.

## Do not casually change

Do not add another persistent first-frame representation of shortcuts/settings merely because it is convenient. Do not let a background refresh read-modify-write structural startup state it does not own.

## Evidence

- `tests/corrective-1301810.test.mjs`
- `tests/corrective-1301811.test.mjs`
- `tests/corrective-1301812.test.mjs`
- `tests/performance-startup-12784.test.mjs`
- `docs/ARCHITECTURE.md` — First Paint section

# MosaicSync 1.30.18.11 QA / release-candidate checklist

## Release identity / packaging

- [x] Firefox manifest/runtime/Settings version is exactly `1.30.18.11`.
- [x] Chrome manifest/version_name/runtime/Settings version is exactly `1.30.18.11`.
- [x] `build-manifest.json`, package-size baseline, release-contract version and package filenames all agree on `1.30.18.11`.
- [x] GitHub-ready source and both browser ZIPs reproduce byte-for-byte from a clean extraction.
- [x] Firefox and Chrome browser ZIPs pass the production release-contract scanner.

## Step 2.2 ownership/concurrency closure

- [x] Generic structural session publication/warming has no physical write path to the dedicated Frequently Visited projection key.
- [x] Ordinary structural profile persistence never writes `LOCAL_ACTIVE_SPACE_KEY`.
- [x] Structural session publication derives active Space from the dedicated persisted pointer while the persistence lock is held.
- [x] Startup active-Space/meta repair re-reads current authority under the persistence lock and repairs only values that remain missing/invalid.
- [x] A stale startup read cannot overwrite a newer normal active-Space or meta writer.
- [x] Independent setup/UI meta changes use field-intent `updateLocalMeta()` and preserve unrelated concurrent fields.
- [x] Field-intent meta updates cannot replace device identity or schema ownership.
- [x] Coherent full-record `writeLocalMeta()` transitions remain serialized under the shared persistence lock.
- [x] Source helper naming reflects persistence ownership while the underlying `mosaicsync.local-assets.write.v1` Web Lock string remains unchanged for rolling-version compatibility.

## Frequently Visited / appearance correctness

- [x] Oversized native FV favicon data is reduced to the existing bounded first-paint preview budget instead of being silently dropped.
- [x] FV cards are assembled detached and the visible list is atomically replaced only after favicon decode jobs settle; decode failures become fallbacks before commit.
- [x] Existing FV permission-recovery and cached-authority regressions still pass with the async decode-before-commit path.
- [x] FV site/favicon presentation stays session-only and is not added to persistent localStorage/profile state, Sync, Recovery or export.
- [x] Settings-open Light/Dark appearance updates `data-canvas-text` before the early return.
- [x] Full-page wallpaper/background/dim painting remains after the Settings-open early-return boundary and is still deferred until safe.

## Automated preservation gates

- [x] Full automated suite passes on the final versioned source (`823/823`).
- [x] Normal Sync/Recovery/state/profile schema versions are unchanged.
- [x] Permissions, CSP, localization, privacy boundaries, telemetry policy and backend-free operation are unchanged.
- [x] Runtime compressed-size delta versus 1.30.18.10 is small and reviewed: Firefox +1,831 deflated bytes (619,120 → 620,951); Chrome +1,832 (633,660 → 635,492), about +0.30%.
- [x] Full benchmark completes successfully on the final working source and again from a clean GitHub-source extraction.
- [x] Clean GitHub-source extraction passes the same `823/823` suite, identical size report and release-contract gates.
- [x] Deterministic second packaging is byte-identical; final SHA-256 hashes are delivered with the release artifacts.

Certification note: the first clean-extraction benchmark invocation stalled in the benchmark harness before completion; the process was terminated without modifying source. The exact same clean source then completed the full benchmark successfully on an immediate independent rerun, matching the already-successful full benchmark from the final working tree. No runtime/build/hash divergence was observed.

## Manual browser checks before/after store publication

- [ ] Firefox: with Settings open, switch Light ↔ Dark and confirm preview text/shadows change immediately while the real wallpaper/dim commit still waits for Settings close.
- [ ] Firefox warm FV: cards never appear without their favicon and then gain it; failed/absent artwork uses the normal fallback.
- [ ] Firefox: rapidly edit structural state and switch Spaces from separate New Tabs; next New Tabs never visually restore an older active Space.
- [ ] Firefox: remove/restore Top Sites permission and confirm the existing recovery flow remains intact.
- [ ] Chrome: repeat Settings Light/Dark, warm FV, active-Space concurrency and Top Sites permission lifecycle checks.

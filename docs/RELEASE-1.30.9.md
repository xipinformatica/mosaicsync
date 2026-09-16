# MosaicSync 1.30.9 publication notes

## Release status

MosaicSync 1.30.9 is a zero-new-features trusted-state efficiency and cleanup release on top of 1.30.8. It preserves the complete 1.30.8 Sync/evidence architecture while eliminating measured repeated normalization from several already-trusted New Tab preference paths and small redundant background work. No user-facing feature, permission, synchronized/profile schema or transport change is introduced.

## Validation

Automated release gates pass with 600/600 tests in both the final source and a clean GitHub-ready extraction, plus the performance benchmark, reviewed package-size guard, ZIP integrity and deterministic clean-source rebuild checks. The 200-shortcut image-heavy stress benchmark preserves the ~2.1 ms normalized Cross-Space path and shows the trusted workspace replacement removing the former ~315–345 ms defensive transformation before persistence.

## Mozilla Developer Hub changelog

Zero-new-features efficiency/refinement release. Already-normalized New Tab preference mutations for Space names, multiple-Spaces state and synchronized Frequently Visited preferences now use an explicit trusted workspace-replacement path instead of repeatedly re-normalizing/image-hashing the same live state before the ordinary persistence boundary validates it. Personal/Work Sync publication also reuses the state already normalized by the local-mutation dispatcher, and the five-minute alarm avoids repeating the same pending-local journal retry inside its subsequent semantic freshness check. Added deterministic evidence regressions for local-vs-remote ordering, tombstone deletion dominance and same-key Settings races, and removed only proven-dead runtime symbols/CSS variables. All 1.30.8 Sync safeguards remain unchanged. No new permissions, synchronized/profile schema, backend, telemetry, heartbeat, remote code or user-facing changes.

## Notes to Reviewer

Corrective/performance maintenance only. 1.30.9 does not alter MosaicSync's Sync conflict policy, delivered-value evidence, pre-publication rebase, authoritative post-write ledger, device/profile snapshot format, five-minute watchdog period or foreground single-flight behavior.

The main runtime change is an explicit trusted internal workspace replacement helper. New Tab's live `state` has already crossed `normalizeState()`. Three controlled preference mutations (Space name, multiple-Spaces boolean and synchronized Frequently Visited boolean/count) construct their replacement workspace entirely from an already-normalized workspace plus already-normalized primitive values and monotonic timestamps. They therefore avoid repeating full state/workspace validation and image hashing before calling the ordinary persistence API. `writeLocalStateWithBaseline()` remains the final defensive boundary and still normalizes/projects the final state before durable storage. Defensive public/raw-state model wrappers remain unchanged.

Background Personal/Work publication receives normalized states exclusively from `pushLocalMutation()` and now passes that same normalized state to complete profile snapshot publication instead of normalizing it again. The scheduled five-minute alarm still performs pending-local and cross-Space recovery before the semantic watchdog; it explicitly tells `reconcileIfNewCommit()` that the pending-local retry was already completed so the same journal is not immediately read/retried twice in one serialized alarm task. Other reconcile entry points retain normal pending-local recovery.

Additional production-harness tests cover local-newer vs remote evidence, newer and older tombstone evidence under MosaicSync's existing deletion-dominance rule, and same-key Settings repair in both Firefox and Chrome. Dead-code cleanup removes only symbols with no runtime/test callers and CSS custom properties with no `var(...)` consumers.

The device/profile snapshot generation cache is intentionally not included in 1.30.9; project development notes mark it as mandatory for the next release with strict complete/fingerprint-verified-only caching requirements.

No permissions, host permissions, network scope, CSP, telemetry, remote code, backend, localization, Settings layout or user-visible behavior changes.

## GitHub release title

`MosaicSync 1.30.9`

## GitHub release description

MosaicSync 1.30.9 is a zero-feature trusted-state efficiency and cleanup release. It removes repeated normalization/image-hashing from already-normalized New Tab preference mutations, reuses normalized publication state in the background, avoids a duplicate watchdog journal retry, expands deterministic same-key/tombstone/Settings evidence regressions, and removes proven-dead runtime vocabulary while preserving all 1.30.8 Sync correctness and privacy guarantees.

## GitHub Desktop commit

**Summary:** `Release MosaicSync 1.30.9`

**Description:** `Remove redundant trusted-state normalization and duplicate watchdog work, expand deterministic Sync evidence regressions, and clean proven-dead runtime vocabulary. Preserve all 1.30.8 Sync behavior; zero new features or permissions.`

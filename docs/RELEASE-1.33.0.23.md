# MosaicSync 1.33.0.23 publication notes

## AMO changelog

Background Sync frugality and first-paint hardening. A healthy catastrophic-loss liveness check now uses a small positive-only probe of reset intent plus the fixed Personal/Work core keys before the normal authoritative reconciliation read. If the probe is empty, item-only, fails, or is otherwise inconclusive, MosaicSync falls back to the existing full negative-confirmation path unchanged. Recovery decoding/self-heal, pending journals, torn-delivery handling, watchdog cadence, schemas, permissions and privacy boundaries are unchanged. First-paint regressions now execute both real bootstrap and authoritative geometry owners and protect immediate/builtin/deferred/fallback artwork semantics.

## Notes to Reviewer

1.33.0.23 changes one background read boundary and adds test hardening. In `beginOrContinueCatastrophicSyncRecovery()`, the healthy `lossState === "none"` path first calls `storage.sync.get()` with only reset intent plus the fixed Personal/Work settings/dataset keys. A positive live-core result may return early; an empty/failed probe is never negative authority and falls through to the same two independent `storage.sync.get(null)` confirmations used previously. The later authoritative reconciliation full read and all Recovery validation/self-heal logic are unchanged. `tests/corrective-133023.test.mjs` covers healthy counts, dynamic-item-only fallback, empty-namespace double confirmation, targeted-read failure fallback, real bootstrap↔`applySettings()` geometry parity, and artwork handoff semantics.

## GitHub release title

`MosaicSync 1.33.0.23`

## GitHub release description

MosaicSync 1.33.0.23 is a narrow efficiency/hardening release. Healthy Sync-watch reconciliation no longer materializes the complete Sync namespace merely to prove that live core exists: a positive-only fixed-key probe handles the common healthy case, while every negative, ambiguous or failed probe retains the established full catastrophic-loss confirmations. Normal reconciliation, Recovery, pending journals, Sync wire format and privacy rules are unchanged. The release also adds a real bootstrap-to-authoritative first-paint parity contract for geometry and artwork semantics, preventing recurrence of the mismatch class behind the recent favicon/folder startup corrections.

## GitHub Desktop

**Summary:** Release MosaicSync 1.33.0.23 — Sync-watch frugality and first-paint hardening

**Description:** Replace one healthy-path catastrophic full Sync read with a fail-safe positive-only fixed-key probe, preserve all negative/Recovery authority paths, and add real bootstrap↔authoritative first-paint parity regressions.

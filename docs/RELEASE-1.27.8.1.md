> **INTERNAL CANDIDATE — not a public MosaicSync release.** Superseded by public 1.27.8.9.

# MosaicSync 1.27.8.1 publication notes

## Mozilla Developer Hub — concise changelog

Sync hardening follow-up. Recovery-snapshot quota/size failures are now tracked consistently across Personal, Work, cross-Space, bootstrap and reconciliation paths instead of silently losing the safety warning. Added real two-computer Firefox/Chrome Sync simulations with partial/out-of-order delivery, a local edit during bootstrap, missed Sync events, watchdog recovery and final convergence. Added root-last quota fault injection proving the previous complete generation remains authoritative. No new permissions.

## Notes to Reviewer

1.27.8.1 is a narrowly scoped follow-up to 1.27.8's complete Personal+Work recovery snapshot. It does not change synchronized record schema, LWW/tombstone conflict rules, permissions, CSP, telemetry or remote-code behavior.

The production background now persists a separate local-only recovery-protection state (`unknown` / `protected` / `limited`) whenever `publishProfileDeviceSnapshot()` is attempted. This is intentionally separate from ordinary `syncStatus`: if the Personal+Work ledgers are valid but the additional safety generation cannot fit due to `storage.sync` quota, normal Sync may remain Ready while the existing localized fallback warning is retained. The fix specifically covers Work-only edits and cross-Space transactions in addition to Personal/bootstrap/reconciliation paths.

Regression coverage adds two independent production background processes backed by one controllable fake `storage.sync` service for both Firefox and Chrome. The test deliberately delivers Personal first, Work partially, creates a local Work shortcut while the second computer is still waiting, delivers the missing Work key without an `onChanged` event, invokes the real watchdog, then verifies preservation/convergence on both computers. Separate production fault injection writes a new profile snapshot's target chunks and forces quota failure on the root flip; the previous root must remain authoritative and target chunks must be cleaned up.

## Chrome Web Store release note

Improves multi-computer Sync recovery diagnostics and testing. MosaicSync now keeps recovery-snapshot quota failures visible on all Sync paths, including Work-only changes, and adds stronger protection/rollback validation for partial or delayed browser Sync delivery.

## GitHub commit

**Summary:** `Release MosaicSync 1.27.8.1`

**Description:** `Harden complete-profile Sync recovery observability and add distributed Firefox/Chrome two-computer regression coverage for partial delivery, missed events, quota failure and root-last rollback.`

## GitHub release

**Title:** `MosaicSync 1.27.8.1 — Distributed Sync hardening`

**Body:**
MosaicSync 1.27.8.1 is a focused follow-up to the 1.27.8 whole-profile Sync recovery redesign. It makes additional recovery-protection failures explicit without mislabeling an otherwise synchronized profile as broken, fixes Work-only/cross-Space warning propagation, and adds real two-computer production-background tests for Firefox and Chrome. The new harness verifies partial and out-of-order Work delivery, local edits made while a fresh computer is waiting, recovery after a missed `storage.onChanged` event, watchdog-driven completion and final convergence. Root-last fault injection also proves a quota failure cannot replace the previous complete safety generation with a half-written one.

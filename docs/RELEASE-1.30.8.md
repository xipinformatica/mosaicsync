# MosaicSync 1.30.8 publication notes

## Release status

MosaicSync 1.30.8 is a zero-new-features Sync concurrency hardening release on top of 1.30.7. It preserves all 1.30.7 performance/refinement paths and closes a narrow same-key browser-Sync delivery/publication race discovered through adversarial fault injection. No user-facing feature, permission, synchronized/profile schema or transport change is introduced.

## Validation

Automated release gates pass with 591/591 tests in both the final source and a clean GitHub-ready extraction, plus the performance benchmark, reviewed package-size guard, ZIP integrity and deterministic clean-source rebuild checks. Targeted production-harness scenarios inject a newer remote value for the exact Personal or Work key after MosaicSync's pre-write snapshot but before its own `storage.sync.set()`, then require the deterministic newer winner and unrelated local edit to both survive.

## Mozilla Developer Hub changelog

Zero-new-features Sync concurrency hardening. MosaicSync now preserves short-lived bounded evidence for valid Personal/Work records/settings that Firefox/Chrome actually delivers through `storage.onChanged`, including a deterministically newer `oldValue` displaced by an expected own write. Before authoritative commit/reconciliation work continues, that evidence is compared with the current shared value through the existing deterministic conflict rule, closing the narrow same-key read→write race where a newer delivered value could otherwise be overwritten before the post-write ledger saw it. Added adversarial Personal/Work race tests plus foreground single-flight failure/freshness and frozen-input regressions. No new permissions, synchronized/profile schema, backend, telemetry, heartbeat, remote code, watchdog-frequency or user-facing changes.

## Notes to Reviewer

Corrective maintenance only. 1.30.8 retains the complete 1.30.7 optimization and Sync architecture: normal publication still rebases against the pre-write delivered ledger, dataset markers are still built from the authoritative post-write ledger, foreground freshness requests remain in-flight-only single-flight, and the five-minute semantic watchdog is unchanged.

The additional hardening covers the tiny interval between the pre-publication ledger read and the subsequent `browser.storage.sync.set()`. `storage.onChanged` supplies both `oldValue` and `newValue`. For valid core Personal/Work item/settings keys, MosaicSync keeps only short-lived bounded evidence when an unexpected value was delivered or when an expected own write displaced an `oldValue` that would win under the existing `chooseNewerRecord()` rule. Before Personal/Work commit-marker construction and before semantic reconcile/freshness work, MosaicSync compares that evidence with the currently stored value and writes back only the deterministic winner when required. This is not a new conflict rule and does not create another Sync transport.

The evidence map is module-local only, limited by the existing expectation bound and TTL, core-record/settings-only, never placed in `storage.sync` and never exported. It protects browser-delivery values observed by the currently running background context; after MV3 worker restart the normal durable `storage.sync` and complete device/profile snapshots remain the reconstruction sources. No new storage/profile schema is introduced.

Regression scenarios deliberately inject a newer same-key foreign record between the production pre-read and write for both Personal and Work in Firefox and Chrome. Additional tests force a foreground freshness failure and require the next request to execute, verify a settled foreground single-flight never becomes a freshness cache, and deep-freeze normalized Cross-Space input to protect the 1.30.7 aliasing invariant.

No permissions, host permissions, network scope, CSP, telemetry, remote code, backend, localization, Settings layout or user-visible behavior changes.

## GitHub release title

`MosaicSync 1.30.8`

## GitHub release description

MosaicSync 1.30.8 is a zero-feature Sync concurrency hardening release. It closes a narrow same-key `storage.sync` read→write race by retaining bounded temporary evidence for newer core values Firefox/Chrome actually delivered and reapplying the existing deterministic winner before authoritative commit/reconciliation reads. Personal and Work fault-injection tests reproduce the race in both browsers. All 1.30.7 performance fast paths, the five-minute watchdog, post-write ledger, privacy model and user-visible behavior remain unchanged.

## GitHub Desktop commit

**Summary:** `Release MosaicSync 1.30.8`

**Description:** `Harden same-key browser Sync delivery/publication races with bounded delivered-value evidence and adversarial Personal/Work regressions. Preserve all 1.30.7 optimizations; zero new features or permissions.`

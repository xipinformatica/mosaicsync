# MosaicSync 1.27.8 publication notes

## Mozilla Developer Hub — concise changelog

Sync reliability release. MosaicSync now protects Personal and Work as one complete profile safety generation, retains the previous verified generation for fallback, waits instead of finalizing a half-restored fresh profile, preserves local edits made while Sync is still arriving, and can repair a torn Work ledger from a verified complete profile. Also adds a subtle Firefox-style no-layout-shift shortcut hover. No new permissions.

## Mozilla — Notes to Reviewer

MosaicSync 1.27.8 is primarily a Sync consistency/recovery release. The main implementation is in the Firefox/Chrome background workers.

The existing browser `storage.sync` record/settings ledgers remain schema version 10 and retain their existing per-record conflict/tombstone behavior. 1.27.8 adds a complete-profile safety layer by extending MosaicSync's existing per-device snapshot transport so a trusted device snapshot contains both Personal and Work. The encoded payload intentionally remains device snapshot schema v2, allowing 1.27.7 to continue decoding the Personal half during rolling upgrades; 1.27.8 marks/validates the added Work half with `profileSnapshotVersion: 1` and `profileComplete: true` metadata.

Complete-profile snapshots remain bounded, gzip-compressed and double-buffered. Chunk records are written before the authoritative root. The root also retains a descriptor for the immediately previous complete generation, so a receiver can use that independently verifiable generation if Firefox exposes a newer root before all of its chunks.

Fresh bootstrap now requires either a verified complete Personal+Work snapshot or independently usable Personal and Work compatibility ledgers. Personal alone can no longer mark Sync ready. A valid zero-record Work dataset/settings record still represents an intentionally empty Work Space; missing/partial Work does not.

If the user edits MosaicSync while a fresh device is waiting for the complete remote profile, those local records are kept locally. Once the complete incoming baseline arrives, MosaicSync merges them with the remote state through the pre-existing deterministic record clocks and publishes the resulting delta. A device with no previously applied Work/profile revision is deliberately not trusted to publish its temporary blank/partial Work view as a complete recovery snapshot.

When a verified complete profile is available, it may be used to repair a torn compatibility Work ledger: visible newer records are still merged through existing conflict rules and the coherent dataset marker is committed last. Legacy Personal-only device snapshots remain readable but are not granted this repair authority.

The only UI change is CSS: shortcut tiles receive a restrained `scale(1.018)` + `brightness(1.045)` hover using paint-only transform/filter properties; grid geometry is unchanged and reduced-motion behavior is preserved.

No new permissions or host permissions, no CSP relaxation, no telemetry, no remote code and no new network service. State schema remains 18, synchronized record schema remains 10, and local Sync bookkeeping meta schema advances to 12.

Validation: `npm test` passes 417/417 tests on the final source, including new complete-profile/fresh-bootstrap/pending-edit/Work-repair coverage and the existing concurrency/security/regression suite. `npm run bench` also completes successfully.

## Chrome Web Store — release notes

Improves Sync reliability by treating Personal and Work as one verified profile for recovery, retaining the previous good generation, preventing half-restored fresh profiles from being marked ready, preserving edits made while Sync is still arriving, and automatically repairing torn Work Sync data when a trusted complete profile is available. Adds a subtle shortcut hover effect. No new permissions.

## GitHub commit

**Summary:** `Release MosaicSync 1.27.8`

**Description:**

Make Sync whole-profile and self-healing: add verified Personal+Work device snapshots with previous-generation fallback, safe fresh-profile bootstrap, preservation/merge of local edits made while waiting, Work-ledger repair from trusted complete snapshots, and profile-level Sync readiness. Add the restrained Firefox-style shortcut hover. Keep existing record conflict/tombstone semantics, permissions, CSP and remote-code policy unchanged. Full regression suite: 417/417 passing.

## GitHub release

**Title:** `MosaicSync 1.27.8 — Whole-profile Sync recovery`

**Body:**

MosaicSync 1.27.8 focuses on making Sync recover safely when Firefox/Chromium delivers extension Sync keys out of order or from mixed generations.

- Personal and Work now share a verified complete-profile safety snapshot on trusted devices.
- The previous verified profile generation is retained as an automatic fallback.
- A fresh browser no longer becomes “ready” from Personal alone; missing/partial Work remains waiting instead of becoming an empty Space.
- Shortcuts created locally while the first complete profile is still arriving are merged on top of the incoming profile instead of replacing it.
- A trusted complete profile can automatically repair a torn Work compatibility ledger while preserving newer visible records through the existing conflict rules.
- Legacy Personal-only snapshots remain compatible but are not allowed to act as complete-profile recovery sources.
- Shortcut tiles now get a very subtle Firefox-style grow/brighten hover with no layout shift.
- No new permissions, host permissions, telemetry, remote code or CSP relaxation.

Validation: 417/417 automated tests passing plus the performance benchmark suite.

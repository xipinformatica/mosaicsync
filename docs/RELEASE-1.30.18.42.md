# MosaicSync 1.30.18.42 publication notes

## Mozilla changelog

Corrects a reproduced Sync-safety failure across Firefox on CachyOS and Windows. Exact own-write echo suppression is now resilient to large system-clock corrections, bursts of Sync storage events are coalesced, and immutable device/profile snapshots are used only as one atomic Recovery generation instead of being merged across devices. Automatic live Sync waits for coherent shared Personal/Work ledgers, and “Received from <device>” is shown only when that device is the exact source. Catastrophic-loss detection now checks the live shared Sync core rather than stale Recovery-only bytes. No permissions, CSP or Sync/Recovery wire-schema versions change.

## Mozilla Notes to Reviewer

MosaicSync 1.30.18.42 is a corrective Sync-safety release based on a reproduced real-device incident, not a generic refactor.

The incident had two independently demonstrated parts. First, after a Windows/CachyOS dual-boot clock correction moved wall time forward by roughly two hours, MosaicSync repeatedly entered `storage-event` reconciliation and toggled Settings between Ready and Updating Sync. The prior own-write expectation path used a 30-second `Date.now()` expiry. Exact key/signature expectations are now one-shot capabilities: an exact delayed echo is consumed even if the legacy expiry timestamp is in the past; a mismatch remains external. Unresolved Sync events are accumulated in one bounded map and drained through one serialized reconciliation loop, preventing one full reconcile from being queued for every delivered key/event. Background no-op checks do not mark the visible Sync UI as actively syncing.

Second, the investigation proved Firefox transported complete immutable device generations correctly, but the application then merged records from multiple complete device/profile snapshots. That could synthesize Personal/Work state that had never existed on one device and could make a stale shortcut appear beside otherwise current state. 1.30.18.42 removes that multi-device Recovery merge. `selectAtomicRecoverySnapshot()` selects one verified generation; Personal and Work are taken from that same generation. Immutable generations are explicit Restore/bootstrap fallbacks only. An initialized device uses the coherent shared Personal/Work ledgers for normal per-record conflict resolution and waits if either live ledger is torn instead of filling holes from a Recovery copy.

Receipt provenance is also conservative now. A collaborative live ledger cannot truthfully be attributed to one machine, so its source label is generic. A friendly device name is shown only when the applied source is an exact atomic generation. Existing 1.30.18.41 receipt metadata migrates to non-exact provenance without inventing a new receipt timestamp.

Finally, catastrophic-loss confirmation checks for the live shared Personal/Work core on two namespace reads. Stale local Recovery generations and device-name records are safety metadata, not proof that the live cloud ledger exists, and a retained atomic snapshot alone cannot cancel an active quarantine.

No permissions, CSP, browser API grants, Sync/Recovery wire-schema version, or user-facing product feature is added. Existing immutable generations remain readable. The change is confined to Sync source selection, event suppression/coalescing, provenance and loss-orchestration policy, with permanent regressions covering the reproduced failure classes.

## Chrome Web Store release notes

Improves Sync safety under clock changes and multi-device delivery. Recovery snapshots are now applied only as one coherent Personal+Work generation, Sync event bursts are coalesced, and device attribution is only shown when exact. No new permissions or Sync wire-format changes.

## GitHub release title

`MosaicSync 1.30.18.42`

## GitHub release description

MosaicSync 1.30.18.42 is a corrective Sync-safety release following a reproduced CachyOS ↔ Windows Firefox incident.

It prevents large wall-clock corrections from invalidating exact own-write echo suppression, coalesces Sync storage-event bursts, and stops immutable Recovery snapshots from multiple devices being merged into a synthetic profile. Restore/bootstrap now selects one coherent Personal+Work generation, while normal live Sync uses only coherent shared ledgers and waits when delivery is torn.

The release also removes misleading single-device attribution from collaborative merged ledgers and strengthens catastrophic-loss detection so stale Recovery-only bytes cannot hide loss of the live shared Sync core.

No new permissions, CSP changes or Sync/Recovery wire-schema version changes are included.

## GitHub Desktop

**Summary:** `Release MosaicSync 1.30.18.42`

**Description:** `Make Sync clock-jump-safe and keep Recovery generations atomic across devices.`

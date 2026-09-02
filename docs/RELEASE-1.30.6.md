# MosaicSync 1.30.6 publication notes

## Release status

MosaicSync 1.30.6 is a zero-new-features Sync-delivery resilience release. Browser-native `storage.sync` remains the only synchronization transport and the existing five-minute semantic watchdog remains unchanged. The release adds a throttled foreground/resume freshness check for long-lived New Tabs, self-heals the existing watchdog alarm, and stores local-only forensic Sync diagnostics. During regression testing a concrete concurrency defect was also found and corrected: a normal Personal/Work publication can no longer overwrite or mask a newer remote record that Firefox/Chrome had already delivered locally when its `storage.onChanged` event was missed.

## Validation

Automated release gates pass: **574/574 tests**, benchmark PASS, reviewed package-size guard PASS, ZIP integrity PASS, and a clean extraction of the GitHub-ready source passes the same suite/benchmark and rebuilds Firefox and Chrome packages byte-for-byte identically.

## Mozilla Developer Hub changelog

Zero-new-features Sync-resilience maintenance. An already-open MosaicSync New Tab now performs a throttled freshness reconciliation when it becomes visible/focused again or returns from bfcache, using the existing serialized Sync path and self-healing the existing five-minute watchdog alarm. A device-local diagnostics record captures Sync check/event timing and revision identifiers without telemetry or synchronized user data. Normal Personal/Work publications now preserve newer already-delivered remote records and build commit markers from the actual post-write ledger, preventing a missed Sync event plus a local edit from masking concurrent remote changes. No new permissions, synchronized/profile schema, server, heartbeat, CSP relaxation, telemetry, remote code or user-facing feature.

## Notes to Reviewer

Corrective maintenance only. 1.30.6 does not add a synchronization backend or attempt to invoke undocumented browser Sync APIs. The existing five-minute `browser.alarms` watchdog and `storage.onChanged` reconciliation remain; New Tab adds a 60-second-throttled foreground/focus/bfcache recovery trigger that sends the already-existing `mosaicsync:reconcile-if-needed` runtime message. The background continues to serialize all reconciliation through the existing queue and the foreground path only verifies/recreates the existing watchdog alarm. A new `storage.local` diagnostics key stores timestamps/outcomes and opaque Sync revision identifiers only; it is never written to `storage.sync` and contains no shortcut URLs/titles. Regression testing also identified a normal-publication race: Personal/Work candidate writes are now rebased against records/settings already visible in `storage.sync`, and the dataset marker is generated from the post-write ledger. This mirrors the existing cross-Space publication safety strategy and prevents a missed delivery event from letting an older local record overwrite a newer delivered record. No permissions, synchronized/profile schema, CSP, remote-code or network-scope changes.

## GitHub release title

`MosaicSync 1.30.6`

## GitHub release description

MosaicSync 1.30.6 strengthens browser-native Sync delivery recovery without adding a MosaicSync server or new features. Long-lived New Tabs now perform a throttled foreground freshness check, self-heal the existing five-minute watchdog, and record local-only forensic Sync diagnostics. A concurrency regression discovered while testing this path is also fixed: normal Personal/Work publications rebase against already-delivered remote records and commit the actual post-write ledger, so a missed `storage.onChanged` event followed by a local edit cannot mask a newer remote shortcut. Existing merge/tombstone/cross-Space/profile rules and the 1.30.5 Settings architecture remain intact.

## GitHub Desktop commit

**Summary:** `Release MosaicSync 1.30.6`

**Description:** `Add throttled foreground Sync recovery, watchdog self-healing and local-only diagnostics; preserve already-delivered remote records during concurrent Personal/Work publication. Zero new features or permissions.`

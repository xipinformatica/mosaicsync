# MosaicSync 1.33.0.71 publication notes

**PRIVATE CANDIDATE — not approved for browser-store publication.**

## GitHub release title

`MosaicSync 1.33.0.71`

## Public changes relative to 1.33.0.70

- Improves offline Sync reset protection in the rare case where a browser receives a newly synchronized layout before its separate reset signal.
- Helps prevent old shortcuts or pending edits from being merged into a replacement synchronized layout.
- Retains safeguards for legitimate unsynchronized edits and Personal/Work data; no new permissions or tracking.

## Review and release gates

The two completed Personal and Work dataset commit markers now carry the same reset epoch and initiating device ID already kept in the separate native `storage.sync` reset key. An initialized device reads this embedded authority before accepting new-world data or publishing old-world edits, even if the separate marker arrives later. Legacy-current-epoch adoption still requires a coherent previously confirmed profile and matching durable local baseline. The Sync core schema version and backup format are unchanged. Mixed-version devices do not all understand the new embedded fields. Independent audit, six GitHub checks, and genuine signed-in Chrome/Firefox two-device tests remain mandatory prior to publication.

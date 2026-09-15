# MosaicSync 1.33.0.27 publication notes

## AMO changelog

Recovery quota resilience and documentation cleanup. If the browser unexpectedly rejects an otherwise prepared Recovery publication for Sync quota, MosaicSync can now safely reclaim at most one older verified Recovery generation belonging to the same device and retry the exact immutable publication once. The emergency path never touches another device, never deletes the last verified own fallback, rejects torn fallback-assisted survivors, revalidates immediately before deletion and stops after one retry. Normal two-generation retention, Recovery cleanup policy, Sync wire format, permissions and privacy boundaries are unchanged. The root README is also simplified so release-by-release engineering history stays in the changelog/development documentation.

## Mozilla Notes to Reviewer

1.33.0.27 adds a narrowly bounded failure path around `publishProfileDeviceSnapshot()`. Normal pre-publication capacity planning remains unchanged. Only after `commitProfileDeviceSnapshotPublication()` returns a quota-classified error does the background take two fresh namespace observations, use the Recovery lifecycle planner to freeze/revalidate at most one older independently verified generation owned by the acting device, and remove it only when another independent own fallback survives and the exact prepared publication fits the simulated post-delete namespace. If removal succeeds, the same `publication` object is committed once more; there is no rebuild/new commit ID and no retry loop. Any unsafe/failed reclaim returns the existing quota outcome. No remote Recovery generation, schema, retention policy, pending journal or permission changes.

## GitHub release title

`MosaicSync 1.33.0.27`

## GitHub release description

MosaicSync 1.33.0.27 adds a bounded self-only Recovery quota fallback. When the browser unexpectedly rejects a Recovery publication for Sync quota after normal planning, MosaicSync may retire one older independently verified generation from that same device, freshly revalidate the destructive decision, and retry the exact immutable publication once. It never touches remote Recovery, never deletes the last verified own fallback, never trusts a torn fallback-assisted survivor and never loops. The ordinary two-generation Recovery policy and Sync/Recovery formats remain unchanged. This release also simplifies the root README so product information is easy to find while chronological engineering detail stays in `CHANGELOG.md` and `README-DEVELOPMENT.md`.

## GitHub Desktop

**Summary:** Release MosaicSync 1.33.0.27 — bounded Recovery quota retry

**Description:** Add one self-only, freshly revalidated Recovery reclaim + one retry for unexpected browser Sync quota rejection; preserve two-generation retention and simplify the root README.

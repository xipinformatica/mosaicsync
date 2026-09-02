# MosaicSync 1.30.18.12 publication notes

## Mozilla Developer Hub changelog

Post-audit corrective release for 1.30.18.11. Fixes a stale Frequently Visited decode race, keeps rich live FV favicons independent from their bounded session-only startup derivative, prevents stale Sync/status metadata records from restoring an older onboarding decision, and makes manually selected detected favicons reproduce more reliably across browsers using compact exact-choice metadata only. Automatic favicons remain device-local and favicon image bytes still synchronize only when the user explicitly enables **Sync this image**. No feature, permission, CSP, Sync/Recovery/profile schema, telemetry or backend change.

## Notes to Reviewer

MosaicSync 1.30.18.12 is a narrow post-publication corrective release. It does not begin the next maintainability step.

A forensic comparison of 1.30.18.11 against the certified 1.30.18.10 baseline found no reconstruction loss or unrelated subsystem regression, but it exposed two edge cases in the new FV async path and one incomplete metadata-ownership boundary. 1.30.18.12 addresses those cases directly.

Frequently Visited visible-commit authority now advances on every render request, including disabled/empty states. Detached favicon decoding therefore cannot later resurrect a strip that a newer state has hidden. The live strip also keeps the browser's original favicon candidate; the bounded 48 px derivative is produced independently for disposable `storage.session` first paint. Failure to produce that derivative never removes a valid live favicon. Browser-history-derived FV data remains outside persistent profile state, Sync, Recovery and export.

Background full-record Sync/status metadata writes now re-read current local meta under the existing persistence Web Lock and preserve the independent onboarding fields by default. The verified remote-bootstrap transition that intentionally completes onboarding is the only background full-record write that opts into changing those fields. The physical Web Lock name remains unchanged for rolling-version compatibility.

Manual **Choose detected favicon** continues to synchronize no favicon image bytes unless the existing **Sync this image** option is explicitly selected. The compact preference instruction is made more exact: Browser-source manual choices use a hash of the selected image rather than the old coarse `b` marker, matching can cross browser/site candidate source classes when the selected pixels are identical, and an originating device can upgrade an existing legacy `b` preference in its Sync record from the local pixels it already has. Receiving browsers still reconstruct the favicon through their own browser/site favicon sources.

New regressions use deferred decode and real storage-lock races for the new correctness boundaries. The final automated suite contains 833 passing tests. Normal state, Sync, Recovery and profile schema versions are unchanged; permissions and CSP are unchanged.

## Chrome Web Store release notes

Corrects three reliability issues found after 1.30.18.11: stale Frequently Visited favicon work can no longer reappear after the strip is hidden, live FV artwork no longer depends on optional session-image compression, and stale Sync-status metadata cannot restore an older onboarding state. Manually selected detected favicons also follow your compact choice metadata more reliably between browsers without adding favicon image bytes to Sync. No permission or privacy-model change.

## GitHub release title

`MosaicSync 1.30.18.12`

## GitHub release description

MosaicSync 1.30.18.12 is the post-audit corrective follow-up to 1.30.18.11. It closes the verified FV stale-decode race, separates live FV artwork from its disposable session derivative, protects onboarding intent from stale full-record Sync/status writes, and strengthens compact cross-device reconstruction of manually selected detected favicons without synchronizing their image bytes by default.

The release remains within Step 2.2: no Step 2.3 refactor, new feature, permission, schema, telemetry or backend change.

## GitHub Desktop

**Summary:** `MosaicSync 1.30.18.12 — post-audit correctness fixes`

**Description:** Fix FV stale decode authority and live/session artwork separation; preserve onboarding intent across stale background meta writes; make manual detected-favicon preference Sync exact across candidate source classes while keeping favicon pixels device-local; add adversarial regressions and re-certify deterministic packages.

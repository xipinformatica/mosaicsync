# MosaicSync 1.30.4 publication notes

## Release status

MosaicSync 1.30.4 is a zero-new-features Settings-stability refinement and direct public-history successor to 1.30.2. The 1.30.3 package was an unpublished diagnostic candidate: replacing the native Settings `<dialog>` did not solve the reproduced Firefox white/blank-panel failure, so 1.30.4 keeps that outer container temporarily but changes only the surviving common denominator—the inner Settings scroll frame—to isolate the cause conclusively.

## Validation

Automated release gates pass: **563/563 tests**, benchmark PASS, package-size guard PASS, ZIP integrity PASS, and a clean extraction of the GitHub-ready source rebuilds Firefox and Chrome byte-for-byte identically. The reproduced white/blank Settings hardware symptom remains the final acceptance gate because this release deliberately tests one rendering variable.

## Mozilla Developer Hub changelog

Zero-new-features stability refinement. Firefox hardware testing narrowed the Settings white/blank-panel failure to dynamic layout changes inside the long-lived Settings form scroll surface. Settings now has one scroll owner: the outer fixed Settings surface scrolls, while the inner form remains normal-flow content with no independent viewport max-height/overflow frame. The release also carries the validated unpublished 1.30.3 correctness hardening for Settings/Space ownership, stale artwork cancellation, System-theme ordering, favicon timeout completion, recovery-queue concurrency/finite timestamps and final-interaction persistence. No new permissions, schemas, CSP changes, telemetry, remote code or features.

## Notes to Reviewer

Corrective maintenance only. The principal 1.30.4 runtime change is CSS-only and intentionally narrow: vertical scrolling moves from the long-lived `#settingsForm.dialog-card` to the outer fixed Settings surface. The inner Settings form now uses normal flow (`max-height:none; overflow:visible`). Real Firefox hardware reproduced blank Settings descendants when Separate Light/Dark Wallpapers changed the scrollable form's layout on Windows and Linux, and Frequently Visited triggered the same class on Linux. An unpublished 1.30.3 experiment showed that replacing the native modeless `<dialog>` alone did not fix the issue; 1.30.4 keeps that experimental outer surface temporarily so scroll ownership is the only rendering variable under test. All other 1.30.3 correctness fixes are preserved. No permission, synchronized/storage/profile schema, CSP, remote-code or network-scope changes.

## GitHub release title

`MosaicSync 1.30.4`

## GitHub release description

MosaicSync 1.30.4 is a zero-new-features Settings-stability build that moves Settings to a single scroll owner after real Windows and Linux Firefox testing narrowed the blank-panel failure to dynamic layout changes inside the long-lived inner Settings scroll frame. It also carries the validated unpublished 1.30.3 ownership/cancellation, System-theme, favicon timeout/recovery-queue and final-persistence hardening. No new permissions, schemas, CSP, telemetry, remote code or feature surface.

## GitHub Desktop commit

**Summary:** `Release MosaicSync 1.30.4`

**Description:** `Move Settings to one scroll owner to isolate the reproduced Firefox blank-panel failure while retaining the validated 1.30.3 correctness hardening. Zero new features or permissions.`

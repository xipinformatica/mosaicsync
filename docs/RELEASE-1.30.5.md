# MosaicSync 1.30.5 publication notes

## Release status

MosaicSync 1.30.5 is a zero-new-features Settings-stability refinement on top of 1.30.4. It deliberately keeps the 1.30.4 single-scroll-owner rendering architecture unchanged and applies only the concrete lifecycle correction independently found by two source audits: locale relocalization must preserve the outer Settings scroller, not the now-normal-flow inner form.

## Validation

Automated release gates pass: **567/567 tests**, benchmark PASS, reviewed package-size guard PASS, ZIP integrity PASS, and a clean extraction of the GitHub-ready source passes the same suite/benchmark and rebuilds the Firefox and Chrome packages byte-for-byte identically. Real Windows/Linux Firefox hardware remains the final acceptance gate for the historical white/blank Settings symptom because 1.30.5 intentionally does not alter the 1.30.4 rendering experiment.

## Mozilla Developer Hub changelog

Zero-new-features Settings-stability refinement. 1.30.5 preserves the 1.30.4 single-scroll-owner Settings architecture and fixes a small follow-up found independently in two audits: changing MosaicSync's interface language while Settings is open now preserves the actual outer Settings scroll position instead of reading/writing the non-scrollable inner form. Added regression stress for repeated Separate Light/Dark Wallpapers and Frequently Visited visibility toggles. No permissions, schemas, CSP changes, telemetry, remote code or feature changes.

## Notes to Reviewer

Corrective maintenance only. 1.30.5 leaves the 1.30.4 Settings rendering experiment intact: the outer fixed Settings surface remains the sole vertical scroll owner and `#settingsForm` remains normal-flow content. The runtime correction changes locale-refresh scroll preservation from `settingsForm.scrollTop` to `settingsDialog.scrollTop`, matching the new ownership model. New tests exercise that real function and 100-cycle visibility stress for Separate Wallpapers and Frequently Visited. No `hidden` strategy, preview timing, permission flow, Sync/storage schema, CSP, remote-code or network-scope changes.

## GitHub release title

`MosaicSync 1.30.5`

## GitHub release description

MosaicSync 1.30.5 is a zero-new-features Settings-stability refinement that preserves 1.30.4's single-scroll-owner architecture, corrects locale-change scroll preservation to target the actual outer Settings scroller, and adds repeated-toggle regression coverage for Separate Light/Dark Wallpapers and Frequently Visited. Rendering, permission, storage/Sync and preview behavior are otherwise intentionally unchanged so the existing Firefox hardware experiment remains clean.

## GitHub Desktop commit

**Summary:** `Release MosaicSync 1.30.5`

**Description:** `Preserve the 1.30.4 single-scroll-owner Settings experiment, fix locale scroll-position ownership, and add targeted repeated-toggle regressions. Zero new features or permissions.`

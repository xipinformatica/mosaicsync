# MosaicSync 1.26.13 manual QA

## Release identity
- Confirm Settings displays `MosaicSync · 1.26.13` in Firefox and Chrome.
- Confirm Firefox/Chrome manifests, Chrome `version_name`, internal `VERSION`, build manifest and package filenames all report `1.26.13`.

## Frequently Visited
- Enable Frequently Visited, open a second/new New Tab after the first refresh has populated the snapshot, and confirm the Frequent section is already present on the first visible frame with no shortcut-grid jump.
- Confirm the asynchronous Top Sites refresh updates only the Frequently Visited cards and does not delay New Tab first paint.
- Drag a Frequently Visited card onto an empty grid slot; confirm it becomes a normal shortcut in that exact slot and no duplicate Frequent card remains.
- Confirm the existing right-click Add shortcut and Add to bookmarks actions still work.
- Right-click a Frequent site and choose Hide this site. Confirm the site and its subdomains stay hidden on this device, while unrelated domains under the same public suffix remain eligible.
- Confirm Frequently Visited disable/count changes keep the first-frame snapshot consistent.

## Website access
- With automatic site icons enabled, Website access missing, at least one iconless shortcut present and no prior prompt decision, confirm the non-blocking Website access callout appears after first paint.
- Confirm Allow all websites opens the browser-native permission request from the click gesture and successful grant starts icon recovery.
- Confirm dismissing the callout hides it persistently on that device; Settings can still grant Website access later.
- Confirm no required host permission was added to either manifest.

## Hardening regressions
- Run the automated quote-aware SVG root and fail-closed unknown-image-dimension tests.
- Sanity-check the 1.26.9 live Light/Dark wallpaper switching while Settings is open and the 1.26.6 folder-child drag-out path.

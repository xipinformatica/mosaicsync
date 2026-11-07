# MosaicSync 1.33.0.91 publication notes

## GitHub release title

`MosaicSync 1.33.0.91`

## Firefox Add-ons — What's new

**More reliable website icons**

Fixed a problem where a shortcut could pick up the wrong website's icon after a page failed to load or when opening a shortcut in another tab. Your existing icons and shortcuts are preserved.

## Chrome Web Store — What's new

**More reliable website icons**

Fixed a problem where a shortcut could pick up the wrong website's icon after a page failed to load or when opening a shortcut in another tab. Your existing icons and shortcuts are preserved.

## GitHub release — changes since 1.33.0.89

- Based directly on audited canonical 1.33.0.89, skipping 1.33.0.90 entirely.
- Applies the narrowly scoped Claude v4 icon-attribution corrective: only an expected shortcut's exact hostname (ignoring leading `www.`) and matching port can supply browser-tab-learned favicon artwork. Uses the existing `shortcutHostKey()` and URL parser; automatic artwork ownership safeguards remain.
- Removes three incorrect navigation-marker messages for separate-tab actions (right-click and middle-click). Usage counting stays intact.
- Browser background event listener registration, event filter and navigation-marker storage format remain unchanged.
- Cross-host redirects to sites that block ordinary favicon requests can no longer donate a tab-learned icon. This is an intentional safety trade-off. Same-host path changes remain inherently ambiguous.
- No changes to Sync, Recovery, permissions, data formats, locales, shortcut naming, experimental SVG code, or background-worker wakeup behavior.

## Publication status

**PRIVATE RELEASE CANDIDATE. NOT PUBLISHED.** Owner-only GitHub/store publication after independent Claude review, full release checks and real-browser validation. Mechanical results and package fingerprints are recorded in the companion verification report; this text does not claim those release gates are complete.

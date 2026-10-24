# MosaicSync 1.33.0.86 publication notes

## GitHub release title

`MosaicSync 1.33.0.86`

## Firefox Add-ons — What's new

**Sharper website icons**

MosaicSync can now discover a sharper home-screen icon on websites where a smaller browser favicon previously stopped the search too early. Existing manually selected or uploaded icons remain unchanged.

## Chrome Web Store — What's new

Improved automatic favicon quality on more websites. When a site's usual icon is small, MosaicSync can also check for a higher-resolution home-screen icon in the background. Your manually selected icons remain untouched.

## GitHub release — changes since 1.33.0.85

- Improved automatic website-icon discovery: the background quality check can try the standard `/apple-touch-icon.png` URL when the best favicon is smaller than 128 pixels.
- No extra Apple-icon probe for already-sharp icons of 128 pixels or more. Failed optional probes leave the existing artwork intact.
- No changes to permissions, telemetry, icon ranking, shortcut naming, storage formats, Sync or Recovery.

**Note:** Existing shortcuts are rechecked on their normal quality-audit schedule, not all immediately on upgrade. Sites without suitable home-screen artwork retain their existing icon.

## Mozilla Add-ons — Notes to reviewer

Version 1.33.0.86 is based on the independently audited 1.33.0.85 source (SHA-256 `e87836a5d83d74e2a6f5281ee8e6427898dbb99feb3f3a04aff9237412816a85`). The sole production behavior change is a bounded, optional favicon lookup in `src/shared/background/background-core.js` on an existing quality-preferring scan, performed only if the current best decoded favicon is below 128px. The extra request targets the same site's conventional root `/apple-touch-icon.png`; it has a 2,500ms sub-deadline and does not reopen the quality audit if unavailable. This affects neither the New Tab startup path nor manually chosen/uploaded images. No new browser permissions or third-party services were added. No Sync or Recovery code changed.

Deterministic regression fixtures reproduce the original 64px ICO/180px home-screen icon behavior for both Chrome and Firefox background implementations. The existing favicon regressions are preserved. Real-browser Chromium testing was performed independently by Claude with a local stand-in site; the live New Yorker icon URL is unverified.

## Release verification / operational notes

- Full primary tests: **1,685/1,685 PASS** in development and clean-room builds.
- Independent Claude audit: **GO**, including **25/25 adversarial tests**, deterministic packaging, and a real Chromium reproduction using a local stand-in site.
- Three release ZIPs: mechanically reproducible; see the release SHA-256 manifest for their **new** checksums (the source ZIP differs from the private audit package because these publication notes were added).
- Six GitHub exact-commit release jobs for **this new source archive**: **NOT PERFORMED** at the time of packaging. Run them after the owner uploads the release source; previous builds' CI results do not transfer automatically.
- Real signed-in two-device Sync acceptance: **NOT PERFORMED — owner-waived**, not passed.
- Known limitation: a device offline through a Sync reset can need an explicit layout choice on reconnection.

This document and the release ZIPs are prepared for publication; no GitHub or store publication is performed by this packaging step.

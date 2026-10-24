# MosaicSync 1.33.0.87 publication notes

## GitHub release title

`MosaicSync 1.33.0.87`

## Firefox Add-ons — What's new

**Neater shortcut buttons**

The four icon and image buttons in the shortcut editor are now the same size and properly aligned, even when their labels wrap onto multiple lines. The layout also adapts better to narrower windows. All existing translations are unchanged.

## Chrome Web Store — What's new

The shortcut editor's icon and image buttons now line up neatly and share the same size, including when translated labels take more than one line. Improved layout for narrow windows; no changes to your shortcuts or settings.

## GitHub release — changes since 1.33.0.86

- Equal-height, equal-width icon/image action buttons in the Add/Edit Shortcut dialog.
- Desktop layouts retain one four-column row; narrow layouts use two columns with equal-height rows.
- Button labels stay fully visible and centered regardless of wrapping. Long localized labels are not shortened or truncated.
- No new features, permissions, external requests, telemetry, or changes to naming, favicon logic, storage, Sync, Recovery or the 34 translations.

## Mozilla Add-ons — Notes to reviewer

Version 1.33.0.87 is based on the independently audited, public-release-packaged 1.33.0.86 source. The only runtime implementation change is in `src/shared/newtab/newtab-secondary.css`: two responsive desktop sections stretch icon/image action controls and reserve two lines; the narrow layout switches those controls from wrapping flexbox to a two-column, equal-row-height grid. No scripts, browser background logic, manifests' permissions, localization or data formats change. The sole manifest differences are version fields.

The main regression suite and clean-room source reproduction are release gates. Existing signed-in two-device Sync tests remain owner-waived. The six exact-commit browser checks are **not yet performed for .87**; .86 checks do not transfer automatically. Browser publication remains owner-controlled. No GitHub or store writes were performed in packaging.

## Review status

- .86 baseline: independent technical GO previously recorded.
- .87: CSS-only corrective; final mechanical tests and browser layout evidence recorded in the separate .87 verification report.
- New .87 has **not** received an independent third-party audit.
- Exact-commit GitHub release gate: **NOT PERFORMED**.
- Real signed-in two-device test: **NOT PERFORMED — owner-waived**.
- Offline-reset limitation unchanged.

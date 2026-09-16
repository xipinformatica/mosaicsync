# MosaicSync 1.30.18.41 publication notes

## Mozilla changelog

Removes the last subtle first-frame movement below a multi-row Frequently Visited strip. Hidden reservation cards and live cards now share one fixed row height in critical CSS, without adding measurements or delaying startup. No permissions, Sync/Recovery behavior or data formats changed.

## Mozilla Notes to Reviewer

MosaicSync 1.30.18.41 is a narrow first-paint presentation correction.

The existing privacy-safe bootstrap already reserved the configured number of Frequently Visited cards before shortcut paint. Its placeholder was anchored by the 24 px favicon, however, while a live card also contains title and hostname line boxes. Firefox could therefore enlarge each content-sized grid row by a few pixels during the atomic live-card replacement, producing a small downward movement most visible with two rows.

Critical CSS now gives reservation, padding and live FV cards the same explicit 48 px block size. Explicit 14 px and 12 px title/host line heights plus the existing gap, padding and borders fit that box exactly. No runtime measurement, timer, new I/O or startup wait is added. The synchronous reservation, responsive capacity, detached favicon decode, atomic commit, disabled zero-space behavior and browser-history privacy boundary are unchanged.

Three focused regressions include one that failed on untouched 1.30.18.40. No permissions, CSP, Sync, Recovery, schema, browser-adapter, localization or user-data-format change is included.

## Chrome Web Store release notes

Removes a subtle first-frame shortcut movement when Frequently Visited occupies multiple rows. Startup remains synchronous and no permissions or data formats change.

## GitHub release title

`MosaicSync 1.30.18.41`

## GitHub release description

MosaicSync 1.30.18.41 removes the last small first-frame movement beneath a multi-row Frequently Visited strip.

The hidden geometry reservation and live FV cards now share one explicit critical-CSS row height. Existing responsive capacity, favicon decode-before-commit behavior, privacy boundaries and startup optimizations remain intact.

Sync, Recovery, permissions, CSP, schemas, browser adapters and user-data formats are unchanged.

## GitHub Desktop

**Summary:** `Release MosaicSync 1.30.18.41`

**Description:** `Stabilize Frequently Visited first-frame row geometry without delaying startup.`

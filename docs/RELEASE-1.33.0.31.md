# MosaicSync 1.33.0.31 publication notes

## AMO / Chrome Web Store changelog

Adds a one-time visual tip that shows how to organize shortcuts into folders once your current Space starts filling up. The tip is only a visual guide: it never changes your shortcuts and stays out of the way when drag-and-drop ordering is unavailable.

## Mozilla Notes to Reviewer

1.33.0.31 is a narrow New Tab discoverability release over 1.33.0.30. A new lazy-loaded `newtab/folder-discovery-hint.js` module can show one device-local folder gesture demonstration when the active Space contains at least six top-level shortcuts, no folder exists in either Space, manual ordering is active, and the launcher is visible, idle and fully rendered.

The demonstration is presentation-only. It clones only the inner visual `.tile` into an inert `pointer-events:none` overlay, glides that ghost onto a neighbouring shortcut and explains that the real next step is to choose the existing “Create folder” action. It does not clone `.shortcut-slot`, carry `data-id`, move real launcher elements, create a folder, write profile state, send runtime messages, or touch Sync/Recovery data. In Recently opened order it is suppressed because production drag-and-drop is disabled there.

The one-time flag is `localStorage` key `mosaicsync.folder-hint.v1`, matching MosaicSync's existing device-local Web Storage preferences. Eligibility is freshly rechecked immediately before mount. Interaction and visibility/layout changes cancel the overlay. A direct shortcut-grid child replacement cancels the hint, while descendant favicon/preview artwork updates intentionally do not consume the one-time display. Pending mounts are generation-invalidated across the lazy stylesheet wait, and temporary eligibility failures re-arm pointer discovery rather than silently losing the page opportunity. JavaScript explicitly checks `prefers-reduced-motion: reduce`; that path shows static guidance without invoking movement animation.

No new permission, CSP, profile schema, Sync/Recovery wire format, browser floor, telemetry, network request or privacy-boundary change is introduced. Permanent behavioral/policy coverage is in `tests/feature-133031.test.mjs`.

## GitHub release title

`MosaicSync 1.33.0.31`

## GitHub release description

MosaicSync 1.33.0.31 makes folders easier to discover without adding permanent UI clutter.

- Once a Space starts filling up, MosaicSync can show a one-time visual demonstration of the drag gesture used to organize shortcuts into folders.
- The hint never changes or moves your real shortcuts.
- It respects reduced-motion preferences and never appears in Recently opened order, where drag-and-drop is disabled.
- The hint is device-local and never synchronized or tracked.

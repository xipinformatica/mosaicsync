# MosaicSync 1.33.0.33 publication notes

## AMO / Chrome Web Store changelog

Corrects the one-time folder tutorial so each step plays in the intended order and stays easy to see. The choice menu, “Create folder” step and opened-folder demonstration are now properly timed and no longer covered by the tutorial guidance.

## Mozilla Notes to Reviewer

1.33.0.33 is a narrow presentation-only corrective over the published 1.33.0.32 folder-discovery demonstration.

The 1.33.0.32 staged overlay authored keyframe offsets as wall-clock phases, but Web Animations timing-level easing warped the whole iteration and compressed those phases in real browsers. 1.33.0.33 keeps iteration-level easing linear and applies the requested easing curve per keyframe segment instead. This preserves the intended timing relationship without changing the staged DOM: ghost reaches target → target feedback → fake localized drop-choice popover → visible “Create folder” emphasis → fake folder tile → fake opened-folder panel.

The motion callout is also measured after insertion and, when viewport space permits, moved above the demonstrated shortcut pair so it does not cover the fake choice popover or folder panel. Reduced-motion behavior is unchanged and still uses the static callout/arrow/ring path with no Web Animations API movement.

The tutorial remains an inert, `aria-hidden`, `pointer-events:none` overlay. It does not invoke `showDropChoice`, `createFolderFromShortcuts`, folder opening, state persistence, browser storage, runtime messaging, Sync or Recovery APIs; the real launcher remains structurally unchanged. No new locale strings, permissions, CSP, profile schema, Sync/Recovery wire format, browser floor, telemetry, network request or privacy-boundary change is introduced.

Permanent behavioral protection is in `tests/feature-133033.test.mjs`; existing 1.33.0.31 and 1.33.0.32 tutorial isolation/lifecycle tests remain in force.

## GitHub release title

`MosaicSync 1.33.0.33`

## GitHub release description

MosaicSync 1.33.0.33 corrects the timing and placement of the one-time folder tutorial introduced in the previous releases.

- The shortcut drag, choice menu, “Create folder” emphasis, folder appearance and opened-folder demonstration now play in the intended order.
- The tutorial guidance moves above the demonstrated shortcuts when space permits, so it no longer covers the choice menu or folder panel.
- The tutorial remains entirely visual and never changes your real shortcuts or folders.
- Reduced-motion behavior is unchanged.

No Sync, Recovery, permission, CSP or profile-schema changes.

## Final certification

Full unique suite: 1363/1363 PASS. Canonical groups: Startup 285/285; New Tab 557/557; Sync 350/350; Recovery 225/225; Security 219/219; Browser/parity 281/281; Core 201/201; Release 466/466. Reachability and deterministic packaging checks are required to remain clean in the sealed artifacts.

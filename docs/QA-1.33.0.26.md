# MosaicSync 1.33.0.26 QA / release-candidate checklist

1.33.0.26 is deliberately limited to one user-facing feature over authoritative 1.33.0.25: explicit browser-bookmark drag-to-shortcut conversion from MosaicSync's Bookmarks window.

## Scope / invariants

- Browser bookmark access remains optional and lazy.
- Viewing/searching Bookmarks never copies data into MosaicSync state.
- Only an explicit HTTP(S) drag/drop creates a normal MosaicSync shortcut.
- The source browser bookmark is never moved or deleted.
- Empty Manual slots preserve the exact chosen position.
- A folder target appends the shortcut; an occupied shortcut target creates a folder rather than overwriting existing data.
- Recent ordering remains presentation-only; visual Recent empty positions are not persisted as Manual positions.
- Learned favicon/site artwork remains device-local under the existing policy.
- Cancelled/unhandled drops perform no state mutation and cannot navigate the extension page.
- No new permission, persisted schema, Sync/Recovery format or browser-floor change.

## Permanent regression

- `tests/corrective-133026.test.mjs`
- red-before-green against untouched 1.33.0.25: 0/7 PASS before implementation;
- feature regression on 1.33.0.26: 7/7 PASS.

Final canonical, focused, reachability, packaging and clean-room certification results are recorded in the release handoff/certification artifacts generated from this source.

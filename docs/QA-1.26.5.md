# MosaicSync 1.26.5 manual QA

## Critical regression: Settings must never blank/freeze

- Confirm Settings displays `MosaicSync · 1.26.5` in Firefox and Chrome and that manifest/internal/package versions match.
- Configure clearly different Light and Dark built-in wallpapers and enable **Separate light and dark wallpapers**.
- Open Settings. Repeatedly switch the appearance selector between Automatic, Dark and Light at least 30 times. The selector must keep responding; every label, button, section and scrollbar in Settings must remain painted and clickable.
- While Settings remains open, the outer page wallpaper/theme is intentionally held stable. This is the 1.26.5 paint-safety rule: do not repaint the page/root underneath the open Settings dialog.
- Close Settings. On the next frame, the final selected appearance and its matching wallpaper must apply. Reopen Settings and confirm the selected appearance persisted.
- Repeat the test with the **Separate light and dark wallpapers** switch itself: toggle it on/off repeatedly while Settings is open. Settings must remain painted. Close Settings and verify the final effective wallpaper is applied and persisted.
- With separate wallpapers enabled, click the Light and Dark visual cards and repeatedly choose different presets from the existing wallpaper gallery. Choosing the currently active appearance must not repaint the outer page until Settings closes. Choosing the inactive appearance must not disturb the current page at all. Reopen Settings and verify both selections persisted.
- In Automatic mode, change the OS/browser effective light/dark appearance while Settings is open if practical. Settings must remain stable; the deferred final MosaicSync appearance should apply after Settings closes.

## Persistence/concurrency regression

- In one New Tab, change Light/Dark wallpaper preferences while another New Tab edits an unrelated shortcut or Settings field. Both edits must survive; no shortcut, folder, local artwork or unrelated setting may be lost.
- With Sync enabled/initialized, make a theme-wallpaper preference change and confirm the ordinary Sync mutation path still publishes it to another MosaicSync browser session.
- Confirm there is no extra delay/freeze from rebuilding artwork caches when changing only theme-wallpaper preset IDs.

## Retained 1.26.3 behavior

- Light and Dark wallpaper selectors remain visual preview cards, not native selects.
- Bookmark folder colors still fill the full folder surface with readable contrast and remain device-local.
- Settings and Welcome retain the GitHub link between MPL 2.0 and Support.
- Normal background preset, plain-color, dimming and custom uploaded wallpaper controls still behave as before.
- Firefox and Chrome permissions, state schema 17, Sync schema 9 and profile format v2 are unchanged.

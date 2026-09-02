# MosaicSync 1.26.2 manual QA

- Settings displays `MosaicSync · 1.26.2` in Firefox and Chrome; manifests/internal VERSION/package names all match.
- Open Bookmarks, right-click several folders, click each color and Reset. The palette is clickable above the modal, the folder accent updates immediately, survives closing/reopening Bookmarks, and does not alter bookmark titles/URLs/tree structure.
- With an image-heavy profile, repeatedly enable/disable Separate light and dark wallpapers. The switch and Settings close/scroll controls remain responsive; the preference survives reopening Settings.
- Change the currently active theme wallpaper and verify only that visible preset changes after preload. Change the inactive theme selection and verify the page does not redraw until appearance changes.
- Rapidly change Light/Dark selectors and confirm the final choice persists.
- Repeat the bookmark and wallpaper checks in Firefox and Chrome.

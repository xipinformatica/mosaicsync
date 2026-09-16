# MosaicSync 1.30.11 publication notes

## Scope

Focused Settings appearance regression fix on top of 1.30.10. Wallpaper and darkness controls again provide real-time visual feedback while Settings is open, without restoring the compositor-sensitive behavior of repainting the real full-screen page underneath the Settings surface.

## Mozilla Developer Hub changelog

Fixed a Settings appearance regression where changing the wallpaper or background darkness was saved immediately but did not become visible until Settings closed. MosaicSync now restores live wallpaper/darkness feedback through an isolated paint-contained preview layer while keeping the authoritative full-screen page wallpaper and root dim values frozen under the open Settings panel. Normal wallpaper changes, the main darkness slider, separate Light/Dark wallpaper selection and active Light/Dark darkness all preview immediately; closing Settings performs the existing single deferred authoritative commit. No new permissions, Sync/profile schema changes, telemetry, backend, remote code or CSP relaxation.

## Notes to Reviewer

1.30.11 is a narrow UI regression correction. The 1.30 Settings safety rule remains: Firefox/Linux has shown a compositor failure mode where changing the real full-viewport page/root paint while the Settings surface is open can leave Settings descendants blank/white although JavaScript continues running. This release therefore does **not** remove the Settings-open guard and does not repaint `.page` directly.

The fix restores the previously proven isolated preview architecture. `#appearancePreviewLayer` is the first child of `#page`; while Settings is open, `applyPageBackgroundVisual()` resolves the requested color/wallpaper/dim but writes them only to that preview surface. The wallpaper is assigned to a plain `<img>` (`object-fit: cover`), the layer uses `contain: paint`, and darkness uses the private `--appearance-preview-dim` overlay. The real `.page` `backgroundColor`/`backgroundImage`, root `--page-bg`, root `--background-dim` and authoritative canvas-text state are not touched until after Settings closes.

The preview CSS is in `newtab-secondary.css`, not the blocking first-frame stylesheet. `openSettings()` already awaits secondary-style loading before exposing Settings, so the correction does not increase critical launcher CSS. Direct appearance gestures can update the preview immediately, while external storage/Sync reconciliation remains deferred and paint-free under Settings.

The existing close lifecycle is preserved: `closeSettingsPanel()` hides Settings and schedules `commitDeferredLauncherVisual()` on the next animation frame. That normal `applySettings()` call writes the authoritative page/root appearance and then clears the preview. The existing reopen-before-rAF guard still prevents a stale post-close commit if Settings is reopened immediately.

Regression coverage runs on both generated Firefox and Chrome trees and verifies preview DOM/CSS structure, real-page/root paint isolation, live Light/Dark selection, post-close commit/cleanup, critical-CSS budget separation and external-state paint deferral. Sync algorithms, the 1.30.10 verified snapshot decode cache, storage/profile schemas, permissions, navigation/CSP and privacy behavior are unchanged.

## GitHub release title

`MosaicSync 1.30.11`

## GitHub release description

MosaicSync 1.30.11 fixes the Settings wallpaper/darkness live-preview regression. Appearance changes are visible immediately again, but the real full-screen page remains frozen while Settings is open; a separate paint-contained preview layer shows the requested wallpaper and dim level, and the existing deferred close path commits it authoritatively afterward. This preserves the Firefox/Linux white-Settings compositor workaround while restoring the expected real-time UX. No Sync/schema/permission/privacy changes.

## GitHub Desktop commit

**Summary:** `Release MosaicSync 1.30.11`

**Description:** `Restore live Settings wallpaper/darkness preview through the isolated paint-contained image layer while keeping real page/root paint frozen until the deferred post-close commit. Add Firefox/Chrome regressions and preserve all Sync, cache, permission and security behavior.`

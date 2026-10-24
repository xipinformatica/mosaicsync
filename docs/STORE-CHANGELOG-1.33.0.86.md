# MosaicSync 1.33.0.86 — Store changelogs

These notes describe changes since **1.33.0.85**. If a particular store currently serves an earlier version, use the cumulative earlier release notes as well.

## Firefox Add-ons — Release Notes

**What's new in 1.33.0.86**

MosaicSync can now find sharper website icons on more sites. When a website's usual favicon is too small, it can also look for a larger home-screen icon during its background quality check. Icons you selected or uploaded yourself remain unchanged.

## Chrome Web Store — What's New

**Version 1.33.0.86**

Sharper website icons on more sites! MosaicSync now checks for better home-screen artwork when a site's normal favicon is small. Your manually selected icons stay exactly as they are.

## GitHub Release — Changelog

### MosaicSync 1.33.0.86

**Improved automatic website icons**

- Can find a sharper home-screen icon when a small favicon would previously have stopped automatic discovery.
- Checks one additional conventional icon location during an existing background quality pass, only for artwork under 128px.
- Keeps existing icons when no better option is available and preserves manually selected or uploaded images.
- No new permissions, telemetry, storage formats, Sync or Recovery changes.

Existing icons may improve on their next scheduled quality check. The update does not immediately rescan every existing shortcut.

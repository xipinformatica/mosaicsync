# MosaicSync Privacy

Last updated: 25 August 2026

MosaicSync is designed to work without a MosaicSync account, MosaicSync cloud service, advertising SDK, analytics service or telemetry backend.

This document describes the privacy behavior of the open-source MosaicSync browser extension. Browser-vendor services such as Firefox Sync or Chrome Sync are governed by the browser vendor's own privacy terms.

## Data MosaicSync stores

Depending on the features you use, MosaicSync can store:

- shortcuts, folders, Spaces and layout/settings data;
- local artwork such as favicons, uploaded images and wallpaper assets;
- device-local preferences and maintenance metadata;
- profile backup/transfer data when you explicitly export a `.mosaicsync` profile.

The canonical application state is stored using browser extension storage APIs.

Large image assets are kept as content-addressed local assets rather than being placed in the small synchronized layout core. A user-created MosaicSync profile backup can include the assets required to reproduce that profile. This includes automatically learned/browser-native favicons when they are part of the profile being exported; those favicon pixels remain excluded from ordinary browser Sync.

## Synchronization

When synchronization is enabled, MosaicSync uses the browser's native extension-sync facilities where supported.

MosaicSync does **not** operate a separate synchronization server and does not require a MosaicSync account.

Data sent through Firefox Sync or Chrome Sync is handled by Mozilla or Google respectively according to their services and privacy policies.

## Frequently Visited

The Frequently Visited feature is optional and uses the browser's top-sites/history-derived API after the relevant permission is granted.

Frequently Visited suggestions are used to display suggestions inside MosaicSync. To keep New Tab startup visually stable, MosaicSync can keep a small bounded snapshot of the last displayed suggestions in the browser profile as disposable device-local render data. Sites explicitly hidden from this section are remembered as a bounded device-local domain list. Neither the browsing-derived suggestion snapshot nor the hidden-domain list is included in ordinary MosaicSync Sync data.

The user-facing **Show Frequently Visited** preference and the selected **Count** (3/5/8/10) are normal MosaicSync profile settings and can synchronize between the user's MosaicSync computers. The actual site list, browser history/top-sites data and the optional Top Sites permission remain device-local. A receiving device whose synchronized preference is ON may therefore ask the user to grant its own local browser permission before it can display that device's suggestions.

MosaicSync does not send the browsing-derived list to a MosaicSync server because no such server exists.

## Bookmarks

Bookmark access is optional and requested from a user gesture.

MosaicSync can display browser bookmark folders and can create a normal HTTP(S) bookmark when the user explicitly asks it to. Displayed bookmarks are not copied into MosaicSync's synchronized shortcut dataset merely by viewing them.

Device-local bookmark-folder color preferences are local presentation metadata.

## Website access and favicons

MosaicSync can request optional access to HTTP(S) websites for automatic favicon/icon discovery.

When that permission is available, MosaicSync may make direct requests to the website associated with a shortcut, or to icon resources declared by that website, in order to discover artwork. Those requests go to the relevant website/resource host, not to a MosaicSync-operated favicon proxy or analytics service.

Remote image and SVG handling is subject to validation and size/safety limits in the source code.

Automatic favicon recovery may keep bounded device-local retry metadata, including the last local failure/capability reason and attempt time, so MosaicSync can distinguish a missing permission from a network or parser failure. This metadata is not synchronized, included in `.mosaicsync` profile exports, or transmitted to the developer.

## Custom images and profile files

Images selected by the user are processed and stored by the extension using browser-local storage.

Exporting a MosaicSync profile creates a file under the user's control. Import happens locally in the extension and is protected by format, asset-integrity and size validation.

## Analytics and telemetry

MosaicSync contains no MosaicSync analytics or telemetry service.

Local performance instrumentation used during development does not send telemetry or perform networking.

## External links

MosaicSync contains user-activated links such as the project website, GitHub, support email and Ko-fi. Opening an external link is a normal browser navigation to that third party, whose privacy policy then applies.

## Permissions

The exact permissions are visible in the browser manifests under:

- `src/firefox/manifest.json`
- `src/chrome/manifest.json`

Required permissions support core extension storage/background operation. Optional permissions support features such as bookmarks, Frequently Visited and website favicon discovery.

## Contact

Privacy questions can be sent to:

**mosaicsync@xipinformatica.cat**

The source code is public at:

https://github.com/xipinformatica/mosaicsync


# MosaicSync 1.30.18.45 publication notes

## Mozilla changelog

Tightens two New Tab editing/presentation details. Folder popover shortcut tiles now sit substantially closer to the title row by removing accumulated vertical padding without changing tile size, columns, labels or footer controls. In the shortcut editor, changing **Image style** between fit-inside and fill-tile now updates the artwork preview immediately, including the compact laptop layout where a more-specific image-size rule previously masked cover mode until Save. No permissions, CSP, Sync/Recovery, localization, state/profile schema or user-data-format changes.

## Mozilla Notes to Reviewer

MosaicSync 1.30.18.45 is a tightly scoped New Tab UI corrective release on top of certified 1.30.18.44. It changes two reproduced presentation behaviors only.

### Folder popover vertical density

The folder header, three-column item grid and each item card independently contributed top/bottom padding. Their combined spacing left approximately 24 px between the header content and shortcut artwork. 1.30.18.45 reduces only those vertical padding values (`folder-header` bottom, `folder-items` top and `folder-item-card` top), removing roughly 15 px of dead space. Folder title/close placement, tile dimensions, horizontal gap, label metrics, footer actions, scrolling limits and drag/drop behavior are unchanged.

### Live Image style preview

The editor already called `updateImagePreview()` on `shortcutImageStyle` change, and that function toggled the `cover` class immediately. On normal layouts the base `.image-preview.cover img` rule could therefore render fill-tile live. On wide-but-short laptop layouts, however, the later `#shortcutDialog .image-preview img` compact-size rule had greater selector specificity and kept the image at the compact contain dimensions even after the `cover` class changed. Saving the shortcut then rendered the final tile with its normal cover rule, making the option appear non-live.

1.30.18.45 adds a cover-specific dialog selector so cover mode outranks the compact image-size rule. Removing cover immediately returns to the existing compact contain dimensions. No state mutation occurs until the existing Save path; this is presentation-only preview behavior.

Two permanent corrective regressions were first run against untouched 1.30.18.44 and failed 2/2 as required. They pin the reduced folder spacing and the live preview event/class/CSS-specificity contract. The full project suite remains green after the changes.

No permissions, host permissions, CSP, Sync/Recovery behavior, localization catalog, state/profile schema, browser-adapter behavior, telemetry, remote code or user-data-format changes.

## Chrome Web Store release notes

Folder shortcut tiles now sit closer to the folder title, and the shortcut editor previews Fit inside / Fill tile image-style changes immediately before Save, including compact laptop layouts. No new permissions.

## GitHub release title

`MosaicSync 1.30.18.45`

## GitHub release description

MosaicSync 1.30.18.45 is a small New Tab UI corrective release.

Folder popovers remove excess vertical dead space above shortcut tiles while preserving the existing title, tile sizes, columns, labels and footer controls. The shortcut editor also updates its artwork preview immediately when switching Image style between fit-inside and fill-tile; a compact-layout CSS specificity conflict that previously hid the live cover preview has been corrected.

No Sync, Recovery, permissions, CSP, localization, state/profile schema or user-data-format changes.

## GitHub Desktop

**Summary:** `Release MosaicSync 1.30.18.45`

**Description:** `Tighten folder spacing and make image-style preview live.`

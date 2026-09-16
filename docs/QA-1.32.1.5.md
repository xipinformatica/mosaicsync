# MosaicSync 1.32.1.5 QA / release-candidate checklist

## Scope

Narrow New Tab UI corrective over 1.32.1.4. No Normal Sync/Recovery algorithm, persisted-state schema, profile-format, permission, CSP or browser-floor changes.

## Corrective invariants

- Latest synchronized-change authorship remains separate from incoming-receipt timing.
- Exact receipt provenance shows the friendly synchronized device name when available.
- Collaborative/non-exact provenance never invents one sending device.
- Folder item scrollbars appear only for genuine content overflow within the viewport-bounded panel.
- Recovery safety copies, Custom Branding and Wallpaper Gallery are Settings-owned child dialogs; interacting with or closing a child leaves Settings open.
- Escape/outside-click still closes Settings normally when no Settings-owned child dialog is open.

## Permanent regressions

`tests/corrective-13215.test.mjs` protects exact/collaborative receipt wording, all-locale coverage, folder flex/overflow ownership and Settings child-dialog ownership. Historical receipt-attribution tests were updated only for the intentional collaborative wording change.

## Final automated verification

Full/focused tests, size baseline, benchmark, reachability, mechanical certification and clean-room artifact reproduction are recorded after the publication tree is frozen.

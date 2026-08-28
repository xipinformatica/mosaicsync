# MosaicSync 1.30.16 publication notes

## Mozilla Developer Hub changelog

Corrects browser/store declarations: Firefox is desktop-only, Chrome now declares its supported API floor, and release-contract checks prevent unapproved manifest/permission drift. No runtime feature, permission, Sync schema, telemetry or backend change.

## Notes to Reviewer

1.30.16 is manifest/release-contract hardening. Firefox removes the unintended `gecko_android` declaration; Chrome adds `minimum_chrome_version: 104` for its MV3 favicon API. Existing optional Firefox Sync data categories are retained and documented. Runtime Sync/state schemas and permissions are unchanged.

## GitHub release title

`MosaicSync 1.30.16`

## GitHub release description

MosaicSync 1.30.16 hardens the browser/store release contract. Firefox no longer advertises unsupported Android compatibility, Chrome explicitly declares its real API floor, and deterministic package checks now reject unapproved capabilities, permissions, development identity and fixed external endpoints. Privacy documentation also clarifies Mozilla's Firefox Sync data-category wording without changing MosaicSync's no-telemetry/no-backend model.

## GitHub Desktop

**Summary:** `Release MosaicSync 1.30.16`

**Description:** `Harden Firefox/Chrome manifest contracts, remove accidental Android support declaration, and add deterministic release-surface checks.`

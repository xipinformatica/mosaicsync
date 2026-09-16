# MosaicSync 1.30.1 publication notes

## Public predecessor

MosaicSync 1.30.1 is the direct public successor to 1.27.9. The unpublished 1.30 release candidate is folded into this release.

## Mozilla changelog

Snow Leopard corrective maintenance release: fixes the remaining Settings blank-panel path by avoiding redundant own-write/global Settings reconstruction, completes bounded automatic favicon quality auditing so later better artwork can replace a quick low-resolution icon, filters permission-event work by feature, clarifies Sync source/receipt wording, removes obsolete Sync/CSS baggage, refreshes translations, and adds Galician. No new permissions, Sync/profile/storage schemas, CSP, telemetry, or remote code.

## Notes to Reviewer

Corrective maintenance release. It fixes redundant Settings DOM refreshes that could blank the open panel, completes bounded automatic favicon quality upgrading, filters permission-event handling, and adds Galician. No permission, schema or CSP changes.

## Chrome release notes

Corrective maintenance release with targeted Settings refreshes, a one-time bounded high-quality favicon audit, permission-event isolation, clearer Sync wording, Galician support, and dead-code/CSS cleanup. No new permissions.

## GitHub release title

`MosaicSync 1.30.1`

## GitHub release description

MosaicSync 1.30.1 completes the 1.30 Snow Leopard work before publication. Open Settings now refreshes only the UI domain that actually changed and absorbs exact own-write echoes without rebuilding unrelated controls. Automatic favicons keep the fast first result but receive a bounded complete quality audit and upgrade when better site artwork is available. Permission events are isolated by feature; Sync wording/recovery coverage, localization cleanup, Galician support, and dead-code/CSS sanitation from the unpublished 1.30 candidate are included. Existing permissions, schemas, CSP and security boundaries remain unchanged.

# MosaicSync 1.30.18.1 publication notes

## Mozilla Developer Hub changelog

Hardens first-paint cache authority so stale cached shortcuts cannot become actionable before authoritative local state is verified. Non-Personal cache paint is guarded, boot-cached launcher/Frequently Visited content stays inert until its own handoff, and disabled-Spaces manifests project Personal. No Sync/state schema, permission, telemetry or backend change.

## Notes to Reviewer

1.30.18.1 is a narrow first-paint cache-safety follow-up to 1.30.18. `storage.local` remains authoritative: non-Personal session cache use is checked against the already-running raw local read; synchronous localStorage boot manifests do not paint Work; cached shortcut/Frequently-Visited controls are inert until authoritative validation/repaint; and startup failure discards still-unverified cached targets. The render-manifest writer projects Personal while Multiple Spaces is disabled and folder adoption additionally verifies child titles/URLs. No Sync/state schema or permission changes.

## GitHub release title

`MosaicSync 1.30.18.1`

## GitHub release description

MosaicSync 1.30.18.1 makes first-paint caches visual-only until authoritative state verifies them. It closes stale Work/session and boot-manifest windows, prevents cached shortcut/Frequently Visited navigation before validation, and strengthens safe boot-grid adoption without changing Sync schemas or permissions.

## GitHub Desktop

**Summary:** `Release MosaicSync 1.30.18.1`

**Description:** `Harden first-paint cache authority and prevent stale cached launcher interaction.`

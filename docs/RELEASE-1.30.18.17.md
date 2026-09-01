# MosaicSync 1.30.18.17 publication notes

## Mozilla Developer Hub changelog

Step 3.2 maintainability release. Consolidates remaining browser-neutral source ownership around the shared background entrypoint, New Tab shell, manifest-localization generation and common permission policy while preserving thin Firefox/Chromium capability boundaries. No product features, permission-set, CSP, Sync/Recovery schema, privacy-boundary or UI behavior changes.

## Notes to Reviewer

This is a zero-feature architecture/refinement release built from the certified 1.30.18.16 source. The identical background entrypoint and New Tab DOM now have one canonical shared source owner; Chromium's existing browser shim is injected deterministically into its generated New Tab shell at the same position as before. The 33 Firefox/Chrome manifest `_locales` wrappers are generated from one reviewed registry while retaining explicit browser-specific descriptions. Common Top Sites/HTTP(S) permission policy is shared, with Firefox data-collection consent/revoke and Chromium's no-op Sync-permission behavior kept in a tiny browser capability module.

Before the release-version bump, the generated background entrypoint, New Tab HTML and all manifest locale files were byte-for-byte identical to the live 1.30.18.16 runtime. The only intentional runtime structural change is the permission-policy split; regressions verify Firefox still performs its gesture-bound data-collection permission request and Chromium still performs no Sync permission request/revoke. No manifest permission, CSP, state/meta/Sync/Recovery schema, first-paint/cache/session ownership, Frequently Visited persistence, favicon Sync policy, telemetry/backend or product/UI behavior change.

## Chrome Web Store release notes

Maintainability/refinement update consolidating shared Firefox/Chromium source ownership and permission-policy boundaries. No new features or permissions.

## GitHub release title

`MosaicSync 1.30.18.17`

## GitHub release description

MosaicSync 1.30.18.17 completes Step 3.2 of the maintainability program: consolidating the remaining safe Firefox/Chromium duplication without changing product behavior.

The identical background entrypoint and New Tab DOM now have one canonical shared source owner. Chrome's required `browser` compatibility shim is inserted deterministically during the build, preserving its existing startup order while Firefox receives no additional first-paint script. Browser manifest-localization wrappers are generated from one reviewed 33-locale registry, removing parallel file ownership while preserving explicit Firefox/Chrome descriptions.

Common Top Sites and optional web-origin permission policy is now shared. The genuine capability difference stays isolated: Firefox owns its data-collection consent/revoke implementation, while Chromium keeps the existing no-op Sync-permission contract. Firefox/Chromium manifests, favicon/background adapters, Chrome's platform/i18n adapters and browser shim remain separate because they encode real browser behavior.

This release adds permanent Step 3.2 ownership and behavioral regressions. No new feature, permission-set, CSP, state/meta/Sync/Recovery schema, first-paint/cache/session ownership, Frequently Visited persistence, automatic favicon Sync policy, telemetry/backend or UI behavior change is introduced.

## GitHub Desktop commit

**Summary:** `Release MosaicSync 1.30.18.17`

**Description:** Complete Step 3.2 browser-boundary consolidation with canonical shared shells, generated manifest locales and a shared permission-policy seam; preserve existing Firefox/Chromium behavior.

# MosaicSync 1.30.18.16 publication notes

## Mozilla Developer Hub changelog

- Hardened Firefox/Chromium background-adapter parity with production-runtime coverage for browser-native favicon recovery.
- Added a Firefox regression that proves a matching open tab can supply its cached favicon without falling through to website/network discovery.
- Added a Firefox regression for the real `tabs.onUpdated` shortcut-visit favicon-learning path and a Chromium regression preserving protected Chrome Web Store `_favicon` behavior.
- No product feature, Sync/Recovery/state/meta schema, Step-2 first-paint/cache ownership, permission, CSP, telemetry or backend change.

## Notes to Reviewer

MosaicSync 1.30.18.16 is a narrow post-audit hardening release for the Step 3.1 shared-background architecture introduced in 1.30.18.15. Two independent source audits found no production defect but identified one missing behavioral lock: existing favicon tests could mock the browser adapter and therefore did not prove the real shared-core-to-adapter capability contract on Firefox.

This release adds production-runtime scenarios that load the generated Firefox/Chromium backgrounds with their real adapters. Firefox now has explicit coverage for open-tab cached favicon recovery with all network fallbacks forbidden, and for the actual `tabs.onUpdated` expected-navigation learning chain. Chromium additionally verifies that Chrome Web Store favicon learning stays on the browser-local `_favicon` path and does not retain/fetch protected remote favicon provenance.

The production favicon implementation is intentionally unchanged because the new tests confirm that 1.30.18.15 already forwards the required adapter capabilities correctly. The two intentional `permissions.onRemoved` listeners remain unchanged. There are no permission, CSP, state/meta/Sync/Recovery schema, telemetry, backend, or Step-2 ownership changes.

## GitHub release title

`MosaicSync 1.30.18.16`

## GitHub release body

MosaicSync 1.30.18.16 hardens the browser-adapter boundary introduced by the shared Firefox/Chromium background core in 1.30.18.15. It adds real production-runtime regressions for Firefox open-tab cached favicon recovery, Firefox shortcut-visit favicon learning through `tabs.onUpdated`, and Chromium's protected Chrome Web Store `_favicon` path.

The audits found the shipped production wiring already correct, so this release deliberately changes no favicon policy or product behavior. It locks the boundary before further Step-3 consolidation work continues.

No feature, permission, CSP, state/meta/Sync/Recovery schema, telemetry, backend, or Step-2 first-paint/cache ownership change.

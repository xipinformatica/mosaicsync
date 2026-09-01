# Step 3.1 adapter-audit closure — 1.30.18.16

Two independent post-1.30.18.15 audits found the shared Firefox/Chromium background extraction sound and identified the same remaining test blind spot: real Firefox native favicon capabilities were not fully executed through the production shared-core-to-adapter seam.

1.30.18.16 closes that blind spot with production-runtime regressions for Firefox open-tab cached favicon recovery, Firefox expected-navigation `tabs.onUpdated` learning, and Chromium protected Chrome Web Store `_favicon` handling. The tests deliberately preserve the 1.30.18.15 production implementation because inspection confirmed the capability wiring was already correct.

This is a behavioral-lock release before further Step-3 extraction. It does not reopen Step 2 or modify Sync/Recovery/state/meta schemas, permissions, CSP, telemetry or backend behavior.

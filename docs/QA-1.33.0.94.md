# MosaicSync 1.33.0.94 QA / release-candidate checklist

**PRIVATE CANDIDATE — do not publish before independent Claude audit and exact-commit CI.**

Baseline canonical 1.33.0.93 source SHA-256 `f2bbc8018d75d73cc95efc9b73b5f23cf98384e36bdb8296735f205402843c8d`.

Scope: presentation and read-only status fields; all Sync/Recovery writes, cleanup policies, quotas, storage keys, formats, permissions, network, telemetry, and reset authority stay unchanged. `DEVELOPER-GUIDE.md` unchanged.

Checks: 1/2 copy labels across languages, newest badge not duplicated, Firefox 100/512 item display accounting (rows sum to quota bytes), Chrome unchanged, warning advice shown only when the actual old-device removal plan is mature and permitted, with the button hidden otherwise; existing explicit-choice details with complete/partial/no remote copy remain unchanged, locale parity, full automated suite and existing Recovery/Sync suites, inventory, reachability, release contracts, reproducible stock-zlib packages, browser smoke and visual screenshots.

**Claude correction round:** The original .94 draft incorrectly replaced the no-complete-cloud-copy detail; the corrected candidate restores the .93 wording. Maturity and own-device fallback eligibility are now checked using the same read-only `planManualRecoveryCleanup(mode: "device")` decision as the actual "Remove device copies" button, using the Sync namespace already fetched. Ineligible copies produce no advice. Even with a mature removable old-device copy, the hint stays hidden if the already-reported Sync usage plus a conservative estimate of this computer's fresh safety-copy publication would exceed bytes or item quota; this does not change whether the button itself exists or whether Recovery ultimately authorizes removal. A very-near-full condition is exercised in the existing Chrome and Firefox background harness scenarios. The existing Recovery dialog title, introduction, Sync storage eyebrow and accessible close-button label are translated **on the Manage click**, avoiding additional startup DOM lookups. English/French/Finnish/Dutch and all remaining locale count nouns align with Recovery terminology; the advice inserts the existing translated Manage label via `{action}`. No change to destructive cleanup or its authorization.

**Important limit:** The available/partial/none source-choice detail from .93 is unchanged. Do not claim a cloud copy is verified when it is partial. Capture actual Firefox and Chrome screenshots before final GO.

# MosaicSync 1.32.0.10 QA / release-candidate checklist

## Scope

Narrow post-freeze feature from 1.32.0.9: user-visible management of immutable complete Recovery safety generations to relieve Sync quota pressure. No structural maintainability extraction.

## Permanent 1.32.0.10 regressions

- `tests/corrective-132010.test.mjs`
- Untouched 1.32.0.9 red proof: the initial five manager/policy/source-contract cases fail 0/5 because the feature does not exist.
- Candidate coverage additionally guards torn/unverified generations, current-device fallback ownership for whole-device deletion, destructive-action revalidation, privileged deletion ownership and DOM-safe lazy rendering.

## Safety contract

- Only verified complete Recovery generations can enter the manual management model.
- Safe cleanup removes only superseded generations and preserves every device's newest verified complete generation.
- Individual deletion cannot target a device's newest verified complete generation.
- Whole-device deletion cannot target the current device and requires the current device itself to retain a verified complete Recovery fallback.
- Eligibility is rebuilt from a fresh Sync view immediately before deletion.
- Destructive removal uses `removeSyncItems()`; New Tab cannot delete Sync keys directly.
- Torn/incomplete/orphan generations remain cleanup-only/unmanaged and are not manually targetable.
- Live layout/settings, pending cumulative/cross-Space Sync journals and reset authority are outside the manual cleanup surface.
- Recovery and Normal Sync remain separate.

## Performance / UI contract

- Manager data loads only after the user opens the Recovery manager.
- No first-paint/startup storage read, await, image decode, network work or additional normal Sync write.
- Dynamic device/copy metadata is rendered with DOM nodes / `textContent`, not `innerHTML`.

## Final certification

- Full regression suite: **1102 / 1102 passing**.
- Startup / first-paint group: **168 / 168 passing**.
- New Tab group: **343 / 343 passing**.
- Sync group: **238 / 238 passing**.
- Recovery group: **137 / 137 passing**.
- Security group: **113 / 113 passing**.
- Browser/parity group: **178 / 178 passing**.
- Core group: **115 / 115 passing**.
- Release group: **213 / 213 passing**.
- Dedicated feature regressions + adversarial audit: **18 / 18 passing**.
- Runtime reachability: clean.
- Performance benchmark: pass.
- Package-size contract: pass with consciously updated 1.32.0.10 baseline.
- Measured deflated runtime payload: Firefox **685,385 bytes**; Chrome **699,902 bytes**.
- Final artifact hashes are recorded in the external certification report/SHA256SUMS generated after deterministic packaging.
- Real-browser smoke remains unavailable unless a usable browser/driver pair is present; do not claim it otherwise.

# MosaicSync 1.30.18.3 QA / release-candidate checklist

## Automated gates

- [x] Full Node regression suite passes from the final source.
- [x] Benchmark and package-size guards pass.
- [x] Firefox/Chrome/source package versions are exactly `1.30.18.3`.
- [x] Clean GitHub-ready extraction reproduces the same public packages byte-for-byte.
- [x] Release-contract scanner accepts both built runtime trees and both public browser ZIPs.

## 1.30.18.3 regressions

- [x] Two recovery publications with the same copied `deviceId` but different commits use different root keys and different chunk namespaces on Firefox and Chrome.
- [x] New complete-profile publications never target/overwrite the legacy fixed per-device recovery root.
- [x] New generation chunks commit before their immutable root becomes authoritative.
- [x] A failed immutable-root commit removes only the failed generation's chunks and leaves the previous complete recovery generation intact.
- [x] Legacy fixed-root `a/b` device snapshots remain readable through the existing decoder path.
- [x] Own-device recovery selection scans valid generations rather than assuming one fixed root.
- [x] Recovery cleanup understands multiple generations and remains bounded to two complete generations per logical `deviceId`.
- [x] Stable `meta.deviceId` remains the identity for ordinary Sync records, Settings records and dataset origin/tie semantics.
- [x] `DEVICE_SNAPSHOT_SCHEMA_VERSION` remains 2, `META_SCHEMA_VERSION` remains 12 and `SYNC_SCHEMA_VERSION` remains 11.
- [x] Seeded three-device catastrophic-loss recovery stress still converges on Firefox and Chrome without local data loss.
- [x] No new permissions, UI strings, CSP relaxation, telemetry or backend behavior are introduced.

## Manual acceptance

- [ ] Upgrade an existing profile with a legacy recovery root, make a normal edit, and confirm Sync remains Ready/Protected and the new immutable recovery generation is created without deleting the usable legacy fallback immediately.
- [ ] Clone/restore the same browser profile into two separate test installations so both begin with the same MosaicSync `deviceId`; make different edits on both and confirm both can publish recovery generations without writing the same root/chunk keys.
- [ ] Let both installations receive each other's Sync data and confirm Personal + Work converge without losing either edit.
- [ ] Force/observe a recovery-snapshot quota failure during a new generation and confirm ordinary Sync remains healthy while the previous complete recovery generation stays usable and protection is reported as limited.
- [ ] Confirm Frequently Visited permission recovery, Settings behavior, favicon handling and first-paint behavior are unchanged from 1.30.18.2.

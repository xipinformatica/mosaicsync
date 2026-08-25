# MosaicSync 1.27.8.1 QA / distributed Sync hardening checklist

## Release identity
- [x] Firefox manifest version = `1.27.8.1`.
- [x] Chrome manifest version + `version_name` = `1.27.8.1`.
- [x] Shared `VERSION`, visible Settings label, README, CHANGELOG and build manifest = `1.27.8.1`.

## Recovery-protection observability
- [x] Successful complete-profile publication records `syncProfileProtection = protected`.
- [x] Quota/too-large publication records `syncProfileProtection = limited` without changing an otherwise healthy ordinary Sync status from Ready.
- [x] Work-only mutation preserves the localized recovery-snapshot warning on quota failure.
- [x] Bootstrap, Personal, Work, cross-Space and reconciliation paths all propagate profile-publication outcome.

## Distributed two-computer behavior
- [x] Firefox: computer A publishes populated Personal+Work; computer B receives Personal + partial Work and remains Waiting.
- [x] Chrome: same scenario.
- [x] A local Work shortcut created on waiting B is not published before baseline completion.
- [x] Remaining Work delivery with no `storage.onChanged` is detected by the Sync watchdog.
- [x] B restores complete remote data, preserves its local shortcut, becomes Ready only after Work is applied, and publishes a complete protection generation.
- [x] A later converges to B's new shortcut without losing its existing Personal/Work records.

## Root-last fault injection
- [x] Firefox/Chrome: after target-slot chunks are written, force quota failure on the new root.
- [x] Previous root/commit stays authoritative.
- [x] Failed target-slot chunks are removed.
- [x] Ordinary Work ledger still contains the new edit.
- [x] Recovery protection is marked Limited.

## Final validation
- [x] Full Node test suite passes.
- [x] Performance bench passes.
- [x] Package-size baseline regenerated from final runtime.
- [x] Clean source extraction rebuilds byte-identical Firefox/Chrome ZIPs.

## Automated result
- Full regression suite: **423/423 passing**.
- Distributed production-background simulations: Firefox + Chrome passing.
- Production quota/root-flip fault injection: Firefox + Chrome passing.
- Performance benchmark completed successfully.

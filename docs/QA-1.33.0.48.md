# MosaicSync 1.33.0.48 QA / release-candidate checklist

## Scope
Neofix 4 restructuring-only candidate from the **exact** .47 source archive (`f6848cdd27965f09…`).

Six New Tab persistence calls are delegated through `src/shared/newtab/persistence-gateway.js`. The gateway preserves the exact options object shape and uses the same original core writer. No new storage reads, retries, failure classification, serialization or state adoption. Caller-specific UI and rollback logic remains in `newtab.js`.

## Mandatory checks
1. Confirm source difference against .47: only the new gateway, six call sites, release metadata, tests and documentation. **Any intentional observable behavior difference = HOLD.**
2. Run the gateway equivalence test across standard user saves, cache-only changes, cross-Space moves, migration and guarded imports; verify exact object keys, error identity, Promise timing and that the writer is called once per commit.
3. Run complete regression suite including concurrent-device Sync/Recovery and historical unsaved-edit tests; static regressions may be updated to inspect the moved code but must preserve their substantive assertions.
4. Run focused Startup, New Tab, Sync, Recovery, Security, Browser, Core and Release suites, release contracts, inventory, runtime reachability and package-size checks.
5. Independently rebuild all ZIPs from GitHub-ready source and compare them **byte for byte**. Explicitly review that Firefox/Chrome permissions, CSP and schema are unchanged.
6. Run the GitHub Actions browser certification matrix on the **exact commit**, requiring current/old Chromium and Firefox as well as `RELEASE GATE` success; absence of evidence is NOT a pass.
7. Obtain Claude's independent architecture/parity GO before publication.

## Measured startup tradeoff
One new static module (23 → 24) contains the small persistence gateway. The UI and storage behavior are unchanged; startup module-count budget is explicitly adjusted by exactly one, not removed.

## Non-goals
No favicon-service extraction, no UI changes, no new features, no Normal Sync/Recovery refactor and no remediation of historically poisoned cloud peers.

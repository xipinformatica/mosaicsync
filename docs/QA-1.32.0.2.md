# MosaicSync 1.32.0.2 QA / release-candidate checklist

## Scope

Continue the **3rd Maintainability Journey — Ownership & Auditability** from certified MosaicSync 1.32.0.1. Step 3 is one mechanical ownership extraction only: move safe background-side durable pending Normal Sync journal storage mechanics out of `background-core.js` without moving atomic initial journal creation, retry/publication orchestration, reconciliation or Recovery.

Authoritative base source SHA-256:

`8583ec15a7366280360b375d57ec1aadb403fe5e836f8fd7cc43cc29b8da0a88`

## Ownership boundary

`src/shared/background/sync-pending-journal.js` owns only:

- cross-Space durable journal schema-version handling;
- validation and oldest-first enumeration of pending cross-Space intent/transaction records;
- background-owned cross-Space journal write/advance/clear mechanics;
- cumulative local-mutation journal validation/read/clear;
- combined authority-transition cleanup of both pending-journal families;
- durable cross-Space journal-key construction.

`src/shared/core/storage.js` remains the owner of atomic initial journal creation together with authoritative local state. `background-core.js` remains the effectful orchestrator for retry timing, destination-first cross-Space publication, `storage.sync`, reconciliation, complete-profile publication, metadata and alarms.

## Required invariants

- no additional browser storage read/write compared with 1.32.0.1;
- initial local state + pending mutation/intent remains one atomic `storage.local.set(...)` transaction in `core/storage.js`;
- cross-Space destination-first publication order remains unchanged;
- an older successful local-journal retry cannot clear newer pending work;
- 1.31.5 fail-closed read/remove semantics remain unchanged;
- no `storage.sync`, Recovery generation logic, scheduling/network/DOM ownership moves into the journal module;
- journal schemas and Sync/Recovery wire formats remain unchanged;
- no new feature, permission, CSP, browser floor, startup dependency or New Tab first-paint work.

## Regression proof

- New Step-3 focused ownership/behavior regressions: **9 / 9 passing**.
- The same regressions were run against untouched certified 1.32.0.1 before the extraction and failed **9 / 9**, proving that they specifically detect the new ownership boundary.
- Focused historical cross-Space/local-journal/catastrophic-loss/1.31.5 fault-injection set: **95 / 95 passing**.
- Full regression suite: **1041 / 1041 passing**.
- Sync targeted group: **199 / 199 passing**.
- Release targeted group: **160 / 160 passing**.

## Runtime / performance / size gates

- Runtime reachability: clean high-confidence result; no unreachable shared modules, unused named imports or unreferenced private functions.
- Performance benchmark: completed successfully with the existing 1.32.0.1 benchmark contract; this extraction adds no storage I/O, Sync write, Promise layer, timer, queue, startup dependency or New Tab work.
- Package-size contract: pass.
- Firefox generated runtime: 2,238,323 raw bytes / 658,388 deflated payload bytes.
  - Versus 1.32.0.1: +1,360 raw bytes (**+0.0608%**) / +880 deflated bytes (**+0.1338%**).
- Chrome generated runtime: 2,259,965 raw bytes / 672,904 deflated payload bytes.
  - Versus 1.32.0.1: +1,360 raw bytes (**+0.0602%**) / +880 deflated bytes (**+0.1309%**).
- The small increase is the dedicated 125-line ownership module/import boundary; `background-core.js` falls to 6,252 lines. No runtime operation was added.

## Browser-smoke availability

Probe result in the certification environment:

- Chromium: available at `/usr/bin/chromium`;
- Xvfb: available;
- ChromeDriver: unavailable;
- Firefox: unavailable;
- GeckoDriver: unavailable.

Therefore real Firefox/Chromium WebDriver smoke cannot be claimed for this release. Certification level is **MECHANICAL_ONLY** unless the final certification environment changes.

## Final certification

Completed. The final source tree passed mechanical certification, including full regression, reachability, benchmark, package-size contract, generated/package contracts, deterministic packaging, clean-room rebuild/retest/repackage and byte-for-byte artifact comparison. Real-browser WebDriver smoke was unavailable in the certification environment, so the certification level is **MECHANICAL_ONLY**.

## Final scope verdict

**PASS:** the Step-3 boundary is narrow, behavior-preserving and mechanically certified.

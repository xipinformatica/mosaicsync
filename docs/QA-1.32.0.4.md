# MosaicSync 1.32.0.4 QA / release-candidate checklist

## Scope

Finalize the held **3rd Maintainability Journey — Ownership & Auditability Step 5** Bookmarks controller extraction and correct the pre-existing durable Normal Sync concurrency defect discovered by the deep forensic audit before Step 6. No additional maintainability extraction or behavioral optimization is included.

## Corrective invariants

- authoritative local state and initial pending outbound intent remain atomic in `core/storage.js`;
- conditional local-journal acknowledgement cannot delete a newer journal written after the acknowledgement began;
- authority-transition cleanup cannot intentionally clear only one durable journal class;
- a concurrent local writer cannot create fresh outbound journal authority during an authority transition: combined cleanup and the durable metadata commit remain under one serialized lock span, without a nested Web-Lock request;
- stale queued New Tab writes still preserve the user's local edit but must recheck durable Sync enable/initialized authority before creating outbound retry intent;
- durable journal read/remove failures remain fail-closed;
- no additional browser-storage operation, Sync write, network request, serialization pass, timer, Promise layer, DOM traversal, image decode or first-paint await is introduced.

## Retained Step-5 invariants

- `bookmarks-controller.js` owns only the Bookmarks dialog UI lifecycle;
- browser Bookmarks API remains lazy-loaded;
- bookmark folder-color hydration remains post-paint;
- startup/first-paint ownership remains in `newtab.js`;
- generated Firefox/Chrome-shaped behavior remains equivalent.

## Regression proof

- New 1.32.0.4 race/fault regressions: **7 / 7 passing** after correction.
- The same seven regressions were proven **7 / 7 failing** on the vulnerable 1.32.0.3 candidate before the correction.
- Focused journal/fault/permission set after correction: **40 / 40 passing**.
- Recovery targeted group after correction: **119 / 119 passing**.
- Step-5 Bookmarks ownership regressions remain **10 / 10 passing**.

Final release-candidate verification:

- Full regression suite: **1058 / 1058 passing**.
- Sync targeted group: **206 / 206 passing**.
- Recovery targeted group: **119 / 119 passing**.
- Release targeted group: **177 / 177 passing**.
- Runtime reachability: **clean**.
- Performance benchmark: **pass**.
- Package-size contract: **pass**.
- Generated and packaged release contracts: **pass**.
- Clean-source rebuild/retest/repackage: **pass**.
- Firefox ZIP, Chrome ZIP, GitHub-ready source ZIP and build manifest: **reproduced byte-for-byte**.


## Performance / package budget

The correction reuses the established local persistence Web Lock and adds `LOCAL_META_KEY` only to the key list of an already-existing persistence `storage.local.get(...)` transaction for Sync-relevant writes. It does not add a storage operation. Authority cleanup replaces multiple independent removals with one combined `storage.local.remove([...keys])` call.

Relative to the 1.32.0.3 candidate before final documentation/package regeneration, generated runtime delta was approximately **+2,618 raw bytes / +751 deflated bytes for Firefox** and **+2,618 raw / +750 deflated bytes for Chrome** (about **+0.11% compressed**). The retained Bookmarks controller is unchanged from the audited 1.32.0.3 candidate.

## Browser-smoke availability

Real-browser smoke must be reported only if actually run. The latest environment probe before final certification found Chromium/Xvfb available but no ChromeDriver, and Firefox/GeckoDriver unavailable; if unchanged, certification remains **MECHANICAL_ONLY**.

## Certification status

**MECHANICAL_ONLY — complete.**

The environment probe found Chromium and Xvfb, but no ChromeDriver; Firefox and GeckoDriver were unavailable. Real-browser smoke was therefore not executed and is not claimed. The project certifier completed canonical build, full tests, reachability, benchmark, size, generated contracts, deterministic packaging, packaged contracts, independent clean-room rebuild/retest/repackage and byte-for-byte artifact comparison.

# MosaicSync 1.30.18.13 QA / release-candidate checklist

## Automated/package/reproducibility gates

- [x] Full Node regression suite passes: **840/840** on the working source and again from a fresh GitHub-ready extraction.
- [x] Performance benchmark completes on the working source and fresh extraction. Representative working-source values: `normalizeState(200)` 85.236 ms, `stableStringify(200)` 27.987 ms, `projectStateToLocalAssets(200)` 54.724 ms, `createWriteBaseline(200)` 80.609 ms, active-Space hydration 0.052 ms, normalized Settings fast path 0.007 ms.
- [x] Package-size baseline was consciously reviewed and stamped for 1.30.18.13: Firefox **630,045** deflated payload bytes; Chrome **644,594**.
- [x] 33 UI locales contain the complete **431-key** catalog with matching placeholders.
- [x] Device-name normalization is bounded to 64 characters and stable device IDs survive renames.
- [x] Firefox and Chrome stale full-record metadata writes cannot roll back a newer device rename.
- [x] Device-name Sync records contain attribution metadata only; name-only deliveries cannot trigger layout reconciliation or populate the layout expected-change ledger.
- [x] Welcome commits the chosen device name before enabling the first Sync publication.
- [x] Existing installations initialize fallback device naming only after first paint.
- [x] Settings uses the source dataset timestamp and keeps local receipt time semantically separate.
- [x] State/meta/Sync schemas remain **19 / 12 / 11**; the persisted Web Lock identity is unchanged.
- [x] Firefox and Chrome permissions/CSP are unchanged from 1.30.18.12 apart from release identity.
- [x] Production packaging completes and the GitHub-ready source contains no nested ZIPs, `node_modules`, Python caches, diagnostics or temporary certification workflow.
- [x] Fresh GitHub-ready extraction reproduces Firefox, Chrome and GitHub-ready archives byte-for-byte.

## Clean-source benchmark record

The first clean-source benchmark completed independently after the complete 840/840 test run. Representative values were: `normalizeState(200)` 88.132 ms, `stableStringify(200)` 29.416 ms, `projectStateToLocalAssets(200)` 58.910 ms, `createWriteBaseline(200)` 82.115 ms, active-Space hydration 0.051 ms, normalized flatten fast path 0.598 ms, normalized Settings fast path 0.007 ms, and cross-Space normalized move+intent 1.718 ms. These variations are consistent with normal benchmark noise and do not indicate a startup regression.

## Manual browser gates — intentionally not claimed by automated certification

- [ ] Fresh Welcome: choose Sync, rename the suggested device name, finish setup and verify the name appears in Settings.
- [ ] Existing installation upgrade: fallback name appears without delaying or changing New Tab first paint.
- [ ] Rename this device in Settings; Save/Cancel/Enter/Escape behavior and button alignment are correct in Dark and Light modes.
- [ ] Two real synchronized computers: make a layout change on the named source device and verify the receiving device shows the source name and source time; receipt time is separate when shown.
- [ ] Firefox and Chrome: verify the Settings card remains cohesive at desktop and narrow widths.

## Release state

**Automated/source/package certification passed. Physical interactive browser checks remain intentionally unclaimed.**

# MosaicSync 1.32.0.7 QA / release-candidate checklist

## Scope

Single-purpose corrective release from 1.32.0.6. Close only the independently reproduced first-Sync stale-cached-meta durability window. No new maintainability extraction or feature work.

## Permanent 1.32.0.7 regression

- `tests/corrective-13207.test.mjs`
- Baseline proof: the Firefox- and Chromium-shaped cases both fail on untouched 1.32.0.6 because the late user edit has no durable pending journal.
- Candidate proof: both pass after correction.
- Injection point is after 1.32.0.6's post-initialization bootstrap local-state reread, while durable Sync authority is initialized but an already-open New Tab may still hold stale cached metadata.

## Intended production delta

- Genuine New Tab user mutations identify themselves as Normal-Sync-eligible independently of cached `meta.syncEnabled` / `meta.syncInitialized` state.
- `core/storage.js` retains authority over whether durability is actually active by re-reading durable `LOCAL_META_KEY` inside the existing persistence write lock.
- Eligible user mutations receive cumulative pending-journal protection only when durable Sync authority is enabled+initialized.
- Cache-only/device-local writes remain excluded.
- Dedicated cross-Space transaction intent remains separate; when a stale page cannot yet construct that intent, ordinary cumulative pending-journal authority still protects the user mutation.
- No additional bootstrap reread is introduced.

## Performance / architecture contract

- No first-paint, New Tab startup, image decode, DOM traversal or network-path change.
- No new ordinary Sync write.
- User mutation persistence may include `LOCAL_META_KEY` in the same existing `storage.local.get(...)` transaction even when the page cache believes Sync is inactive; this changes key coverage, not I/O count, and occurs only on actual user persistence.
- No new module, permission, persisted schema, Sync/Recovery format or browser floor.

## Final certification

- Full regression suite: **1078 / 1078 passing**.
- Startup group: **168 / 168 passing**.
- New Tab group: **327 / 327 passing**.
- Sync group: **222 / 222 passing**.
- Recovery group: **119 / 119 passing**.
- Security group: **113 / 113 passing**.
- Browser/parity group: **178 / 178 passing**.
- Core group: **115 / 115 passing**.
- Release group: **197 / 197 passing**.
- `tests/corrective-13207.test.mjs`: **3 / 3 passing**; its two runtime cases are proven red on untouched 1.32.0.6.
- Adversarial concurrency cluster (`corrective-13204` + `corrective-13206` + `corrective-13207`): **23 / 23 passing across 10 consecutive runs**.
- Runtime reachability: clean — zero unreachable shared modules, zero unused named imports, zero unreferenced private functions.
- Performance benchmark: pass; no first-paint/startup path change and no additional ordinary Sync write.
- Runtime size: Firefox **2,246,506 raw / 661,391 deflated bytes**; Chrome **2,268,148 raw / 675,907 deflated bytes** — **186 raw bytes and 3 deflated bytes smaller per browser than 1.32.0.6**.
- Browser probe: Chromium and Xvfb available; ChromeDriver unavailable; Firefox and GeckoDriver unavailable. Certification is therefore **MECHANICAL_ONLY** and no real-browser smoke is claimed.
- Clean-source rebuild/retest/repackage and byte-for-byte artifact reproduction are mandatory final gates.

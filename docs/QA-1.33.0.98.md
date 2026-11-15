# MosaicSync 1.33.0.98 QA / release-candidate checklist

Baseline: independently Grok-approved private MosaicSync 1.33.0.97 Slice 18 source. Version-only promotion to 1.33.0.98: no intended product-behavior changes.

- [ ] 1.33.0.98 source and Firefox/Chrome manifests, runtime constants, New Tab markup, changelog, README and build-manifest show the identical version.
- [ ] Compare 1.33.0.98 runtime with approved Slice 18; only version identity files should differ.
- [ ] Full Node test suite, inventory, build manifests, Firefox/Chrome release contracts and clean-room reproducibility PASS.
- [ ] Confirm the release archive includes the Slice 18 test-timing corrective and no accidental generated stale artifacts.
- [ ] Run exact-build real Firefox and Chromium New Tab smoke tests: initial paint, Bookmarks first click, Settings first open, Recovery dialog close/reopen and deletion feedback, pointer/keyboard help tooltip behavior.
- [ ] Check no new permissions, optional permissions, Sync/Recovery formats, network endpoints, storage migration or translations.
- [ ] Run GitHub release gate for the exact publication commit (user controlled; never run or publish automatically).
- [ ] Signed-in multi-device Sync / Recovery checks remain recommended and are not implied by the Node suite.

The private modernization audit proves behavioral contracts under controlled runners but does not measure real-browser first paint or confirm all interactive behavior in a live extension. Public release is on HOLD until the user approves exact-build browser/release checks.

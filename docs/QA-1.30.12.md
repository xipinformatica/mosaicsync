# MosaicSync 1.30.12 QA / release-candidate checklist

## Scope

1.30.12 is an update/reinstall data-preservation hardening release. It removes the destructive `reason === "install"` reset path, relies on the ordinary durable-storage initializer for genuine first-install defaults, and introduces a separately identified Firefox development package for routine temporary testing.

## Automated release gates

- [x] Full Node regression suite passes after final 1.30.12 identity/build.
- [x] Performance benchmark passes with 1.30.10 snapshot-cache and 1.30.9 trusted-state guards retained.
- [x] Package-size guard passes with reviewed 1.30.12 baseline.
- [x] Firefox and Chrome version identity is exactly `1.30.12` everywhere.
- [x] Production Firefox Gecko ID remains exactly `mosaicsync@xipinformatica.cat`.
- [x] Development Firefox package uses exactly `mosaicsync-dev@xipinformatica.cat`, visible `MosaicSync Dev` naming, and does not mutate the production dist tree.
- [x] Firefox and Chrome public package hygiene passes.
- [x] Clean GitHub-ready extraction passes the full suite and benchmark.
- [x] Clean source rebuilds Firefox/Chrome/GitHub-ready release ZIPs byte-for-byte identically.
- [x] Public packaging emits exactly three release ZIPs: `mosaicsync-1.30.12-firefox.zip`, `mosaicsync-1.30.12-chrome.zip`, `mosaicsync-1.30.12-github-ready.zip`. The separately generated dev-only Firefox temporary ZIP is not a release artifact.

## Mandatory lifecycle preservation coverage

- [x] `runtime.onInstalled(reason="install")` contains no metadata reset branch, local-key deletion, pending-Sync recovery clear, or icon-recovery clear.
- [x] False install + completed onboarding/ready Sync preserves semantic Personal and Work layout.
- [x] False install + completed onboarding/ready Sync preserves device ID, Sync enablement/initialization/bootstrap/status, protection state, applied Personal/Work/device/profile revisions and remote-receipt bookkeeping.
- [x] False install + incomplete onboarding/waiting-for-Sync preserves the waiting bootstrap, wait timestamp, remote-receipt evidence and local draft; Welcome may still foreground without resetting those fields.
- [x] Genuine empty install still materializes normal default local state/meta, generates a device ID, leaves Sync off and onboarding incomplete, and opens Welcome.
- [x] Normal update from 1.30.10 preserves semantic local layout and lifecycle/Sync identity.
- [x] Downgrade/re-upgrade-shaped `update` event preserves semantic local layout and lifecycle/Sync identity.
- [x] Firefox and Chrome run the same lifecycle semantics.

## Mandatory development-identity coverage

- [x] Public source Firefox manifest retains production Gecko ID `mosaicsync@xipinformatica.cat`.
- [x] Dev packager refuses to proceed if the production Gecko ID has drifted.
- [x] Dev packager writes only an in-package manifest override with `mosaicsync-dev@xipinformatica.cat` and `MosaicSync Dev`; production `dist/firefox/manifest.json` remains unchanged.
- [x] Generated dev-only temporary ZIP inspected to confirm ID/name isolation and deterministic output.

## Required real Firefox/AMO checks — mandatory before broad rollout

- [ ] On a disposable Firefox profile, install the currently signed AMO 1.30.10 and create recognizable Personal + Work shortcuts, Settings changes, and Sync state.
- [ ] Update to a **Mozilla-signed AMO 1.30.12** using Firefox's normal Add-ons Manager / Check for Updates path; confirm MosaicSync remains installed and no Welcome/reset appears.
- [ ] Restart Firefox immediately after the signed update; confirm both Spaces, Settings, Sync status, device identity and local-only artwork remain present.
- [ ] Repeat a normal automatic signed update path if feasible.
- [ ] On macOS Firefox, repeat the signed 1.30.10 → 1.30.12 update on a disposable profile before broad rollout.
- [ ] On Windows Firefox, repeat the signed 1.30.10 → 1.30.12 update on a disposable profile before broad rollout.
- [ ] Verify 1.30.11's live wallpaper/darkness preview remains immediate and Settings does not blank during repeated Separate Light/Dark changes.

## Important limitation

1.30.12 prevents MosaicSync itself from resetting surviving durable data because of an ambiguous browser lifecycle reason. It cannot preserve `storage.local` after Firefox has actually deleted the extension storage namespace; recovery in that case still depends on browser Sync/profile backup behavior. The signed-AMO update checks above therefore remain mandatory and must not be replaced by automated unit tests or an unsigned same-ID temporary install.

## Automated result

- Working-tree regression suite: **627/627 passed**.
- Clean GitHub-ready extraction regression suite: **627/627 passed**.
- Performance benchmark: **PASS** on the working tree and clean extracted source. The validated startup memo and normalized trusted-state fast paths remain materially faster than their defensive trust-boundary equivalents; the 1.30.10 verified snapshot cache and prior Sync correctness guards remain intact.
- Package-size baseline/gate: **PASS**. Firefox runtime is **1,967,819 raw / 589,225 deflated bytes**; Chrome runtime is **1,988,283 raw / 603,692 deflated bytes**. The lifecycle hardening is slightly smaller than 1.30.11 because the destructive reset block was removed.
- Public deterministic package hashes before final documentation stamping: Firefox `d9bcd5be1b9a2ce57fca6e1d61efe9b81676947e7e6d07cbf21a7d12d853fc88`; Chrome `745d08d3f9d28a61a37126e528a698d89bd3f07afa2fbe147891ca12b02d0f3a`. Runtime hashes are unaffected by QA-document edits.
- Development-only Firefox temporary package was generated and inspected as `MosaicSync Dev` / `mosaicsync-dev@xipinformatica.cat`; its deterministic pre-stamp SHA-256 is `ad10a0808e455a95c8d1e2565589fb27b516c6f83d9392f595835ee33ae333df`.
- Clean-source pre-stamp rebuild reproduced Firefox, Chrome, GitHub-ready source and development-only temporary ZIPs **byte-for-byte**.
- Signed AMO update checks remain intentionally **manual and pending**; they are not claimed as passed by automated testing.

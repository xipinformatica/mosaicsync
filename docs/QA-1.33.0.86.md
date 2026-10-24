# MosaicSync 1.33.0.86 QA / release-candidate checklist

**Release packaging prepared. Independent technical audit GO. Publication and exact-commit CI remain owner-controlled.**

## Source and scope
- Authoritative implementation baseline: 1.33.0.85 GitHub-ready source, SHA-256 `e87836a5d83d74e2a6f5281ee8e6427898dbb99feb3f3a04aff9237412816a85`.
- Production code change: only the optional conventional Apple Touch probe in `src/shared/background/background-core.js` during an existing quality-preferring favicon scan, limited to candidates under 128px.
- No ranking, storage, Sync/Recovery, naming, privacy, permissions, or Stage 3B protocol changes.
- The `DEVELOPER-GUIDE.md` fingerprint remains `e18406e412a7ab2132d47aaa1511b305756e7944e51050b31459d753ca2e593e`.

## Verified technical checks
- Development full regression suite: **1,685/1,685 PASS**.
- Original private candidate clean-room suite: **1,685/1,685 PASS**.
- Test inventory: **239 labeled primary files**, PASS.
- New Yorker-style Chrome and Firefox background fixtures: 64px ICO can upgrade to 180px Apple icon; missing/failed optional probe is non-destructive; 128px+ images do not trigger the probe.
- Adversarial checks independently completed by Claude: **25/25 PASS**; full-suite **1,685/1,685 PASS**.
- Independent real Chromium comparison: local stand-in website, .85 retained a 64px ICO and .86 selected the 180px artwork. **Not** a live newyorker.com acceptance test.
- Rebuilt runtime ZIPs reproduce the original privately audited runtime bytes. This published-source ZIP additionally includes release documentation, so its source SHA-256 intentionally differs from the privately audited source ZIP.

## Publication gates and disclosures
- Independent Claude audit: **GO**.
- Exact-commit GitHub six-job gate: **NOT PERFORMED** for the public-release source archive at packaging time.
- Real signed-in two-device acceptance: **NOT PERFORMED — owner-waived**.
- Production New Yorker Apple-icon URL: **NOT VERIFIED**; manual choice remains possible.
- No GitHub writes, tag, release, store upload or signed submission performed in this packaging step.

## Known limitations
- The optional probe checks the single root `/apple-touch-icon.png` location, not every undisclosed icon URL.
- Existing shortcuts await their next eligible quality check; automatic styling improvement is not instantaneous for all installed users.
- No visual-content scoring; existing source and size ranking continues to decide the winning icon.
- The older offline-device Sync reset limitation remains; Stage 3B remains archived.

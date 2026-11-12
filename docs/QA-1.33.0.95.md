# MosaicSync 1.33.0.95 QA / release-candidate checklist

**PRIVATE BUILT RELEASE CANDIDATE — no GitHub/store writes without explicit authorization.**

## Source provenance

- Original .94 ROUND3 GitHub-ready source SHA-256: `a86840a9053a9a39582adc486237a3f27dd9cb20d01fe3d62d21a2914460fc77`.
- Approved P3-polished combined language patch SHA-256: `d4765ccde30b373d7b72ab7fe52f361d21c5725a1a72acaabb13c48bf5d5d42f`.
- Apply that patch once, then update canonical version, manifests and user/developer changelogs for 1.33.0.95.
- Preserve `DEVELOPER-GUIDE.md`, `src/shared/background/`, Sync/Recovery protocols, storage formats, permissions, CSP and analytics policy.

## Validation needed on exact .95

- [ ] Single-command `npm test` including deterministic builds and test inventory, all passing.
- [ ] 34 language catalogs × 495 keys, matching placeholders, unique English values and no cross-browser UI naming leaks.
- [ ] `build-manifest.json` matches both regenerated browser runtime trees.
- [ ] Version `1.33.0.95` matches all identity surfaces, including Chrome `version_name` and both in-app Settings headings.
- [ ] Release contract validation for Firefox and Chrome generated trees and ZIPs.
- [ ] Deterministic source/Firefox/Chrome packaging, ZIP integrity, canonical SHA-256 listing and package-size baseline.
- [ ] Real-browser smoke on exact packages, where browser drivers are available; separate independent release review before publishing.
- [ ] Real signed-in multi-device Sync remains UNVERIFIED until explicitly tested; do not infer from simulations.

## Independent language review already completed on .94 patch before version bump

- Claude approved P3-polished language changes with 1,745/1,745 tests and Chromium/Firefox UI checks against the original patched `.94` source. That approval does not automatically certify the .95 release archives.
- Outstanding native-speaker/Firefox ESR/screen-reader/Windows rendering checks are documented separately.
